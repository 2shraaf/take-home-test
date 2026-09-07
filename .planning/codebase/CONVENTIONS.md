# Coding Conventions

**Analysis Date:** 2026-09-07

## Naming Patterns

**Files:**
- Source files: `lowercase_with_underscores.ts` (e.g., `ingested_schema.ts`, `transformed_schema.ts`)
- Test files: `filename.test.ts` (e.g., `app.test.ts`)
- Export file naming follows module purpose (e.g., `httpresponse.ts`, `idealpostcodes.ts`)

**Functions:**
- camelCase for function names (e.g., `sendEmail`, `lookupPostcode`)
- Arrow function syntax for exports: `export const functionName = async (...) => { ... }`
- Async functions explicitly marked with `async` keyword when dealing with I/O operations

**Variables:**
- camelCase for local variables (e.g., `randomNumber`, `statusCode`, `success`)
- const for all variable declarations (no let/var usage observed)
- Descriptive names reflecting purpose

**Types:**
- PascalCase for type names (e.g., `HttpResponse<T>`, `IngestedFormSchema`, `TransformedFormSchema`)
- Exported types use `type` keyword: `export type TypeName = {...}`
- Union types for enums: `"male" | "female" | "other"` rather than enum objects
- Generic types when applicable (e.g., `HttpResponse<T>`)

**Object Properties:**
- **API Input Schema** (`IngestedFormSchema`): snake_case for external API contracts
  - Example: `session_id`, `application_reference`, `date_of_birth`
- **Internal/Transformed Data** (`TransformedFormSchema`): camelCase for internal TypeScript objects
  - Example: `sessionId`, `applicationReference`, `dateOfBirth`
- This dual-naming approach indicates transformation between external (snake_case) and internal (camelCase) representations

## Code Style

**Formatting:**
- No explicit formatter configured (no .prettierrc or prettier config found)
- Indentation: tabs (observed in jest.config.js, tsconfig.json)
- Line endings: Unix-style (implied by .gitignore patterns)
- Semicolons: Present on all statements

**Linting:**
- No ESLint or linting configuration found (.eslintrc*, eslint.config.* absent)
- Code style relies on developer discipline and TypeScript compiler strictness

## Import Organization

**Order:**
1. External dependencies (e.g., `import express, { Request, Response } from "express"`)
2. Relative imports from project (e.g., `import app from "./app"`)
3. Type imports integrated with value imports (no separate `import type` pattern observed)

**Path Aliases:**
- No path aliases configured in tsconfig.json
- Uses relative paths throughout (e.g., `../src/app`, `./httpresponse`)

**Export Pattern:**
- Default export for main module: `export default app;`
- Named exports for utilities: `export const sendEmail = ...`
- Type exports: `export type HttpResponse<T> = ...`

## Error Handling

**Patterns:**
- Minimal error handling observed in current codebase
- HttpResponse wrapper pattern used to encapsulate status and body:
  ```typescript
  return {
    statusCode: success ? 200 : 500,
    body: success ? data : undefined,
  };
  ```
- Async functions return Promise with typed response

## Logging

**Framework:** console (only `console.log` observed in `src/index.ts`)

**Patterns:**
- Simple console.log for startup messages: `console.log(\`Server is running on http://localhost:${PORT}\`);`
- Template literals used for string interpolation
- No structured logging framework (Winston, Pino, etc.)

## Comments

**When to Comment:**
- Minimal commenting observed in current codebase
- Code is self-documenting through clear naming and type annotations
- No JSDoc blocks found in source files

**JSDoc/TSDoc:**
- Not used in current codebase
- Type safety through TypeScript types reduces need for documentation comments

## Function Design

**Size:** Functions are small and focused (most functions 2-15 lines)

**Parameters:**
- Parameter types explicitly annotated: `(postcode: string)`
- Destructuring used for object parameters: `({ to, from, subject, body }: { to: string; from: string; subject: string; body: string })`
- Inline type annotations for destructured parameters

**Return Values:**
- Explicit return types annotated: `Promise<HttpResponse<{ longitude: number; latitude: number }>>`
- Generic HttpResponse wrapper standardizes return shape across service layer functions
- Functions return union of typed object or undefined within response body

## Module Design

**Exports:**
- Mix of default and named exports
- Entry point (`index.ts`) uses default export for app
- Service functions use named exports (sendEmail, lookupPostcode)
- Type definitions are exported as named type exports

**Barrel Files:**
- Not observed in current structure
- Each module imports directly from target file

## TypeScript Patterns

**Strict Mode:** Enabled (tsconfig.json has `"strict": true`)

**Module System:** CommonJS (tsconfig.json specifies `"module": "commonjs"`)

**Type Safety:**
- Explicit type annotations on function parameters and return types
- Union types for optional/enum-like values
- Generic types for reusable response structures

**Async/Await:**
- Async-first approach for I/O operations
- Promise-based return types explicitly typed

---

*Convention analysis: 2026-09-07*
