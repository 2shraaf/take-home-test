# Database-backed queue instead of an external broker (BullMQ)

**Status:** accepted

`/ingest` durably logs the raw payload to a `raw_ingests` table and returns immediately; a single in-process consumer loop (triggered on insert, plus an interval safety net) is the only writer that processes forms through validation, transformation, and persistence. This is a transactional outbox / polling-consumer pattern, not a stopgap — it was chosen over BullMQ after directly researching BullMQ's requirements.

BullMQ requires Redis with no exception: confirmed via BullMQ's own docs and a maintainer's statement in [GitHub Discussion #2412](https://github.com/taskforcesh/bullmq/discussions/2412) — *"No, you need a Redis instance in order to use BullMQ."* That reintroduces the external-infrastructure dependency ADR-0001 deliberately avoided. No actively-maintained SQLite-native queue library was found in the npm ecosystem either (candidates found were stale since 2022). The retry/backoff/dedup behavior BullMQ would provide is small enough here (~100 LOC) to implement directly against the schema already in place — `session_id` uniqueness for dedup, a `status` column for job state, a `retryCount` for backoff.

## Considered Options

- **BullMQ + Redis**: mature retry/backoff/concurrency semantics, but requires running Redis even for local review — directly conflicts with the zero-external-infra goal.
- **SQLite-native queue library**: searched npm; nothing actively maintained found.
- **Hand-rolled DB-as-queue** (chosen): no new infrastructure, single-writer concurrency is a non-issue because the consumer is the only writer by design, and the retry logic is visible application code rather than delegated to a dependency.

## Consequences

- Single-writer serialization (ADR-0001's tradeoff) is resolved as a side effect: only the consumer loop writes to the `forms` table, so SQLite's concurrency limitation never comes into play.
- `failed_validation` forms are excluded from the automatic sweep (they'd fail identically until a code fix ships) — only `/retry` clears them. `failed_transient` forms are eligible for both the automatic sweep and manual `/retry`.
