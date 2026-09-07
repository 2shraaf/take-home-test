# Codebase Structure

**Analysis Date:** 2026-09-07

## Directory Layout

```
take-home-test/
├── src/                        # Application source code
│   ├── index.ts               # Server entry point
│   ├── app.ts                 # Express application and routes
│   ├── forms/                 # Form data handling
│   │   ├── schemas/           # Data structure definitions
│   │   │   ├── ingested_schema.ts      # Input data schema (snake_case)
│   │   │   └── transformed_schema.ts   # Transformed data schema (camelCase)
│   │   └── examples/          # Example form submission data
│   │       ├── person_one.json
│   │       ├── person_two.json
│   │       └── person_three.json
│   └── providers/             # External service integrations
│       ├── httpresponse.ts    # Standardized response type
│       ├── idealpostcodes.ts  # Postcode lookup service
│       └── sendgrid.ts        # Email sending service
│
├── tests/                     # Test suite
│   └── app.test.ts           # Express app route tests
│
├── .planning/                # Planning documents (generated)
│   └── codebase/            # Codebase analysis documents
│
├── package.json              # Project dependencies and scripts
├── tsconfig.json             # TypeScript configuration
├── jest.config.js            # Jest test framework configuration
└── README.md                 # Project documentation
```

## Directory Purposes

**src/**
- Purpose: All application source code
- Contains: TypeScript files, route handlers, services, data schemas
- Key files: `index.ts` (entry), `app.ts` (Express setup)

**src/forms/**
- Purpose: Form data handling and validation structures
- Contains: Schema definitions and example data
- Key files: 
  - `schemas/ingested_schema.ts`: Raw form submission structure
  - `schemas/transformed_schema.ts`: Normalized internal structure

**src/forms/schemas/**
- Purpose: Define and export TypeScript type definitions for form data
- Contains: Pure type definitions (no implementation)
- Key files:
  - `ingested_schema.ts`: `IngestedFormSchema` type (input format)
  - `transformed_schema.ts`: `TransformedFormSchema` type (processing format)

**src/forms/examples/**
- Purpose: Reference example data showing expected form submission format
- Contains: JSON files with sample form submissions
- Key files:
  - `person_one.json`: Example submission 1 (John Doe)
  - `person_two.json`: Example submission 2
  - `person_three.json`: Example submission 3
- Not included in builds; documentation/testing only

**src/providers/**
- Purpose: Abstract external service integrations
- Contains: Service adapters with standardized response types
- Key files:
  - `httpresponse.ts`: `HttpResponse<T>` generic type definition
  - `idealpostcodes.ts`: Postcode lookup function
  - `sendgrid.ts`: Email sending function
- Pattern: All functions return `HttpResponse<T>` with statusCode and body

**tests/**
- Purpose: Test suite for application
- Contains: Jest test files (.test.ts extension)
- Key files:
  - `app.test.ts`: Tests for Express routes and handlers

## Key File Locations

**Entry Points:**
- `src/index.ts`: Server initialization, starts listening on PORT
- `src/app.ts`: Express application factory, route definitions

**Configuration:**
- `package.json`: Dependencies, build/dev scripts
- `tsconfig.json`: TypeScript compiler configuration (ES2022, strict mode)
- `jest.config.js`: Jest test runner configuration (ts-jest preset)

**Core Logic:**
- `src/app.ts`: Route handler for POST /ingest
- `src/forms/schemas/`: Data structure definitions
- `src/providers/`: Service integrations (postcode, email)

**Testing:**
- `tests/app.test.ts`: Test suite for route handlers

## Naming Conventions

**Files:**
- TypeScript source: `snake_case.ts` (e.g., `httpresponse.ts`, `ingested_schema.ts`)
- Test files: `{name}.test.ts` (e.g., `app.test.ts`)
- JSON examples: `snake_case.json` (e.g., `person_one.json`)

**Directories:**
- Lowercase plural for collections: `src/forms/`, `src/providers/`, `tests/`
- Lowercase descriptive names: `schemas/`, `examples/`

**Types:**
- PascalCase with "Schema" or "Type" suffix: `IngestedFormSchema`, `TransformedFormSchema`, `HttpResponse`

**Functions:**
- camelCase action verbs: `lookupPostcode()`, `sendEmail()`

**Constants:**
- UPPERCASE_SNAKE_CASE for environment variables (PORT, NODE_ENV)

## Where to Add New Code

**New Feature (Data Transformation):**
- Primary code: `src/` (new files or modify existing)
- Tests: `tests/app.test.ts` or new `tests/feature.test.ts`
- Example: Adding a new validation function would go in `src/` with corresponding test

**New External Service (Provider):**
- Implementation: `src/providers/{service_name}.ts`
- Pattern: Export async function returning `HttpResponse<T>`
- Example: `src/providers/stripe.ts` for payment processing

**New Route:**
- Implementation: Add route in `src/app.ts` or extract to separate file
- Tests: Add test case in `tests/app.test.ts`
- Pattern: Use Express Request/Response with TypeScript types

**New Data Schema:**
- Implementation: Add type definition in `src/forms/schemas/`
- Usage: Import and use in route handlers
- Example: `src/forms/schemas/validation_result_schema.ts` for API response types

**Utilities/Helpers:**
- Shared helpers: Create `src/utils/` directory
- Function organization: Group related functions in single file
- Example: `src/utils/transformers.ts` for data transformation helpers

## Special Directories

**.planning/codebase/**
- Purpose: Generated codebase analysis documents
- Generated: Yes (by codebase mapping tools)
- Committed: Yes
- Contents: ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, etc.

**dist/**
- Purpose: Compiled JavaScript output from TypeScript
- Generated: Yes (by `npm run build` via tsc)
- Committed: No (in .gitignore)
- Entry: `dist/index.js` (main entry point for production)

**node_modules/**
- Purpose: Installed npm dependencies
- Generated: Yes (by npm install)
- Committed: No (in .gitignore)
