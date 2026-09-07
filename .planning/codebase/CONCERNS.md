# Codebase Concerns

**Analysis Date:** 2026-09-07

## Critical Issues - Implementation Gaps

### Missing Database Implementation

**Severity:** CRITICAL

- **Issue:** The README explicitly requires "We expect you to use an actual database" but the codebase has zero database connectivity or schema
- **Files:** `src/app.ts`, `src/index.ts`
- **Impact:** Forms cannot be persisted, duplicates cannot be detected, retry mechanism cannot work
- **Fix approach:** 
  - Implement database connection (PostgreSQL/MySQL recommended for healthcare data integrity)
  - Define database schema matching `transformed_schema.ts` structure
  - Add database migration system
  - Implement idempotency keys to prevent duplicate processing

### No Form Validation or Schema Enforcement

**Severity:** CRITICAL

- **Issue:** `/ingest` endpoint accepts POST requests without validating against `ingested_schema.ts`
- **Location:** `src/app.ts:7-9`
- **Impact:** Invalid or malformed data passes through; schema changes from unreliable 3rd party go undetected; healthcare data integrity at risk
- **Current state:** 
  ```typescript
  app.post("/ingest", (req: Request, res: Response) => {
    res.json({ message: "Ingesting form data" });
  });
  ```
- **Fix approach:**
  - Implement request body validation using a schema validation library (Zod, Joi, or TypeGuard)
  - Validate against `ingested_schema.ts` on every ingest
  - Log validation failures separately for analysis
  - Return 400 Bad Request with detailed errors on validation failure

### No Form Transformation Logic

**Severity:** CRITICAL

- **Issue:** No code exists to transform from `ingested_schema.ts` to `transformed_schema.ts`
- **Missing transformations:**
  - Split `name` field into `firstName` and `lastName`
  - Convert `date_of_birth` string to Date object
  - Transform gender enum ("male"|"female"|"other" → "male"|"female"|"prefer-not-to-say")
  - Flatten address fields
  - Call postcode geocoding API and add `longitude`/`latitude`
- **Files:** None - this logic doesn't exist
- **Impact:** Core business requirement unmet; forms cannot be passed to FORM-BOT
- **Fix approach:**
  - Create transformation function with proper error handling
  - Implement postcode lookup with retry logic for unreliable API
  - Validate transformed data before persistence

### No Email Notification System

**Severity:** HIGH

- **Issue:** README states "we should send a guaranteed email to our team happyforms@bots.com that a form was ingested" but no email is actually sent
- **Files:** `src/providers/sendgrid.ts` (mocked, never called)
- **Impact:** Team has no visibility into ingested forms; SLA violations go undetected
- **Current state:** Mock sendEmail function returns random 200/500 responses but is never invoked
- **Fix approach:**
  - Integrate actual SendGrid API or configure mock for testing
  - Send email only after successful database persistence
  - Implement retry logic for failed emails
  - Log email delivery status for audit trail

### Missing Retry Endpoint

**Severity:** HIGH

- **Issue:** README requires "some kind of `/retry` endpoint" for handling previously failed forms after code deployment, but endpoint doesn't exist
- **Files:** None
- **Impact:** Cannot recover from schema-related failures without manual intervention
- **Fix approach:**
  - Create `/retry` endpoint with authentication
  - Store failed ingest attempts in database with error details
  - Implement retry queue with exponential backoff
  - Track retry history per form

### No Duplicate Detection

**Severity:** HIGH

- **Issue:** README explicitly states "We should never give the FORM-BOT the same form twice" and warns about 3rd party not guaranteeing exactly-once delivery, but no duplicate detection exists
- **Files:** None
- **Impact:** FORM-BOT may process duplicate applications, causing data corruption or duplicate submissions
- **Fix approach:**
  - Implement idempotency key tracking (use `session_id` + checksum)
  - Add unique constraint on processed forms table
  - Return 409 Conflict for duplicate submissions
  - Log duplicate attempts for monitoring

---

## Error Handling & Resilience Issues

### No Error Handling Middleware

**Severity:** HIGH

- **Issue:** Express app has no error handling middleware or global error catcher
- **Location:** `src/app.ts:1-11`
- **Impact:** Unhandled exceptions will crash the server; requests with errors return default 500 responses with no logging
- **Fix approach:**
  - Add Express error handling middleware at end of middleware chain
  - Implement structured error logging with context (request ID, user, timestamp)
  - Return consistent error response format with error codes
  - Handle async errors from route handlers

### No Try-Catch Blocks

**Severity:** HIGH

- **Issue:** All async operations (`sendEmail`, `lookupPostcode`) lack error handling
- **Files:** `src/providers/sendgrid.ts`, `src/providers/idealpostcodes.ts`
- **Impact:** Exceptions propagate unhandled; timeouts kill requests
- **Fix approach:**
  - Wrap all async/await operations in try-catch
  - Log errors with full context (input, stack trace, service name)
  - Return typed error responses consistent with `HttpResponse<T>`
  - Implement circuit breaker pattern for external service calls

### No Logging Infrastructure

**Severity:** MEDIUM

- **Issue:** Only console.log on server startup; no structured logging anywhere else
- **Location:** `src/index.ts:6`
- **Impact:** Cannot debug production issues; no audit trail for security/compliance
- **Fix approach:**
  - Implement structured logging with context (request ID, user ID, timestamp)
  - Log: all API calls, data transformations, validation failures, external API calls
  - Include severity levels (error, warn, info, debug)
  - Consider external logging service (DataDog, CloudWatch, ELK)

### Mocked Services with Unpredictable Failures

**Severity:** MEDIUM

- **Issue:** Mock services use `Math.random()` to simulate 5% failure rate, making system behavior non-deterministic
- **Files:** `src/providers/sendgrid.ts:5-10`, `src/providers/idealpostcodes.ts:5-13`
- **Impact:** Tests fail sporadically; cannot reliably test error paths; developers lack confidence in error handling
- **Current behavior:**
  ```typescript
  const randomNumber = Math.random();
  return {
    statusCode: randomNumber < 0.95 ? 200 : 500,
  };
  ```
- **Fix approach:**
  - Make mock services deterministic (use environment variable to control success/failure)
  - Implement proper testing for both success and failure paths
  - Use test fixtures instead of randomness

---

## Input Validation & Security Issues

### No Request Body Validation

**Severity:** HIGH

- **Issue:** POST `/ingest` accepts any JSON without validation
- **Location:** `src/app.ts:7-9`
- **Impact:** Invalid requests processed; healthcare data integrity compromised
- **Fix approach:**
  - Validate schema at request boundary
  - Return 400 with validation error details
  - Log validation failures for security monitoring

### Incomplete Schema Type Exports

**Severity:** MEDIUM

- **Issue:** `ingested_schema.ts` and `transformed_schema.ts` define types but don't export them
- **Files:** `src/forms/schemas/ingested_schema.ts`, `src/forms/schemas/transformed_schema.ts`
- **Impact:** Types cannot be reused; route handlers can't specify correct types
- **Fix approach:**
  - Add `export` keyword to both type definitions
  - Import and use types in route handlers and services

### No Email Address Validation

**Severity:** MEDIUM

- **Issue:** Email stored from user input without validation
- **Files:** `src/forms/schemas/ingested_schema.ts:5`
- **Impact:** Invalid emails can be stored; email notifications fail silently
- **Fix approach:**
  - Add email format validation in transformation step
  - Reject forms with invalid email addresses

### No Postcode Format Validation

**Severity:** MEDIUM

- **Issue:** Postcode accepted as plain string without format validation or verification
- **Files:** `src/forms/schemas/ingested_schema.ts:14`
- **Impact:** Invalid postcodes cause geocoding API failures; system fails silently
- **Fix approach:**
  - Add postcode format validation before geocoding
  - Return 400 for invalid postcode format
  - Log postcode lookup failures separately

---

## Test Coverage Gaps

### Insufficient Test Coverage

**Severity:** HIGH

- **Issue:** Only 1 test exists that validates nothing meaningful
- **Location:** `tests/app.test.ts:4-9`
- **Current test:**
  ```typescript
  it("should return 200", async () => {
    const response = await request(app).post("/ingest");
    expect(response.status).toBe(200);
  });
  ```
- **Problems:**
  - No test payload sent (testing with undefined body)
  - No validation of response body
  - No tests for error cases
  - No tests for validation failures
  - No tests for transformation logic
  - No tests for duplicate detection
  - No tests for external service failures

- **Impact:** Cannot detect regressions; unknown code quality; no confidence in refactoring
- **Fix approach:**
  - Test each schema transformation with valid/invalid data
  - Test duplicate detection
  - Test email notification triggering
  - Test external API failures and retries
  - Test validation with malformed requests
  - Test database persistence
  - Aim for >80% code coverage

### No Jest Coverage Configuration

**Severity:** MEDIUM

- **Issue:** Jest config has no coverage settings
- **Location:** `jest.config.js`
- **Impact:** Cannot track test coverage; no way to enforce coverage thresholds
- **Fix approach:**
  - Add `collectCoverage: true` and coverage threshold configuration
  - Set minimum coverage threshold (e.g., 80%)
  - Run coverage in CI/CD

---

## Configuration & Environment Issues

### No Environment Configuration for External Services

**Severity:** HIGH

- **Issue:** No `.env` configuration or environment variable requirements documented for SendGrid API key, IdealPostcodes API key, or database connection
- **Files:** `src/providers/sendgrid.ts`, `src/providers/idealpostcodes.ts`
- **Impact:** Cannot deploy to production; secrets hardcoded or missing
- **Fix approach:**
  - Document required environment variables in README
  - Load credentials from environment variables
  - Validate required vars on startup
  - Consider .env.example file for local development

### No Database Configuration

**Severity:** HIGH

- **Issue:** No database URL, connection pool settings, or schema defined
- **Impact:** Cannot select database; no persistence
- **Fix approach:**
  - Require DATABASE_URL environment variable
  - Implement database migration system
  - Add connection pooling configuration
  - Document minimum PostgreSQL/MySQL versions

### Missing TypeScript Export Configuration

**Severity:** MEDIUM

- **Issue:** Type definitions in schemas not exported, making them unusable from other modules
- **Files:** `src/forms/schemas/ingested_schema.ts:1-18`, `src/forms/schemas/transformed_schema.ts:1-19`
- **Fix approach:**
  - Add `export` keyword to both type definitions
  - Consider creating barrel export file `src/forms/schemas/index.ts`

---

## Data Type & Transformation Issues

### Gender Enum Mismatch

**Severity:** MEDIUM

- **Issue:** `ingested_schema.ts` defines gender as `"male" | "female" | "other"` but `transformed_schema.ts` uses `"male" | "female" | "prefer-not-to-say"`
- **Files:** 
  - `src/forms/schemas/ingested_schema.ts:6`
  - `src/forms/schemas/transformed_schema.ts:7`
- **Impact:** Transformation will fail for "other" gender value; no mapping strategy defined
- **Fix approach:**
  - Define explicit mapping strategy (e.g., "other" → "prefer-not-to-say")
  - Document the business logic for this transformation
  - Add test cases for all gender values

### Date String Not Parsed

**Severity:** MEDIUM

- **Issue:** `ingested_schema.ts` has `date_of_birth` as string but `transformed_schema.ts` requires Date object, yet no parsing logic exists
- **Files:**
  - `src/forms/schemas/ingested_schema.ts:7`
  - `src/forms/schemas/transformed_schema.ts:8`
- **Impact:** TypeScript compilation will fail when transformation is implemented; runtime type mismatches
- **Fix approach:**
  - Parse ISO 8601 date strings to Date objects
  - Validate date is not in future (birthdate)
  - Handle malformed date strings with error logging

### No Name Parsing

**Severity:** MEDIUM

- **Issue:** `ingested_schema.ts` has single `name` field but `transformed_schema.ts` requires `firstName` and `lastName`, yet no parsing logic exists
- **Files:**
  - `src/forms/schemas/ingested_schema.ts:4`
  - `src/forms/schemas/transformed_schema.ts:4-5`
- **Impact:** Transformation cannot be completed; data loss (middle names discarded, hyphenated names split incorrectly)
- **Fix approach:**
  - Implement name parsing (consider edge cases: "Van Der Berg", "O'Brien", single names)
  - Handle parsing failures gracefully
  - Document assumption (last space-separated word is surname, rest is first name)
  - Add comprehensive test cases for name parsing

---

## Database Design Concerns

### No Schema Design

**Severity:** CRITICAL

- **Issue:** No database schema, migrations, or ORM model defined
- **Impact:** Cannot persist data; no audit trail; no retry mechanism; no duplicate detection
- **Missing:**
  - Schema version table for migrations
  - Forms table with unique constraint on session_id + checksum
  - Failed ingest table for retry mechanism
  - Email delivery tracking table
  - Indexes on frequently queried columns

- **Fix approach:**
  - Define schema migrations using TypeORM or raw SQL
  - Include fields: id, session_id, application_reference, form_data (JSONB), transformed_data (JSONB), status, created_at, updated_at, ingested_at, emailed_at, error_details, retry_count
  - Add unique index on (session_id, checksum) to prevent duplicates
  - Add created_at index for query performance

### No ORM Integration

**Severity:** HIGH

- **Issue:** No ORM or database client configured
- **Impact:** Must use raw SQL (security risk, boilerplate); no type safety
- **Fix approach:**
  - Integrate TypeORM or Prisma for type-safe queries
  - Define entity models matching schema
  - Use prepared statements to prevent SQL injection

---

## Missing Features & Incomplete Implementation

### No Postcode Validation Before Geocoding

**Severity:** MEDIUM

- **Issue:** Invalid postcodes passed directly to geocoding API without format validation
- **Location:** `src/providers/idealpostcodes.ts`
- **Impact:** Unnecessary API calls; delays for invalid data; poor error messages
- **Fix approach:**
  - Validate UK postcode format before calling API (regex: `[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}`)
  - Return 400 for invalid format

### No Retry Logic for External APIs

**Severity:** MEDIUM

- **Issue:** External service calls don't retry on failure; single 1000ms timeout
- **Files:** `src/providers/sendgrid.ts:8`, `src/providers/idealpostcodes.ts:8`
- **Impact:** Transient failures cause form rejection; poor resilience for "particularly unreliable 3rd party"
- **Fix approach:**
  - Implement exponential backoff retry logic (3-5 attempts)
  - Add jitter to prevent thundering herd
  - Use circuit breaker pattern for cascading failures
  - Log retry attempts

### No Request ID Tracking

**Severity:** MEDIUM

- **Issue:** No request ID generated or tracked through processing pipeline
- **Impact:** Impossible to trace form through system; hard to debug issues
- **Fix approach:**
  - Generate UUID for each /ingest request
  - Pass through all function calls
  - Log with each database operation
  - Return in response headers for client tracking

---

## Dependency & Deployment Issues

### Missing Production Dependencies

**Severity:** HIGH

- **Issue:** No database driver, validation library, or logging library in dependencies
- **Location:** `package.json:25-27`
- **Current dependencies:** Only Express
- **Impact:** Core functionality cannot be implemented
- **Required additions:**
  - Database client (pg for PostgreSQL)
  - Schema validation (zod or joi)
  - Logging (winston or pino)
  - HTTP client for external APIs (axios or node-fetch)
  - UUID generation (uuid)

### TypeScript Strict Mode Enabled but Types Not Exported

**Severity:** MEDIUM

- **Issue:** TypeScript strict mode is correctly configured (`tsconfig.json:8`) but schema types are not exported
- **Impact:** Route handlers can't use proper types; type safety lost
- **Fix approach:**
  - Export types from schema files
  - Create index.ts barrel exports
  - Use types in route handlers

### No Compiled Output

**Severity:** MEDIUM

- **Issue:** No `dist/` directory checked in or built
- **Impact:** Running `npm start` will fail (no `dist/index.js`)
- **Fix approach:**
  - Run `npm run build` before deployment
  - Add build step to deployment pipeline
  - Consider adding `dist/` to .gitignore with build artifacts excluded

---

## Code Quality & Maintainability Issues

### Inconsistent Error Response Types

**Severity:** MEDIUM

- **Issue:** `HttpResponse<T>` type uses optional `body` field, but no error information is included
- **Location:** `src/providers/httpresponse.ts:1-3`
- **Current type:**
  ```typescript
  export type HttpResponse<T> = {
    statusCode: number;
    body?: T;
  };
  ```
- **Impact:** Cannot distinguish between "success with no body" and "error"; no error details returned
- **Fix approach:**
  - Extend type to include optional `error` field with error code and message
  - Or create separate `ErrorResponse` type
  - Document expected status codes

### Mock Services Never Used

**Severity:** LOW

- **Issue:** `sendEmail` and `lookupPostcode` mock functions exist but are never imported or called anywhere
- **Files:** `src/providers/sendgrid.ts`, `src/providers/idealpostcodes.ts`
- **Impact:** Dead code; makes it unclear where to integrate real implementations
- **Fix approach:**
  - Import and use in form ingestion pipeline
  - Or remove if truly not needed

### No API Documentation

**Severity:** MEDIUM

- **Issue:** No route documentation, OpenAPI/Swagger spec, or API documentation
- **Impact:** Unclear what endpoints exist, request/response format, error codes
- **Fix approach:**
  - Add JSDoc comments to route handlers
  - Consider Swagger/OpenAPI integration for API documentation
  - Document error codes and responses

### Incomplete README

**Severity:** MEDIUM

- **Issue:** README describes requirements but doesn't mention implementation status
- **Location:** `README.md`
- **Impact:** Users don't know what's actually implemented vs. what's missing
- **Fix approach:**
  - Add "Implementation Status" section
  - Document what's complete, what's in progress, what's TODO
  - Add setup and deployment instructions

---

## Deployment & Operations Issues

### No Production Error Monitoring

**Severity:** MEDIUM

- **Issue:** No integration with error tracking service (Sentry, NewRelic, DataDog)
- **Impact:** Production errors go unnoticed; cannot proactively fix issues
- **Fix approach:**
  - Integrate Sentry or similar
  - Send all unhandled exceptions
  - Set up alerts for critical errors

### No Health Check Endpoint

**Severity:** MEDIUM

- **Issue:** No `/health` or `/status` endpoint for monitoring and load balancing
- **Impact:** Kubernetes/orchestration cannot determine if service is healthy
- **Fix approach:**
  - Add `GET /health` endpoint that checks database connectivity
  - Return 200 if all dependencies healthy, 503 otherwise

### No Graceful Shutdown

**Severity:** MEDIUM

- **Issue:** No signal handlers for SIGTERM/SIGINT
- **Impact:** In-flight requests may be killed during deployment; data loss possible
- **Fix approach:**
  - Add SIGTERM handler that closes server gracefully
  - Wait for in-flight requests to complete (timeout after 30s)
  - Close database connections before exit

---

## Summary Table

| Category | Issue | Severity | Impact |
|----------|-------|----------|--------|
| Core Functionality | No database implementation | CRITICAL | Forms cannot persist |
| Core Functionality | No form validation | CRITICAL | Healthcare data integrity risk |
| Core Functionality | No transformation logic | CRITICAL | Core business requirement unmet |
| Core Functionality | No email notifications | HIGH | Team has no visibility |
| Core Functionality | No retry endpoint | HIGH | Cannot recover from failures |
| Core Functionality | No duplicate detection | HIGH | FORM-BOT may receive duplicates |
| Error Handling | No error middleware | HIGH | Unhandled exceptions crash server |
| Error Handling | No try-catch blocks | HIGH | Async errors propagate unhandled |
| Error Handling | No structured logging | MEDIUM | Cannot debug production issues |
| Testing | Only 1 minimal test | HIGH | No confidence in code quality |
| Configuration | No env configuration | HIGH | Cannot configure for production |
| Data Types | Gender enum mismatch | MEDIUM | Transformation will fail |
| Data Types | Date parsing missing | MEDIUM | Runtime type errors |
| Data Types | Name parsing missing | MEDIUM | Cannot transform data |
| Code Quality | Types not exported | MEDIUM | Cannot use type safety |
| Code Quality | No API documentation | MEDIUM | API unclear to consumers |
| Operations | No health endpoint | MEDIUM | Cannot monitor service |

---

*Concerns audit: 2026-09-07*
