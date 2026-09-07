# Form Ingestion Pipeline — Spec

## Problem Statement

Healthtech-1 receives healthcare registration forms from a third-party provider that does not guarantee exactly-once delivery, can change its data schema without notice, and generally cannot be trusted to behave well. Right now there is no reliable way to capture these forms, validate and transform them into the shape the downstream FORM-BOT expects, recover from a failure without losing the underlying data, or guarantee the team is notified when a form comes in — while also never handing the FORM-BOT the same form twice.

## Solution

Every incoming form is captured durably the instant it arrives, before any validation happens, so no data is ever lost to a bad schema or a processing bug. An internal consumer then validates, transforms, geocodes, and persists each form asynchronously, sending a guaranteed notification email on success. Duplicate submissions are rejected at the door using the form's session identifier. Failures split into two kinds: schema-drift failures that need a code fix and are only cleared by an explicit retry once that fix ships, and transient downstream failures (a flaky geocoding or email call) that heal automatically. The whole system runs as a single process with an encrypted, at-rest database — no external broker, cache, or database server required to run or review it.

## User Stories

1. As Healthtech-1, I want every incoming form durably captured the instant it arrives, so that no data is lost even if later processing fails.
2. As Healthtech-1, I want forms validated against the currently-agreed schema, so that malformed or drifted data doesn't silently corrupt transformed records.
3. As Healthtech-1, I want a form that fails validation to be preserved with its error captured, so that we can fix the code and recover it later without asking the third party to resend.
4. As Healthtech-1, I want duplicate forms (same session identifier) rejected before they enter processing, so that the FORM-BOT never receives the same form twice.
5. As Healthtech-1, I want each valid ingested form transformed into the schema the FORM-BOT expects, so that downstream processing can rely on a consistent structure.
6. As Healthtech-1, I want a form's postcode converted into longitude/latitude, so that the FORM-BOT has specific address information.
7. As Healthtech-1, I want geocoding failures retried automatically, so that transient third-party API blips don't require manual intervention.
8. As Healthtech-1, I want a guaranteed notification email sent to happyforms@bots.com whenever a form is successfully transformed, so that our team has visibility into every ingested form.
9. As Healthtech-1, I want email sends retried until they succeed, so that "guaranteed" is actually true rather than best-effort.
10. As Healthtech-1, I want to manually trigger reprocessing of a specific failed form by its session identifier, so that I can recover an individual form after investigating its error.
11. As Healthtech-1, I want to manually trigger reprocessing of all currently-failed forms in one call, so that I can recover everything affected by a bug right after deploying the fix.
12. As Healthtech-1, I want forms that failed due to schema validation to never be auto-retried, so that we don't waste cycles repeating a failure that can only be fixed by a code change.
13. As Healthtech-1, I want forms that failed due to a transient downstream error to be retried automatically, so that most failures self-heal without anyone needing to call retry.
14. As a developer debugging the pipeline, I want to query a form's current processing status by session identifier, so that I can verify what happened to it without querying the database directly.
15. As a developer demonstrating the system, I want to see structured log output at each pipeline transition, so that I can show the resilience behavior working end-to-end.
16. As Healthtech-1, I want all stored form data encrypted at rest, so that PII is protected even if the database file is exposed.
17. As a reviewer of this take-home, I want to run the full test suite and start the service with no external infrastructure (no Docker, no Redis, no cloud database), so that I can evaluate it in minutes.
18. As Healthtech-1, I want ingested name fields split into first/last name using a documented, consistent rule, so that transformation is predictable even though it can't perfectly parse every real name.
19. As Healthtech-1, I want the ingested gender value "other" mapped to "prefer-not-to-say" in the transformed schema, so that no valid ingested value causes a transformation failure.
20. As Healthtech-1, I want date-of-birth strings parsed into proper date values, so that the transformed schema's type contract is honored.
21. As a developer, I want the retry-with-backoff logic reused identically for both geocoding and email calls, so that both unreliable third-party integrations get the same resilience treatment rather than two bespoke implementations.
22. As a developer, I want a way to trigger and await the consumer's processing synchronously in tests, so that integration tests are deterministic instead of racing the async pipeline.
23. As Healthtech-1, I want basic tests covering the transform edge cases and the main endpoints' happy/error paths, so that we have confidence in correctness without requiring exhaustive coverage.

## Implementation Decisions

- **Database**: encrypted SQLite (`better-sqlite3-multiple-ciphers`) accessed via Drizzle ORM. The encryption key is supplied via a required environment variable; the app fails fast on startup if it's missing. See ADR-0001.
- **Schema — two tables**:
  - *Raw ingest log*: the raw payload exactly as received, a unique constraint on the session identifier, a processing status, a retry count, and timestamps. This table is the durable queue (ADR-0002) and the recovery source for the retry endpoint.
  - *Transformed forms*: the fully transformed, FORM-BOT-ready fields (per `transformed_schema.ts`), plus an email-delivery status and timestamps.
- **Processing states**: `pending`, `processing`, `failed_validation` (terminal until a code fix ships, excluded from automatic retry), `failed_transient` (downstream geocode/email failure after in-pipeline retries are exhausted, eligible for both automatic and manual retry), `complete`.
- **Duplicate detection**: enforced by a uniqueness constraint on the session identifier at the moment of ingest — a duplicate is rejected before it ever enters the queue, not deduplicated after the fact.
- **Ingest endpoint**: accepts the raw payload, enforces the uniqueness constraint, writes it to the raw ingest log, triggers the consumer, and responds immediately without waiting for processing to complete.
- **Consumer**: an in-process loop, not a separate service or external broker (ADR-0002). Triggered immediately after each successful ingest write, plus a slower interval sweep as a safety net for anything left over from a crash or restart. For each eligible row it validates against the currently-agreed schema, transforms the fields, calls the geocoding provider, persists the transformed record, and marks the email as pending for delivery. The automatic sweep only re-attempts `failed_transient` rows, never `failed_validation` rows.
- **Retry-with-backoff**: one shared helper, used identically for both the geocoding call and the email call, so both unreliable external integrations get the same resilience treatment.
- **Validation failure handling**: the raw payload is never discarded; it's preserved with the validation error attached and its status set to `failed_validation`, cleared only by an explicit retry call.
- **Guaranteed email**: implemented as a transactional-outbox-style obligation — the email-pending state is written in the same persistence step as the transformed record, and delivery is retried until it succeeds rather than attempted once and forgotten.
- **Retry endpoint**: supports both a targeted form (by session identifier) and a bulk sweep of all currently-failed forms, primarily intended for use immediately after deploying a fix for a schema-drift issue.
- **Status endpoint**: exposes a form's current processing status by session identifier, doubling as a debugging tool and a way to demonstrate pipeline behavior.
- **Name transformation**: splits the ingested single name field on the last whitespace boundary — everything after the final space becomes the surname, the remainder becomes the given name. A name with no whitespace is treated as given-name-only with an empty surname and flagged rather than failing. Documented as a known limitation, not general-purpose name parsing.
- **Gender transformation**: the ingested value `"other"` maps to the transformed schema's `"prefer-not-to-say"`; `"male"` and `"female"` pass through unchanged.
- **Date-of-birth transformation**: the ingested date string is parsed into a proper date value during transformation; a malformed date is treated as a validation-time failure, not a silent pass-through.
- **Address transformation**: the ingested nested address structure is flattened into the transformed schema's individual address line fields.
- **Testability**: the consumer's processing logic is exposed as a directly callable, awaitable function usable by tests, independent of the production event-trigger/interval-sweep wiring — this lets tests process a specific ingested form deterministically instead of polling for eventual consistency.
- **Observability**: structured log output (not a logging framework or external platform) is emitted at each pipeline transition (ingested, validated, transformation failure, geocode retry/failure, transformation success, email pending, email sent/failed) to make the resilience behavior demonstrable.
- **Scope boundary**: no external message broker, no ops-platform integrations (error tracking service, health-check endpoint, graceful-shutdown handling, API documentation generation) — explicitly excluded from this take-home's scope and noted as future work rather than silently omitted.

## Testing Decisions

- A good test here asserts on external behavior only — HTTP status codes and response bodies for endpoint tests, input/output pairs for the pure transform functions — never internal call counts or the consumer loop's internal state shape.
- HTTP-seam integration tests (supertest against the Express app, extending the existing `tests/app.test.ts` pattern) cover: ingest happy path, ingest with a payload that fails validation, ingest of a duplicate session identifier, targeted retry of a single failed form, bulk retry of all failed forms, and the status endpoint reflecting a form's current state.
- Pure-function unit tests cover the transform rules directly: name splitting (including the single-token edge case), gender mapping (including `"other"`), date parsing (including a malformed date), and address flattening.
- The geocoding and email provider mocks are made deterministic for tests (replacing the current `Math.random()`-based stubs), so both the success path and the exhausted-retry failure path can be tested reliably rather than relying on chance.
- Prior art: `tests/app.test.ts` already establishes the supertest-against-`app` pattern; new tests extend that same pattern rather than introducing a different one.
- No specific coverage-percentage target — "basic tests" per the original brief means covering the business-rule edge cases and the main endpoint paths, not exhaustive branch coverage.

## Out of Scope

- An external message broker or job-queue library (e.g. BullMQ) — a database-backed queue is used instead (ADR-0002).
- Postgres or any other database engine — encrypted SQLite is used instead (ADR-0001); a future migration path, not built now.
- Column-level or KMS-managed PII encryption — whole-database encryption at rest is used instead; noted as future work.
- Error-tracking/observability platforms (e.g. Sentry, DataDog), a health-check endpoint, graceful-shutdown handling, and API documentation generation (e.g. OpenAPI/Swagger).
- A background worker process or scheduler separate from the application process.
- General-purpose name parsing (handling every real-world name format).
- Coverage-percentage enforcement or CI coverage gating.

## Further Notes

- The project's domain glossary lives in `CONTEXT.md` at the repo root — code should use its terms consistently (`ingested form`, `consumer`, `failed_validation`, etc.) rather than synonyms.
- Two ADRs in `docs/adr/` record the architecture decisions this spec builds on: `0001-encrypted-sqlite-over-postgres.md` and `0002-db-backed-queue-not-external-broker.md`.
- `.planning/codebase/` (the pre-existing codebase map) and `.planning/research/bullmq-vs-db-queue.md` (cited research comparing BullMQ against the chosen queue approach) contain the supporting analysis behind these decisions.
- This spec was produced on the `codebase-map` branch, which is the working base for all further work on this project — not `main`.
