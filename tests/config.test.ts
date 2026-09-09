import { loadConfig } from "../src/config";

describe("loadConfig", () => {
	const original = process.env.DB_ENCRYPTION_KEY;

	afterEach(() => {
		process.env.DB_ENCRYPTION_KEY = original;
	});

	it("fails fast when DB_ENCRYPTION_KEY is missing", () => {
		delete process.env.DB_ENCRYPTION_KEY;
		expect(() => loadConfig()).toThrow(/DB_ENCRYPTION_KEY/);
	});

	it("returns config when the required key is present", () => {
		process.env.DB_ENCRYPTION_KEY = "present";
		expect(loadConfig().databaseEncryptionKey).toBe("present");
	});

	it("rejects a non-numeric numeric env var", () => {
		process.env.DB_ENCRYPTION_KEY = "present";
		process.env.RETRY_MAX_ATTEMPTS = "lots";
		expect(() => loadConfig()).toThrow(/RETRY_MAX_ATTEMPTS/);
		delete process.env.RETRY_MAX_ATTEMPTS;
	});
});
