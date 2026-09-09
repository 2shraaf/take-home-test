# Ingest → Transform Contract

The rules ticket 04 (validate, transform, geocode, persist) implements against. Settled here first so no judgment calls are made mid-implementation.

## Duplicate identity

`session_id` is the database-enforced uniqueness key. A repeated `application_reference` under a *different* `session_id` is flagged into a distinct reviewable state — never silently accepted as new, never silently rejected as a duplicate. See [ADR-0003](adr/0003-duplicate-identity-strategy.md).

## Optional-field handling

Every field in `IngestedFormSchema` is required except `phone_number` and `address.address_line_3`. Both map straight through to their optional counterparts (`phoneNumber`, `addressLine3`) in `TransformedFormSchema` unchanged — `undefined` stays `undefined`, no default substituted.

Every other field is required at the type level; a payload missing one fails schema validation (`failed_validation`), it is not treated as an implicitly-optional field.

## Date-of-birth parsing

`date_of_birth` (ISO 8601 string) is parsed into a `Date`. A string that does not parse to a valid date is a validation failure (`failed_validation`) — never silently coerced (e.g. to `Invalid Date` or `null`) and passed downstream.

## Name splitting

`name` splits on the **last** whitespace boundary: everything after the final space becomes `lastName`, everything before it becomes `firstName`.

- `"Anna Van Der Berg"` → `firstName: "Anna Van Der"`, `lastName: "Berg"`
- `"Cher"` (no whitespace) → `firstName: "Cher"`, `lastName: ""`, and the form is flagged for review rather than failed outright

This is a documented, pragmatic limitation — not general-purpose name parsing (no handling for "O'Brien"-style apostrophes beyond passing the substring through as-is, no locale-aware splitting).

## Gender mapping

| Ingested | Transformed |
|---|---|
| `"male"` | `"male"` |
| `"female"` | `"female"` |
| `"other"` | `"prefer-not-to-say"` |

Any value outside the ingested enum is a schema-validation failure, not a mapping decision — Zod validation (ticket 04) rejects it before the mapping step is ever reached.

## Address flattening

The ingested nested `address` object flattens to top-level fields (`addressLine1`, `addressLine2`, `addressLine3`, `postcode`, `country`) with a 1:1 field mapping — no transformation beyond flattening the structure.
