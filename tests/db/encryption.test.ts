import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3-multiple-ciphers";

// Point the shared client at a real file BEFORE importing it, so this test
// exercises on-disk encryption rather than the in-memory default.
const workDir = mkdtempSync(join(tmpdir(), "form-ingestion-enc-"));
const dbPath = join(workDir, "forms.db");
process.env.DB_PATH = dbPath;
process.env.DB_ENCRYPTION_KEY = "a-real-looking-key-for-this-test";

import { closeDb, getDb } from "../../src/db/client";
import { rawIngests } from "../../src/db/schema";

const SQLITE_MAGIC = "SQLite format 3";

afterAll(() => {
	closeDb();
	rmSync(workDir, { recursive: true, force: true });
});

describe("encryption at rest", () => {
	it("writes a file that is not readable as a plaintext SQLite database", () => {
		const db = getDb();
		db.insert(rawIngests)
			.values({
				id: "enc-1",
				sessionId: "session-encryption-check",
				applicationReference: "APP-ENC",
				rawPayload: JSON.stringify({ name: "Alice Plaintext", postcode: "E15 4BZ" }),
				status: "pending",
				createdAt: Date.now(),
				updatedAt: Date.now(),
			})
			.run();
		closeDb();

		const bytes = readFileSync(dbPath);
		// A normal SQLite file begins with the ASCII magic string "SQLite format 3".
		expect(bytes.subarray(0, SQLITE_MAGIC.length).toString("latin1")).not.toBe(SQLITE_MAGIC);
		// None of the PII we wrote should be visible in the raw file.
		expect(bytes.includes(Buffer.from("Alice Plaintext"))).toBe(false);
		expect(bytes.includes(Buffer.from("session-encryption-check"))).toBe(false);
	});

	it("cannot be opened without the correct key", () => {
		const wrong = new Database(dbPath);
		wrong.pragma("key = 'the-wrong-key'");
		expect(() => wrong.prepare("SELECT count(*) FROM raw_ingests").get()).toThrow();
		wrong.close();
	});

	it("can be opened and read with the correct key", () => {
		const right = new Database(dbPath);
		right.pragma("key = 'a-real-looking-key-for-this-test'");
		const row = right.prepare("SELECT session_id FROM raw_ingests WHERE id = 'enc-1'").get() as {
			session_id: string;
		};
		expect(row.session_id).toBe("session-encryption-check");
		right.close();
	});
});
