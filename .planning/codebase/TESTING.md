# Testing Patterns

**Analysis Date:** 2026-09-07

## Test Framework

**Runner:**
- Jest 29.7.0
- Config: `jest.config.js` at project root

**Setup:**
```javascript
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
};
```

**Assertion Library:**
- Jest built-in expect API

**Supported Languages:**
- TypeScript (via ts-jest preset)

**Run Commands:**
```bash
npm test              # Run all tests once
npm run dev           # Development server (not test-related)
```

## Test File Organization

**Location:**
- Tests co-located in separate `tests/` directory at root level
- Pattern: `tests/` directory mirrors or complements `src/` structure

**Naming:**
- Pattern: `{module}.test.ts`
- Example: `app.test.ts` tests `src/app.ts`

**Current Structure:**
```
tests/
└── app.test.ts       # Tests for Express app and /ingest endpoint
```

## Test Structure

**Suite Organization:**
```typescript
describe("POST /ingest", () => {
  it("should return 200", async () => {
    const response = await request(app).post("/ingest");
    expect(response.status).toBe(200);
  });
});
```

**Patterns:**
- describe() for grouping related tests by endpoint/feature
- it() for individual test cases
- Async/await for handling asynchronous operations
- Singular assertion per test case (simple tests)

## Mocking

**Framework:** 
- Supertest 7.0.0 for HTTP request mocking/testing
- No explicit mocking library (Jest mocks not used in current tests)

**Patterns:**
```typescript
import request from "supertest";
import app from "../src/app";

// Direct HTTP request simulation
const response = await request(app).post("/ingest");
```

**What to Mock:**
- External HTTP APIs (when integrating with SendGrid, IdealPostcodes, etc.)
- Database connections
- File system operations

**What NOT to Mock:**
- Express middleware and routing (test end-to-end)
- Response serialization logic
- Type transformations

## Fixtures and Factories

**Test Data:**
- No fixture files or factories currently implemented
- Test data is minimal (only endpoint path tested, no payload data)

**Location for future fixtures:**
- Recommended: `tests/fixtures/` directory
- Recommended factory pattern location: `tests/factories/` directory

**Example pattern to establish:**
```typescript
// Recommended structure for future tests
const createMockFormData = (overrides?: Partial<IngestedFormSchema>): IngestedFormSchema => ({
  session_id: "test-session-123",
  application_reference: "APP-001",
  // ... default values
  ...overrides,
});
```

## Coverage

**Requirements:** 
- No coverage thresholds enforced
- No coverage configuration in jest.config.js

**View Coverage:**
```bash
npm test -- --coverage    # Generate coverage report (command inferred)
```

**Current Coverage:** 
- Minimal: Only 1 test for 1 endpoint in entire application
- Large untested areas: All provider modules, schema transformations, business logic

## Test Types

**Unit Tests:**
- Not currently present
- Scope: Would test individual functions (sendEmail, lookupPostcode, schema transformations)
- Should test: Utility functions, transformation logic, error handling paths

**Integration Tests:**
- Minimal: Single test in `app.test.ts` tests HTTP endpoint integration
- Scope: Tests Express route handler with supertest
- Current: Only tests happy path (/ingest POST returns 200)

**E2E Tests:**
- Not implemented
- Would benefit from: Testing full flow of ingesting form data, transforming schemas, calling external providers

## Common Patterns

**Async Testing:**
```typescript
it("should return 200", async () => {
  const response = await request(app).post("/ingest");
  expect(response.status).toBe(200);
});
```

**Supertest HTTP Method Chaining:**
- request(app).post(endpoint) - Creates HTTP POST request
- .send(data) - Would attach request body (not shown in current tests)
- .expect(statusCode) - Could assert status inline
- Await resolves to response object with `.status`, `.body`, `.headers` properties

**Error Testing:**
- Not yet established pattern in codebase
- Recommended approach: Test provider failures, validation failures, transformation errors

## Recommended Test Coverage Plan

**Priority 1 - Unit Tests for Providers:**
- `tests/providers/idealpostcodes.test.ts` - Test lookupPostcode success/failure cases
- `tests/providers/sendgrid.test.ts` - Test sendEmail success/failure cases

**Priority 2 - Schema Transformation Tests:**
- `tests/forms/schemas/transformation.test.ts` - Test IngestedFormSchema → TransformedFormSchema conversion
- Validate camelCase/snake_case transformation
- Test date parsing
- Test field mapping

**Priority 3 - Integration Tests:**
- `tests/app.test.ts` - Expand with:
  - POST /ingest with valid payload
  - POST /ingest with invalid/missing fields
  - Error responses from providers
  - Failure scenarios

**Priority 4 - End-to-End Tests:**
- Full workflow: ingest → transform → send to external services
- Mock external service responses

## Test Infrastructure Gaps

**Missing:**
- Test helper utilities (no test-utils directory)
- Fixture/factory libraries
- Test database setup/teardown (if database added)
- Integration test environment configuration
- Mock provider implementations

---

*Testing analysis: 2026-09-07*
