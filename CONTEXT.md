# Form Ingestion Pipeline

Ingests healthcare registration forms from an unreliable 3rd party, transforms them into the schema the FORM-BOT expects, and guarantees each valid form is processed exactly once.

## Language

### Pipeline stages

**Ingested Form** (raw ingest):
The exact, unmodified payload as received from the 3rd party at `/ingest`, before any validation or transformation. Captured durably the instant it arrives, regardless of whether it turns out to be valid — this is what makes "capture the error/data" possible.
_Avoid_: submission, request body

**Form**:
The validated, transformed record — conforming to `transformed_schema.ts` — ready to be handed to the FORM-BOT.
_Avoid_: application, record, entry

**Consumer**:
The in-process loop that pulls eligible ingested forms and drives them through validate → transform → geocode → persist → email. Triggered immediately after each ingest, plus a slower interval sweep as a safety net. Lives in the same process — no external worker/broker.
_Avoid_: worker, job runner, processor service

**FORM-BOT**:
The downstream system this pipeline prepares forms for. Must never receive the same form twice.

### States

**Duplicate**:
Two ingests sharing the same `session_id`. Enforced by a unique constraint at ingest time, so a duplicate never enters the processing pipeline at all — it's rejected at the door, not deduplicated after the fact. See ADR-0003 for why `session_id` rather than `application_reference` or a composite key.
_Avoid_: resubmission

**Possible duplicate**:
An ingest whose `application_reference` matches an existing form's, but whose `session_id` differs. Neither auto-accepted nor auto-rejected — flagged into a distinct state for human review, since the third party's field semantics aren't documented anywhere we can rely on. See ADR-0003.
_Avoid_: duplicate (a possible duplicate is explicitly *not* the enforced kind above)

**Obligation** (as in "email obligation"):
The durable record that an email must eventually be sent for a given form, created in the same step that persists the form itself — never a separate, later step that could be skipped. What makes "guaranteed" true rather than aspirational.
_Avoid_: notification, task

**Failed (validation)**:
An ingested form that didn't conform to the currently-agreed schema. Terminal until a code fix ships — never auto-retried, since it will fail identically every time until the code changes. Only cleared by an explicit `/retry` call.
_Avoid_: invalid, rejected

**Failed (transient)**:
An ingested form where a downstream dependency (geocoding, email) failed after the consumer's in-pipeline retries were exhausted. Eligible for automatic recovery on the next sweep, and for manual `/retry`.
_Avoid_: error, timeout

**Guaranteed** (as in "guaranteed email"):
The obligation is durably recorded the moment a form finishes transformation, and retried until it actually succeeds — not a single best-effort attempt that can silently fail.
_Avoid_: reliable, best-effort

**Retry** (the verb/endpoint):
Manually forcing reprocessing of forms in a `failed` state — typically invoked after a code fix ships for a schema-drift issue. Distinct from the consumer's automatic sweep, which only ever retries *transient* failures, never validation failures. Always resumes from whatever stage the form actually needs — never restarts a pipeline that already completed earlier stages. A form stuck only on its email obligation is retried by resending the email alone: never re-geocoded, never re-persisted, never given a second form record.
_Avoid_: reprocess, resend, reprocess-from-scratch
