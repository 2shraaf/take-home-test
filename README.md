# Form Ingestion Pipeline

Ingests healthcare registration forms from an unreliable third party, validates
and transforms them into the schema the FORM-BOT expects, geocodes the postcode,
persists the result, and sends a guaranteed email — while never
handing the FORM-BOT the same form twice and never losing a form to a bad schema
or a processing bug.

The full design rationale is in [`.planning/SPEC.md`](.planning/SPEC.md); the
domain glossary the code follows is in [`CONTEXT.md`](CONTEXT.md).

## Quick start (no external infrastructure)

```bash
npm install
cp .env.example .env          # then edit DB_ENCRYPTION_KEY
npm test                      # full suite — uses an in-memory DB, no setup
npm run dev                   # start the service on http://localhost:3000
```

There is no Docker, Redis, or database server to stand up. The database is an
encrypted SQLite file created on first run.

## Environment variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `DB_ENCRYPTION_KEY` | **yes** | — | SQLCipher key for the at-rest database. The app **fails fast on startup** if it is missing. |
| `DB_PATH` | no | `./data/forms.db` | Database file location. `:memory:` gives an ephemeral, unencrypted DB (used by the test suite). |
| `PORT` | no | `3000` | HTTP port. |
| `RETRY_MAX_ATTEMPTS` | no | `3` | In-pipeline attempts for the geocoding and email calls. |
| `RETRY_BASE_DELAY_MS` | no | `200` | Exponential backoff base: `delay = base * 2^(attempt - 1)`. |
| `SWEEP_INTERVAL_MS` | no | `5000` | Cadence of the interval safety-net sweep. |
| `STALE_LOCK_MS` | no | `30000` | How long a claimed row may sit before a sweep reclaims it as crashed. |
| `AUTO_TRIGGER_CONSUMER` | no | `true` | Whether a successful ingest immediately kicks the consumer (tests set this `false` and drive processing explicitly). |

`.env` is loaded automatically via `dotenv`.

## HTTP API

| Method & path | Purpose | Success |
| --- | --- | --- |
| `POST /ingest` | Durably capture a raw payload, then return without waiting for processing. | `202 Accepted` with `{ id, sessionId, status }` |
| `GET /forms/:sessionId` | Current processing status for a form. | `200` with status, retry count, captured errors, email state |
| `POST /retry/:sessionId` | Manually retry one failed form; resumes from whatever stage it needs. | `200` with the new status |
| `POST /retry` | Manually retry every currently-failed form (use right after a fix ships). | `200` with `{ retried }` |

Error responses: `400` (payload has no `session_id`), `404` (unknown session
identifier), `409` (duplicate `session_id`).

## How it works

```
POST /ingest ──▶ raw_ingests (durable, encrypted, session_id UNIQUE) ──▶ 202
                        │
                        ▼  (event trigger + interval sweep)
                    Consumer:  validate ─▶ identity check (ADR-0003)
                               ─▶ transform ─▶ geocode (retry+backoff)
                               ─▶ persist form + email obligation  ← one transaction
                               ─▶ send email (same retry+backoff helper)
```

- **Two tables.** `raw_ingests` is the durable queue and recovery source;
  `forms` holds the transformed FORM-BOT-ready record plus the email-delivery
  obligation as columns written in the *same* transaction as the form.
- **Processing states:** `pending`, `processing`, `failed_validation` (terminal
  until a code fix ships — never auto-retried), `failed_transient` (downstream
  geocode/email failure — auto-retried), `possible_duplicate` (an
  `application_reference` reused under a different `session_id` — flagged for
  review), `complete`.
- **One shared retry-with-backoff helper** (`src/consumer/retry.ts`) is used
  identically for geocoding and email.
- **Recovery.** On startup, anything left `processing` from a crash is picked
  back up. The interval sweep also reclaims rows whose consumer pass crashed
  while holding the claim, and re-attempts due `failed_transient` ingests and
  pending email obligations — never `failed_validation`.
- **`possible_duplicate` is a review state, not a failure.** It is queryable via
  `GET /forms/:sessionId` but not touched by the automatic sweep or `POST /retry`
  (bulk). Resolving one — deciding whether the reused `application_reference` is a
  genuine re-delivery — is a deliberate human/ops step; `POST /retry/:sessionId`
  re-evaluates it against current data once that decision is acted on. See
  [ADR-0003](docs/adr/0003-duplicate-identity-strategy.md).
- **Migrations.** The schema is defined in `src/db/schema.ts` and applied from
  the checked-in SQL in `drizzle/` on startup (`npm run db:generate` to
  regenerate after a schema change).
- **`better-sqlite3` alias.** `package.json` aliases `better-sqlite3` to
  `better-sqlite3-multiple-ciphers` so Drizzle's driver resolves the SQLCipher
  build; there is only one native module installed.

## Project layout

Every source file has one responsibility. Filenames are `snake_case`, functions
`camelCase`, types `PascalCase`; modules import directly from their target file
(no barrels).

```
src/
  index.ts              Process entrypoint: load config → open+migrate DB → startConsumer → listen.
  app.ts                Express app and the four routes. No business logic — delegates to forms/ + consumer/.
  config.ts             loadConfig(): parse + validate env; throws if DB_ENCRYPTION_KEY is missing.
  log.ts                log(event, data): one-line JSON to stdout at each pipeline transition. Silent under NODE_ENV=test.
  errors.ts             messageOf(unknown): narrow a thrown value to a string.

  db/
    schema.ts           Drizzle table definitions (raw_ingests, forms) + the IngestStatus union. Single source of truth for the schema.
    client.ts           getDb(): open the encrypted SQLite file, apply migrations, memoise the Drizzle handle. closeDb() for tests/shutdown.

  forms/
    schemas/ingested_schema.ts     IngestedFormSchema type — the third party's payload shape (snake_case).
    schemas/transformed_schema.ts  TransformedFormSchema type — the FORM-BOT-ready shape (camelCase).
    validate.ts         validateIngestedForm(unknown): Zod check against the agreed schema. Never throws; returns { ok, value | error }.
    transform.ts         Pure transform rules — splitName, mapGender, parseDateOfBirth, flattenAddress, and transformForm composing them. Implements docs/transform-contract.md.
    form_record.ts       buildFormRow(transformed, extras): map a transform result + geocode output onto a `forms` insert row.
    ingest.ts            ingestRawPayload(unknown): the only place a raw_ingests row is created. Enforces session_id presence + DB-level uniqueness.
    examples/*.json      Sample third-party payloads (used by the validator tests).

  consumer/
    retry.ts            withRetry(operation, opts) + backoffDelayMs + RetryExhaustedError. The one shared retry-with-backoff, used identically for geocode and email.
    consumer.ts         The consumer. processIngest (claim → validate → ADR-0003 identity check → transform → geocode → persist form+obligation → email),
                        deliverEmail (leased, idempotent), runSweep, recoverInProgress, startConsumer/stopConsumer, triggerProcessing, retryIngest, retryAllFailed.

  providers/
    httpresponse.ts     HttpResponse<T> envelope type returned by every provider.
    idealpostcodes.ts   lookupPostcode(postcode): mock geocoding provider (95% success, 1s latency).
    sendgrid.ts         sendEmail({to,from,subject,body}): mock email provider (95% success, 1s latency).
    test_control.ts     Test-only seam: forceProvider / resetProviders + resolveProviderBehaviour (shared by both providers). Production path is untouched.

tests/
  setup.ts              jest setupFiles: in-memory DB, zero backoff, AUTO_TRIGGER_CONSUMER=false.
  helpers/db.ts         resetDb() — truncate both tables between tests.
  helpers/factories.ts  makeIngestedForm(overrides) — valid-payload factory with unique ids.
  forms/transform.test.ts       Transform-rule units, incl. single-token name and malformed / offset dates.
  forms/validate.test.ts        Schema validation: happy path, drift, optional fields.
  consumer/retry.test.ts        withRetry: success / exhaustion / recovery / onRetry.
  consumer/consumer.test.ts     The pipeline via DB-visible state — tickets 04/05/06, incl. crash-atomicity, the claim race, no-double-send, and startup/trigger wiring.
  providers/test_control.test.ts Deterministic seam + "production is still flaky" check.
  db/encryption.test.ts         File is not plaintext SQLite; wrong key throws; right key reads.
  config.test.ts                loadConfig fail-fast + numeric parsing.
  app.test.ts                   HTTP endpoints via supertest.

drizzle/                Generated migration SQL + journal. Applied on startup. Regenerate with `npm run db:generate` after editing db/schema.ts.
drizzle.config.ts       drizzle-kit config (dialect, schema path, out dir).
tsconfig.json           Typecheck config (src + tests).
tsconfig.build.json     Build config (src only — keeps test files out of dist/).
CONTEXT.md              Domain glossary. The authoritative vocabulary the code uses.
docs/adr/               The three architecture decisions (encrypted SQLite, DB-backed queue, duplicate identity).
docs/transform-contract.md  The business-rule contract transform.ts implements.
.planning/              Spec, codebase map, research. Background — not build inputs.
```

## Reading the code

Follow the pipeline in this order:

1. **`CONTEXT.md`** — the vocabulary every other file uses.
2. **`src/db/schema.ts`** — the two tables and the status lifecycle
   (`pending → processing → { failed_validation | failed_transient | possible_duplicate | complete }`).
3. **`src/forms/transform.ts`** with **`docs/transform-contract.md`** beside it —
   the pure business rules.
4. **`src/consumer/consumer.ts`**, `processIngest` — the orchestration that ties
   validate → transform → geocode → persist → email together, plus the claim /
   lease / recovery mechanics.
5. **`src/app.ts`** — the thin HTTP layer over all of the above.

The `forms` row carries the email obligation as columns
(`email_status`, `email_retry_count`, `email_next_attempt_at`, `email_last_error`,
`email_last_attempt_at`, `email_sent_at`) written in the **same INSERT** as the
form, so a form can never exist without its obligation. `email_next_attempt_at`
doubles as a short lease so an in-flight send and a concurrent sweep can't deliver
twice. `raw_ingests.locked_at` is the equivalent claim marker for the ingest.

## Tests

```bash
npm test           # jest, ~80 tests, in-memory DB, no external services
npm run typecheck  # tsc --noEmit
```

Test seams: the pure transform functions (input/output pairs), the shared retry
helper, the consumer's directly-callable `processIngest`/`deliverEmail`/`runSweep`
(asserted through DB-visible state), and the HTTP endpoints (supertest against
`app`). The geocoding and email providers keep their real `Math.random()` flakiness
in production; `src/providers/test_control.ts` is a test-only seam to force
outcomes deterministically.

## Scope and future work

Deliberately excluded from this take-home, with the reasoning recorded in ADRs:

- **No Postgres / external database server.** Encrypted SQLite via
  `better-sqlite3-multiple-ciphers` + Drizzle gives PII-encryption-at-rest *by
  construction* and zero-infra review. A move to Postgres is a real migration,
  not a config flag. See
  [ADR-0001](docs/adr/0001-encrypted-sqlite-over-postgres.md).
- **No external message broker / job-queue library (e.g. BullMQ).** BullMQ
  requires Redis with no exception, reintroducing the infrastructure ADR-0001
  avoids. A database-backed polling consumer covers the retry/backoff/dedup needs
  at this scale in ~a few hundred lines of reviewable application code. See
  [ADR-0002](docs/adr/0002-db-backed-queue-not-external-broker.md) and the
  supporting research in
  [`.planning/research/bullmq-vs-db-queue.md`](.planning/research/bullmq-vs-db-queue.md).
- **Duplicate identity: `session_id` enforced, `application_reference` flagged.**
  The third party's field semantics aren't documented; rather than guess,
  `session_id` is the DB-enforced uniqueness key and a reused
  `application_reference` under a different `session_id` is flagged into
  `possible_duplicate` for a human, not auto-resolved either way. See
  [ADR-0003](docs/adr/0003-duplicate-identity-strategy.md).
- **Also out of scope:** column-level / KMS-managed encryption (whole-database
  encryption is used instead), error-tracking/observability platforms, a
  health-check endpoint, graceful-shutdown handling, API documentation
  generation, a separate worker process or scheduler, and general-purpose name
  parsing (the last-whitespace split is a documented pragmatic limitation —
  single-token names are flagged, not failed).

## Original brief

The task as received is preserved in
[`.planning/SPEC.md`](.planning/SPEC.md)'s problem statement and the git history
(`d9b7527`). In short: ingest forms via `/ingest`, conform to
`ingested_schema.ts`, geocode the postcode, transform to `transformed_schema.ts`,
capture failures for a later `/retry`, never deliver a duplicate to the FORM-BOT,
and send a guaranteed email to `happyforms@bots.com` on success.
