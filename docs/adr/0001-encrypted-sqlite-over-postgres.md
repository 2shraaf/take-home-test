# Encrypted SQLite (Drizzle) over Postgres

**Status:** accepted

The forms this system ingests contain healthcare PII (name, DOB, address, phone). A managed Postgres instance only encrypts data at rest if the *host* is configured to — invisible and unenforced from the application's code. We chose `better-sqlite3-multiple-ciphers` (a SQLCipher-enabled driver) with Drizzle ORM instead: the entire database file is encrypted at rest by construction, transparently to every query, gated by a `DB_ENCRYPTION_KEY` environment variable. This also removes all external infrastructure for anyone reviewing or running the project — `npm install && npm test` with no Docker or cloud database required — while Drizzle's schema-as-TypeScript still gives a fully reviewable schema design.

## Considered Options

- **Postgres + Prisma/Drizzle**: more standard for a production service and handles concurrent writers natively, but PII encryption depends entirely on how the host is configured, and requires Docker/cloud infra just to review the code.
- **Encrypted SQLite + Drizzle** (chosen): PII encryption is true by construction, zero-infra to run, but is single-writer (mitigated — see ADR-0002) and would need migration to Postgres for a genuinely multi-instance production deployment.

## Consequences

- Column-level filtering/indexing is unaffected — SQLCipher encrypts at the page level, not per-column, so no query changes were needed to get encryption.
- A future move to Postgres is a real migration (column-type differences: no native UUID/JSONB in SQLite), not a config flag — acceptable since this system runs as a single process at this scale.
