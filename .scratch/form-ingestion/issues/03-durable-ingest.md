# 03: Durable ingest, duplicate rejection, and status lookup

**What to build:** `POST /ingest` durably captures the raw incoming payload to an encrypted, at-rest database and responds only after that write is committed — 202 Accepted, not before. Each captured ingest gets its own internal identifier, independent of the disputed `session_id`/`application_reference` question, so later stages and tables can reference it unambiguously. A duplicate `session_id` is rejected by a database-level uniqueness constraint (not an application-level check-then-insert, which races under concurrent requests) before it ever enters the processing queue. `GET /forms/:sessionId` reports a form's current status, correctly and safely for both known and unknown session identifiers.

This ticket does not implement validation, transformation, or the identity-flagging behavior from ADR-0003 — those land in ticket 04. At this stage, any syntactically-parseable payload is captured; only a payload with no `session_id` at all needs a defined rejection behavior, since nothing downstream can reference it without one.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `POST /ingest` writes the raw payload durably before responding, and responds 202 Accepted
- [ ] Each ingest row has an internal identifier independent of `session_id`/`application_reference`
- [ ] A second `POST /ingest` with a `session_id` already seen is rejected by a database-level uniqueness constraint
- [ ] A test sends two concurrent requests with the same `session_id` and confirms only one is accepted (not just sequential requests)
- [ ] A payload missing `session_id` entirely is rejected at ingest with a defined, tested response
- [ ] `GET /forms/:sessionId` returns a correct status for a known session identifier
- [ ] `GET /forms/:sessionId` returns a safe, correct response (not a leaked internal error, not a false-positive 200) for an unknown session identifier
- [ ] Schema is defined via migrations, not an ad hoc/implicit table creation
- [ ] The database file is verifiably encrypted at rest (not readable as plaintext SQLite)
