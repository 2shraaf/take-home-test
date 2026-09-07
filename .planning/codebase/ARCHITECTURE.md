# Architecture

**Analysis Date:** 2026-09-07

## Pattern Overview

**Overall:** Layered MVC-style service application with provider pattern for external integrations

**Key Characteristics:**
- Express.js HTTP server handling form data ingestion
- Separation of concerns: Routes → Schemas → Providers
- Type-safe data transformation pipeline
- External service abstraction through provider layer
- Standardized HTTP response wrapping

## Layers

**Route Layer:**
- Purpose: Handle HTTP requests and responses
- Location: `src/app.ts`
- Contains: Express route handlers
- Depends on: Express framework
- Used by: HTTP clients (POST /ingest endpoint)

**Schema Layer:**
- Purpose: Define data structures for ingested and transformed data
- Location: `src/forms/schemas/`
- Contains: TypeScript type definitions
  - `ingested_schema.ts`: Shape of raw form submission data (snake_case)
  - `transformed_schema.ts`: Normalized internal data format (camelCase, enriched)
- Depends on: None (pure types)
- Used by: Route handlers, providers, transformers

**Provider Layer:**
- Purpose: Encapsulate external service integrations
- Location: `src/providers/`
- Contains: Service adapters returning standardized HttpResponse
  - `httpresponse.ts`: Type definition for standardized responses
  - `idealpostcodes.ts`: Postcode lookup service (simulated)
  - `sendgrid.ts`: Email sending service (simulated)
- Depends on: None (internal abstractions only)
- Used by: Route handlers, business logic

**Application Entry:**
- Purpose: Bootstrap and start server
- Location: `src/index.ts`
- Contains: Server initialization on PORT (default 3000)
- Depends on: `src/app.ts`

## Data Flow

**Form Ingestion Flow:**

1. HTTP POST request arrives at `/ingest` endpoint
2. Express middleware parses JSON body to `IngestedFormSchema` shape
3. Route handler receives request with snake_case data (session_id, application_reference, etc.)
4. Data validation and transformation occurs (converts to `TransformedFormSchema` camelCase)
5. External providers are called in parallel:
   - `lookupPostcode(postcode)` → enriches with longitude/latitude
   - `sendEmail(...)` → dispatches confirmation email
6. Response wraps result with HTTP status code and optional body

**State Management:**
- Stateless request/response model
- No persistent state management
- Each request is independent
- Example data files (`src/forms/examples/`) demonstrate expected input structure

## Key Abstractions

**HttpResponse<T> Type:**
- Purpose: Wrap all external service responses with consistent status/body structure
- Location: `src/providers/httpresponse.ts`
- Pattern: Generic type with statusCode (number) and optional body (T)
- Used by: All provider functions to indicate success/failure

**Schema Types:**
- Purpose: Enforce compile-time data structure contracts
- Examples:
  - `IngestedFormSchema` (src/forms/schemas/ingested_schema.ts): Input contract
  - `TransformedFormSchema` (src/forms/schemas/transformed_schema.ts): Internal contract
- Pattern: TypeScript type definitions (no runtime overhead)

**Provider Functions:**
- Purpose: Abstract external service interactions
- Examples: `lookupPostcode()`, `sendEmail()`
- Pattern: Async functions returning `HttpResponse<T>` with simulated delays
- Note: Current implementations use Math.random() simulation (95% success rate)

## Entry Points

**Server Initialization:**
- Location: `src/index.ts`
- Triggers: Node process execution (`npm start` or `npm run dev`)
- Responsibilities:
  - Import Express app
  - Set PORT from environment (default 3000)
  - Start listening on PORT
  - Log startup message

**POST /ingest Route:**
- Location: `src/app.ts` line 7-9
- Triggers: HTTP POST requests to /ingest
- Responsibilities:
  - Accept form data matching IngestedFormSchema
  - Parse JSON request body
  - Return success response with message

## Error Handling

**Strategy:** Simulated with random failures for provider testing

**Patterns:**
- Providers simulate failures: `Math.random() < 0.95` determines success (95% success rate)
- Success returns statusCode 200 with data; failures return statusCode 500
- No explicit error throwing; errors wrapped in HttpResponse
- Route handlers receive standard response structure

## Cross-Cutting Concerns

**Logging:** 
- Minimal: Server startup message only
- Console output on listen success

**Validation:** 
- TypeScript compile-time validation through schema types
- No runtime validation middleware currently present

**Authentication:** 
- Not implemented
- /ingest endpoint is open

**Request Parsing:**
- Express JSON middleware handles parsing (app.use(express.json()))
- Automatic conversion of request body to objects
