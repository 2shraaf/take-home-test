# 01: Schema types and business-rule contracts

**What to build:** `ingested_schema.ts` and `transformed_schema.ts` types are exported and importable elsewhere (currently dead code). Alongside this, write down — as a reviewable contract, not yet as runtime code — every business rule the transform stage (ticket 04) will need to implement against, so it's a settled decision rather than something decided ad hoc mid-implementation:

- The duplicate-identity strategy: `session_id` is the enforced uniqueness key; a repeated `application_reference` under a different `session_id` is flagged for review, not silently accepted or rejected (ADR-0003).
- Optional-field handling for every ingested field that's optional or possibly undefined.
- Date-of-birth parsing rule, and what counts as a malformed date (validation failure, not silent pass-through).
- Name-splitting rule: split on the last whitespace boundary; a single-token name gets an empty surname and is flagged, not failed.
- Gender-mapping rule: `"other"` → `"prefer-not-to-say"`; `"male"`/`"female"` pass through unchanged.

Runtime validation/transformation code itself is out of scope here — it lands in ticket 04, implemented against this contract.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] `IngestedFormSchema` and `TransformedFormSchema` (or equivalent) are exported and importable from another module (direct import from each schema file — no barrel, per the repo's documented "each module imports directly from target file" convention)
- [x] Every business rule listed above is written down somewhere reviewable (e.g. `CONTEXT.md` or a contract doc), in enough detail that ticket 04 requires no new judgment calls to implement
- [x] No runtime validation/transformation logic is introduced by this ticket
