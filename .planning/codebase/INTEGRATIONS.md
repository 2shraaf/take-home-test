# External Integrations

**Analysis Date:** 2026-09-07

## APIs & External Services

**Email Delivery (Planned):**
- SendGrid - Email dispatch for form ingestion notifications
  - SDK/Client: Not yet integrated (mock implementation at `src/providers/sendgrid.ts`)
  - Auth: Intended via `SENDGRID_API_KEY` environment variable
  - Recipient: `happyforms@bots.com` (team notification)
  - Usage: Send confirmation email when form transformation succeeds

**Address Geocoding (Planned):**
- IdealPostcodes - UK postcode to geographic coordinates lookup
  - SDK/Client: Not yet integrated (mock implementation at `src/providers/idealpostcodes.ts`)
  - Auth: Intended via `IDEAL_POSTCODES_API_KEY` environment variable
  - Output: `{ longitude: number, latitude: number }`
  - Usage: Convert postcode to lat/long for FORM-BOT processing

## HTTP Client Pattern

**Custom HttpResponse Wrapper:**
- Location: `src/providers/httpresponse.ts`
- Type definition:
  ```typescript
  export type HttpResponse<T> = {
    statusCode: number;
    body?: T;
  };
  ```
- Used by: SendGrid provider, IdealPostcodes provider
- Purpose: Standardized response envelope for external service calls

**Provider Implementations:**
- `src/providers/sendgrid.ts` - `sendEmail()` function
  - Returns: `HttpResponse<void>`
  - Parameters: `{ to, from, subject, body }`
  - Success rate: Simulated at 95% (5% failure rate)
  - Latency simulation: 1000ms delay

- `src/providers/idealpostcodes.ts` - `lookupPostcode()` function
  - Returns: `HttpResponse<{ longitude: number, latitude: number }>`
  - Parameters: postcode string
  - Success rate: Simulated at 95% (5% failure rate)
  - Latency simulation: 1000ms delay

## Error Handling for External Calls

**Current Status:** Mock implementations with simulated error rates

**Pattern:**
- Success responses: statusCode 200 with populated body
- Failure responses: statusCode 500 with undefined body
- No retries implemented yet
- No exponential backoff configured
- Error rate: 5% for both services (tunable via randomNumber logic)

**Expected Implementation Approach:**
- Check `statusCode` in response envelope
- Log failures with service name and error context
- Implement retry logic at call sites
- Consider circuit breaker pattern for reliability

## Data Flow

**Form Ingestion Process:**

1. POST `/ingest` endpoint receives form data
2. Validate against `IngestedFormSchema` (`src/forms/schemas/ingested_schema.ts`)
3. Call `lookupPostcode()` from `src/providers/idealpostcodes.ts` with postcode
4. Transform form data to `TransformedFormSchema` (`src/forms/schemas/transformed_schema.ts`)
   - Add `longitude` and `latitude` from geocoding response
   - Map field names (snake_case to camelCase)
   - Parse `date_of_birth` string to Date object
   - Transform gender values ("other" → "prefer-not-to-say")
5. On success, call `sendEmail()` from `src/providers/sendgrid.ts` to notify `happyforms@bots.com`
6. Store transformed form in database (schema design pending)

## Environment Configuration

**Required Environment Variables:**
- `PORT` - HTTP server port (optional, defaults to 3000)
- `SENDGRID_API_KEY` - SendGrid authentication token (when integrated)
- `IDEAL_POSTCODES_API_KEY` - IdealPostcodes authentication key (when integrated)
- Database connection string (schema pending)

**Secrets Location:**
- Environment variables via `.env` file (gitignored)
- Never committed to repository
- Pattern: `.env` and `.env.*` excluded in `.gitignore`

## Failure Modes & Resilience

**Third-Party Reliability Assumptions:**
- Neither provider guarantees exactly-once delivery
- Forms may arrive as duplicates from external provider
- Schema changes from external provider without notification
- Postcode lookups may fail (5% error rate simulated)
- Email dispatch may fail (5% error rate simulated)

**System Requirements:**
- Idempotent processing: Database must detect duplicate forms via `session_id` + `application_reference`
- Dead letter queue: Failed forms should be stored for manual retry after code fixes
- Retry endpoint planned: `/retry` to reprocess failed forms after schema/logic changes

## Current State

**Mocked Services:**
- No actual API calls to SendGrid or IdealPostcodes yet
- All external calls are simulated with artificial latency and error rates
- Real SDK/client integration pending implementation phase

**Ready for Integration:**
- Provider abstraction layer established with consistent HttpResponse pattern
- Type-safe function signatures for both services
- Ready to replace mock implementations with actual SDK calls
- SDKs to be added: `@sendgrid/mail` and IdealPostcodes API client package

---

*Integration audit: 2026-09-07*
