# Technology Stack

**Analysis Date:** 2026-09-07

## Languages

**Primary:**
- TypeScript 5.0+ - Full application source code with strict type checking
- JavaScript - Package management and build configuration

## Runtime

**Environment:**
- Node.js (version not explicitly pinned - uses latest compatible)

**Package Manager:**
- npm
- Lockfile: `package-lock.json` present

## Frameworks

**Core:**
- Express 4.22.1 - HTTP server and routing
  - Request/response handling via `express.Request` and `express.Response`
  - JSON body parsing middleware: `express.json()`

**Testing:**
- Jest 29.7.0 - Test runner and assertion framework
  - Config: `jest.config.js` with ts-jest preset
  - Test environment: Node.js
  - Supertest 7.0.0 - HTTP request testing utility

**Build/Dev:**
- TypeScript Compiler (tsc) - Transpilation to JavaScript
  - Output directory: `dist/`
  - Source directory: `src/`
- ts-node-dev 2.0.0 - Development server with auto-reload
  - Hot restart on file changes

## Key Dependencies

**Critical:**
- express 4.22.1 - Core server framework, required for production

**Development:**
- jest 29.7.0 - Testing framework
- ts-jest 29.0.0 - TypeScript loader for Jest
- supertest 7.0.0 - HTTP assertion helper
- typescript 5.0.0 - Type checking and transpilation
- ts-node-dev 2.0.0 - Development server with TypeScript support
- @types/express 5.0.0 - TypeScript definitions for Express
- @types/jest 29.0.0 - TypeScript definitions for Jest
- @types/node 22.0.0 - TypeScript definitions for Node.js runtime
- @types/supertest 6.0.0 - TypeScript definitions for Supertest

## Configuration

**TypeScript:**
- Target: ES2022
- Module: CommonJS
- Strict mode: enabled
- Config file: `tsconfig.json`
- Includes: `src/**/*`, `tests/**/*`
- Excludes: `node_modules`, `dist`

**Build:**
- Entry file: `src/index.ts`
- Output: CommonJS modules in `dist/`
- Compile step: `npm run build` (runs tsc)

**Environment:**
- Runtime port: `process.env.PORT` (defaults to 3000)
- Configuration via environment variables
- Environment files are gitignored (`.env`, `.env.*` patterns)

## Scripts

**Development:**
- `npm run dev` - Start development server with auto-reload via ts-node-dev
- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Run compiled application from `dist/index.js`
- `npm test` - Run Jest test suite

## Platform Requirements

**Development:**
- Node.js 18+ (implied by @types/node 22.0.0)
- npm 7+ (for package-lock.json v2 format)
- TypeScript knowledge for source file authoring

**Production:**
- Node.js runtime
- 3000 (or configurable PORT) accessible for HTTP server

---

*Stack analysis: 2026-09-07*
