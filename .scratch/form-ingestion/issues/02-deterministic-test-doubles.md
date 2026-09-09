# 02: Deterministic test doubles for external providers

**What to build:** A way for tests to control the geocoding and email providers' outcomes — force success, force failure, and control the delay — without changing how those providers behave in production. The existing `Math.random()`-based mocks keep simulating realistic real-world flakiness outside of tests; only the test-time seam becomes controllable.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] A test can force the geocoding provider to succeed, on demand
- [ ] A test can force the geocoding provider to fail, on demand
- [ ] A test can force the email provider to succeed, on demand
- [ ] A test can force the email provider to fail, on demand
- [ ] A test can control (or eliminate) the artificial delay on either provider
- [ ] Production behavior (the real, unforced code path) is unchanged — still realistically flaky, not made always-successful
