# 04: Validate, transform, geocode, and persist — atomically, including the email obligation

**What to build:** The consumer picks up a pending ingest and, implementing the contract from ticket 01: validates it against the currently-agreed schema, applies the transform rules (name split, gender map, date parse, address flatten), geocodes the postcode (using the retry-with-backoff behavior — reusable, since ticket 05 needs the identical mechanism for email), checks for an `application_reference` collision under a different `session_id` and flags it per ADR-0003 rather than silently resolving it either way, then persists the transformed form. Persisting the form and creating its pending email obligation happen in the same durable step — there is never a window where a transformed form exists without its email obligation already recorded.

A validation failure preserves the original raw payload with its error captured, moves the ingest to a state that is excluded from automatic retry (only a manual retry after a code fix can clear it), and does not create a form or an email obligation.

A geocoding failure that survives the retry-with-backoff attempts moves the ingest to a state that *is* eligible for automatic retry later (ticket 06), distinct from the validation-failure state.

The consumer's processing logic is exposed as a directly callable, awaitable function, independent of however it ends up being triggered in production (ticket 06) — this is what lets tests process a specific ingest deterministically instead of racing async timing.

**Blocked by:** 01, 02, 03

**Status:** ready-for-agent

- [ ] A valid ingest is transformed correctly: name split, gender mapping (including `"other"`), date parsing, address flattening all match the ticket-01 contract
- [ ] A valid ingest's postcode is geocoded and the resulting longitude/latitude are persisted on the form
- [ ] An ingest that fails schema validation preserves the original raw payload with its error captured, and is excluded from automatic retry
- [ ] An ingest whose geocoding fails after retries are exhausted is moved to a state distinct from validation failure, and remains eligible for later automatic retry
- [ ] An ingest whose `application_reference` matches an existing form's under a different `session_id` is flagged into a distinct reviewable state — neither silently completed nor silently rejected
- [ ] A transformed form and its pending email obligation are created in the same durable step (verified: no observable state where one exists without the other, including under a simulated crash between the two)
- [ ] The transformed-forms table itself enforces its own uniqueness (defense in depth against ever creating two forms for one ingest)
- [ ] The consumer's processing function is directly callable and awaitable from a test, independent of production triggering
