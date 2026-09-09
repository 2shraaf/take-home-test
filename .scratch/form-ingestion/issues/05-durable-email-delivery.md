# 05: Deliver durable email obligations

**What to build:** Fulfillment of the email obligation ticket 04 already creates: send the notification to the fixed team address (happyforms@bots.com) using the same retry-with-backoff helper as geocoding. On failure, retry *only the email send* — never re-geocode, never re-persist the form, never touch an already-sent notification. Retry timing and error detail are persisted against the obligation, not just logged and discarded. Exhausting the retries available in one attempt or sweep cycle never permanently abandons the obligation — it stays eligible for the next attempt indefinitely, which is what makes "guaranteed" actually true.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] A pending email obligation is sent to happyforms@bots.com on success
- [ ] An obligation whose send fails is retried using the same backoff helper geocoding uses
- [ ] Retrying an obligation never re-triggers geocoding or re-persists the form — verified by a test that fails the email but confirms geocoding/persistence are not re-invoked
- [ ] An obligation that's already been sent is never re-sent by a later retry pass
- [ ] Retry attempt timing and error detail are persisted against the obligation, not only logged
- [ ] Exhausting the retries in one attempt/sweep leaves the obligation eligible for the next one, rather than marking it permanently failed
