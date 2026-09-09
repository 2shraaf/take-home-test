# Duplicate identity: `session_id` enforced, `application_reference` flagged

**Status:** accepted

The ingested schema carries two identity fields — `session_id` and `application_reference` — and neither the README nor the schema documents which one (if either) is stable across a redelivery from the third party. Rather than guess, `session_id` is the database-enforced uniqueness key: it maps most directly to "does not guarantee exactly-once delivery," which describes the same submission arriving twice, plausibly under the same session. `application_reference` is indexed but not uniqueness-enforced; if a different `session_id` arrives reusing an existing `application_reference`, it is not silently accepted as a new form or silently rejected as a duplicate — it is flagged into a distinct state for human review.

## Considered Options

- **`session_id` alone** (chosen): matches the one redelivery scenario the README actually describes. Risk: if `application_reference` turns out to be the third party's true stable identifier and `session_id` regenerates on resend, a real duplicate could be missed — mitigated by flagging, not eliminated by it.
- **`application_reference` alone**: no basis in the README for preferring it over `session_id`; rejected for the same reason as above, in reverse.
- **Composite `(session_id, application_reference)`**: only rejects when both match, which is *looser* than either field alone — it would silently admit a resend if either field is regenerated, which is the opposite of what deduplication is for here. Rejected.

## Consequences

- A flagged `application_reference` collision is not auto-resolved either way; it sits in a reviewable state until a human decides, rather than the system silently guessing on healthcare data.
- If it later turns out `application_reference` is the third party's true stable key, this is a straightforward config change (swap the enforced field) rather than a schema rewrite, since both fields are already captured and indexed.
