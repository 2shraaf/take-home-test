# 07: Documentation and edge-case test hardening

**What to build:** README setup instructions (environment variables, how to run, how to run tests) and a scope/future-work section referencing all three ADRs (encrypted SQLite over Postgres, DB-backed queue over an external broker, duplicate-identity strategy) so a reviewer understands what was deliberately excluded and why, not just what's missing. Fill in any transform edge-case tests not already covered inline by earlier tickets — in particular the single-token name case and a malformed date-of-birth case.

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] README documents required environment variables and how to run the service and test suite with zero external infrastructure
- [ ] README's scope/future-work section references all three ADRs and states what was excluded and why
- [ ] A unit test covers the single-token name edge case (empty surname, flagged)
- [ ] A unit test covers a malformed date-of-birth value (treated as a validation failure)
- [ ] A fresh clone can run `npm install && npm test` successfully with no manual setup steps
