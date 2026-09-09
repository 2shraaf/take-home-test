# AGENTS.md

Form ingestion pipeline: Express + TypeScript + encrypted SQLite (Drizzle), an
in-process consumer, no external infrastructure. Orientation and a file-by-file
map are in [`README.md`](README.md). Read these before changing behaviour:

- [`CONTEXT.md`](CONTEXT.md) — the domain glossary. Use its terms; it also lists
  the synonyms to avoid (`worker`, `reprocess`, `resend`, `notification`,
  `dedupe`).
- [`.planning/SPEC.md`](.planning/SPEC.md) — the spec, its decisions, and the
  **Out of Scope** list. That list is deliberate: don't add a health-check,
  graceful shutdown, OpenAPI, an external broker, or Postgres unless asked.
- [`docs/adr/`](docs/adr/) — the three decisions the design rests on.
- [`docs/transform-contract.md`](docs/transform-contract.md) — the business rules
  `src/forms/transform.ts` implements.

## Commands

`npm test`, `npm run typecheck`, `npm run build`, `npm run dev`, and
`npm run db:generate` — defined in `package.json`. Run `typecheck` and the
single affected test file often; run the full `test` suite once before finishing.

## Conventions

- No linter/formatter is configured. Match the surrounding code: tabs,
  semicolons, `snake_case` filenames, `camelCase` functions, `PascalCase` types.
- Import directly from the target file — there are no barrel/index files.
- Structured logging is `log(event, data)` from `src/log.ts` at each pipeline
  transition, not a logging framework.

## Invariants a change must preserve

- Two tables only: `raw_ingests` (durable queue) and `forms` (transformed record
  **plus** the email obligation as columns). The form and its `email_status:
  "pending"` are written in one `db.transaction` — never a later step.
- `session_id` uniqueness is enforced by the database, not a check-then-insert.
- One shared `withRetry` (`src/consumer/retry.ts`) for both geocoding and email.
- The automatic sweep re-attempts `failed_transient` and pending obligations
  only — never `failed_validation` or `possible_duplicate`.
- Retry resumes from the stage the form needs (full pipeline vs. email-only) and
  never creates a second `forms` row.

## Testing

- TDD at the established seams: the pure functions in `src/forms/transform.ts`,
  `withRetry`, the consumer entrypoints (`processIngest` / `deliverEmail` /
  `runSweep`, asserted through DB-visible state), and the HTTP routes (supertest
  against `app`). Assert external behaviour, not internal call counts.
- Tests use an in-memory DB, zero backoff, and `AUTO_TRIGGER_CONSUMER=false`
  (see `tests/setup.ts`); drive the consumer explicitly. Force provider outcomes
  with `forceProvider` from `src/providers/test_control.ts` — the production
  `Math.random()` path stays untouched.

## Gotchas

- `package.json` aliases `better-sqlite3` to `better-sqlite3-multiple-ciphers` so
  Drizzle's driver resolves the SQLCipher build. Keep the alias.
- A `:memory:` database skips the SQLCipher key pragma (in-memory can't be
  encrypted). Only file databases are encrypted at rest.
- Migrations live in `drizzle/` and are applied on startup. After editing
  `src/db/schema.ts`, run `npm run db:generate` — never create tables by hand.
- `dist/` (build output) and `data/` (runtime database) are gitignored.
