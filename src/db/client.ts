import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3-multiple-ciphers";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { loadConfig } from "../config";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;

const MIGRATIONS_FOLDER = `${__dirname}/../../drizzle`;

let connection: Database.Database | undefined;
let db: Db | undefined;

/**
 * The single shared database handle. Opens the encrypted SQLite file (SQLCipher
 * via better-sqlite3-multiple-ciphers), applies migrations, and memoises the
 * Drizzle wrapper. Fails fast if `DB_ENCRYPTION_KEY` is missing (via loadConfig).
 */
export const getDb = (): Db => {
	if (db) {
		return db;
	}

	const { databasePath, databaseEncryptionKey } = loadConfig();
	if (databasePath !== ":memory:") {
		mkdirSync(dirname(databasePath), { recursive: true });
	}

	connection = new Database(databasePath);
	if (databasePath === ":memory:") {
		// An in-memory database never touches disk, so there is nothing to encrypt
		// at rest — SQLCipher rejects a key on it. Used only by the test suite.
		connection.pragma("journal_mode = MEMORY");
	} else {
		// SQLCipher key pragma — every page of the file is encrypted at rest.
		connection.pragma(`key = '${databaseEncryptionKey.replace(/'/g, "''")}'`);
		connection.pragma("journal_mode = WAL");
	}
	connection.pragma("foreign_keys = ON");

	db = drizzle(connection, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	return db;
};

/** Close and forget the shared handle. Used by tests and graceful shutdown paths. */
export const closeDb = (): void => {
	connection?.close();
	connection = undefined;
	db = undefined;
};
