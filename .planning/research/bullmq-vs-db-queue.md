# BullMQ vs. SQLite-Backed DB-Polling Consumer

**Research date:** 2026-09-07
**Scope:** Primary-source comparison for a take-home Express + TypeScript form-ingestion service that already uses encrypted SQLite (`better-sqlite3-multiple-ciphers`) + Drizzle ORM to keep reviewer setup at zero external infrastructure.

---

## Recommendation

**Use a hand-rolled SQLite-backed DB-polling consumer, not BullMQ.** BullMQ's own documentation and its lead maintainer are unambiguous that it requires a running Redis (or Redis-API-compatible, e.g. Dragonfly) instance — there is no in-memory, embedded, or SQLite-compatible mode, and a maintainer explicitly told a user asking for a no-Redis single-container setup to "use NodeJS `worker_threads`" instead ([GitHub Discussion #2412](https://github.com/taskforcesh/bullmq/discussions/2412)). Adopting BullMQ would directly reintroduce the exact infra dependency (Redis, or Docker to run it) that motivated the encrypted-SQLite/Drizzle decision in the first place, breaking the `npm install && npm test`-with-zero-external-services goal the project has already committed to.

This is not a case where BullMQ is "better but costs infra" — for this project's actual scale and grading criteria, BullMQ is arguably **worse fit**, not just heavier. BullMQ's real value (its docs' worked examples: [retrying failing jobs](https://docs.bullmq.io/guide/retrying-failing-jobs), [rate limiting](https://docs.bullmq.io/guide/rate-limiting), [deduplication](https://docs.bullmq.io/guide/jobs/deduplication), [stalled-job recovery](https://docs.bullmq.io/guide/jobs/stalled)) is aimed at distributed, multi-worker, high-throughput production systems. A take-home graded by "clone and run in minutes" at low request volume gets none of that value but pays its full setup cost (a Redis server or Docker container the grader must additionally stand up) and, per the BullMQ quick-start's own instructions, requires "a Redis service running in your local computer to run these examples successfully" ([Quick Start](https://docs.bullmq.io/quick-start)).

Everything BullMQ gives "for free" that actually matters at this scale — fixed/exponential backoff, a bounded retry count, a distinguishable terminal-failure state, and single-process concurrency limiting — is between roughly 80 and 150 lines of straightforward, reviewable TypeScript on top of the SQLite schema the project already has (see Question 3). That code is also *more* legible to a grader assessing "resilience/retry design thinking," because the retry/backoff logic is visible, first-party application code rather than delegated to a dependency's internals.

**Recommended shape:** one `jobs` (or `queue`) table with `status`, `attempts`, `next_attempt_at`, `last_error` columns; an insert-triggered or short-interval (`setInterval`, e.g. every 250ms–1s) poll for `status IN ('pending','failed') AND next_attempt_at <= now`; a small in-process concurrency gate (a simple counter, or `p-queue` purely for the concurrency-limiting primitive — explicitly **not** for persistence, see Question 4); and an exponential-backoff calculation (`delay = base * 2^(attempts-1)`, optionally with jitter, mirroring the exact formula BullMQ documents) written by hand. This is a hybrid only in the sense that it borrows BullMQ's documented backoff *formula* as a design reference, not its runtime.

---

## 1. Does BullMQ require Redis?

**Yes — Redis (or a Redis-protocol-compatible store) is a hard requirement.** There is no lightweight, in-memory, or SQLite-compatible backend option.

- The BullMQ docs homepage describes it as "a Node.js library that implements a fast and robust queue system built on top of Redis" ([docs.bullmq.io](https://docs.bullmq.io/)).
- The official [Quick Start](https://docs.bullmq.io/quick-start) page states plainly that "you need to have a Redis service running in your local computer to run these examples successfully" — this is BullMQ's own onboarding instruction, not a third-party description.
- The [GitHub repository README](https://github.com/taskforcesh/bullmq) markets BullMQ as "the fastest, most reliable, Redis-based distributed queue for Node.js, Python, Elixir, .NET, Rust, PHP, and more," and its capability table lists `redis` as the backend across BullMQ's variants.
- The only sanctioned substitute for Redis itself is **Dragonfly**, which the README calls "a new Redis™ drop-in replacement that is fully compatible with BullMQ" — i.e., still a Redis-wire-protocol server process that must be installed and run; it is not an embedded/in-process option.
- Directly asked in a GitHub Discussion whether BullMQ needs Redis when queue and worker run in the same container, maintainer **manast** answered: *"No, you need a Redis instance in order to use BullMQ. In [your] case, if you do not need to scale, you could just use NodeJS `worker_threads`..."* ([Discussion #2412](https://github.com/taskforcesh/bullmq/discussions/2412)). This is a direct maintainer statement confirming there is no way around the Redis dependency, and that the maintainer's own suggested workaround for a no-Redis scenario is to abandon BullMQ in favor of Node's built-in `worker_threads` — i.e., not use BullMQ at all.
- A separate open GitHub issue asking for an in-memory mode ("Is there a way to run BullMQ solely in memory for integration testing?", [Issue #3363](https://github.com/taskforcesh/bullmq/issues/3363)) remains an unresolved feature request with no maintainer commitment to build it, further confirming no such mode currently ships.

**Conclusion:** for this project's zero-external-infra requirement, BullMQ fails outright at the entry gate — a reviewer running `npm install && npm test` would need a Redis server (locally installed or via Docker) present and reachable before any BullMQ-backed queue would even connect.

---

## 2. What BullMQ gives "for free" vs. what a hand-rolled DB-polling consumer must build

| Capability | BullMQ (built-in) | Hand-rolled SQLite polling consumer |
|---|---|---|
| Retry with attempt cap | `attempts` option on `queue.add()` ([Retrying failing jobs](https://docs.bullmq.io/guide/retrying-failing-jobs)) | Must implement: an `attempts` column, increment-and-compare-to-max logic |
| Backoff (fixed) | Built-in `backoff: { type: 'fixed', delay }` ([Retrying failing jobs](https://docs.bullmq.io/guide/retrying-failing-jobs)) | Must implement: store `next_attempt_at`, set it to `now + delay` on failure |
| Backoff (exponential) | Built-in `backoff: { type: 'exponential', delay }`, formula documented as `2^(attempts-1) * delay` ([Retrying failing jobs](https://docs.bullmq.io/guide/retrying-failing-jobs)) | Must implement the same formula by hand — trivial once known, but must be written and tested |
| Custom backoff / jitter | Supported via a custom backoff function on the queue, or a `jitter` percentage option on built-in strategies ([Retrying failing jobs](https://docs.bullmq.io/guide/retrying-failing-jobs)) | Must implement manually (a few lines: `delay * (1 + Math.random()*jitterPct)`) |
| Job persistence across process restart | Implicit — Redis is the durable store as long as Redis itself persists (RDB/AOF, outside BullMQ's control) | Implicit and *simpler* here — the project's SQLite DB is already the durable, encrypted, at-rest store; a `pending`/`failed` row surviving a restart requires no extra code beyond the existing DB write |
| Delayed jobs | Built-in `delay` option, jobs sit in a "delayed set" and move to processing once the delay elapses ([Delayed jobs](https://docs.bullmq.io/guide/jobs/delayed)) | Same `next_attempt_at` column used for backoff serves this purpose directly — no separate mechanism needed |
| Concurrency control | Built-in `concurrency` worker option (defaults to 1), can be changed live via `worker.concurrency = N` ([Concurrency](https://docs.bullmq.io/guide/workers/concurrency)) | Must implement: a simple in-process counter/semaphore around the poll-and-process step, or use a library like `p-queue` purely for this (see Q4) |
| Rate limiting | Built-in, global across all workers on a queue, via `limiter: { max, duration }` ([Rate limiting](https://docs.bullmq.io/guide/rate-limiting)) | Not needed for a single reviewer-run process at low volume; if desired, a token-bucket counter is ~10-20 lines |
| Stalled/crashed-worker recovery | Built-in heartbeat mechanism (default 30s) that returns a job to `waiting` if the worker stops updating it, with a `maxStalledCount` (default 1) before permanent failure ([Stalled jobs](https://docs.bullmq.io/guide/jobs/stalled)) | Must implement: a `processing`/`locked_at` state with a timeout check in the poll loop that requeues rows whose lock is older than N seconds — roughly 10-15 lines |
| Dead-letter / terminal-failure visibility | Failed jobs are kept in a dedicated "failed" set by default so they can be examined, controllable via `removeOnFail` ([Auto-removal of jobs](https://docs.bullmq.io/guide/queues/auto-removal-of-jobs)); BullMQ does not appear to have a dedicated "dead-letter queue" concept as a named primitive — its docs describe this as the ordinary `failed` job state, not a separate DLQ feature | A `status = 'dead'` (or `'failed_permanently'`) value set once `attempts >= maxAttempts`, queryable like any other row — arguably *simpler* to inspect than the docs suggest, since it's plain SQL, not a Redis set requiring BullMQ's client API |
| Job deduplication | Built-in `deduplication` option with Simple/Throttle/Debounce modes ([Deduplication](https://docs.bullmq.io/guide/jobs/deduplication)) | Not part of this project's requirements (form submissions are not described as needing dedup); if needed, a `UNIQUE` constraint or a pre-insert existence check covers the simple case |

**Summary:** BullMQ's genuine value-add over hand-rolling is retry/backoff/concurrency/stalled-job semantics that are *pre-built and tested*, plus multi-process/multi-worker coordination via Redis. For a single-process take-home service, the multi-worker coordination is not needed at all, and the retry/backoff/concurrency/stalled-job logic — while real work — is a well-understood, small, and inspectable amount of code once the target semantics (fixed/exponential backoff, attempt cap, terminal failure state, in-process concurrency limit) are known, which they are: they're documented on the very BullMQ pages cited above and can be reimplemented directly against the SQLite schema.

---

## 3. Realistic setup complexity comparison

### BullMQ + Redis

Per BullMQ's own [Quick Start](https://docs.bullmq.io/quick-start) page: install the library (`npm install bullmq`), **and** separately have "a Redis service running in your local computer" before any of the documented examples work. BullMQ's docs do not provide an npm-installable Redis — the reviewer (or the take-home author, for CI) must separately install and run Redis (a native binary, a Docker container, or a managed cloud instance). This is precisely the class of external-service dependency the project's README/architecture already avoids by choosing encrypted SQLite. Concretely, a reviewer following BullMQ's own instructions needs at minimum one of:
- Redis installed locally (e.g. via a package manager) and running as a background service, or
- `docker run redis` (requires Docker installed and running), or
- A cloud/managed Redis endpoint and credentials.

None of these are satisfied by `npm install && npm test` alone.

### Hand-rolled SQLite polling consumer

Given the schema already exists (Drizzle + `better-sqlite3-multiple-ciphers`), the incremental pieces are:

1. **Schema addition** — `status` (`pending` | `processing` | `completed` | `failed` | `dead`), `attempts` (int), `next_attempt_at` (timestamp), `last_error` (text), `locked_at` (timestamp, for stalled-row detection). ~10-15 lines as a Drizzle table/column definition.
2. **Enqueue on insert** — the existing form-ingestion write already inserts a row; setting `status = 'pending'` on that row is a one-line addition, no separate "trigger" mechanism needed.
3. **Poll loop** — a `setInterval` (or a simple recursive `setTimeout` to avoid overlap) that selects `WHERE status IN ('pending','failed') AND next_attempt_at <= now ORDER BY next_attempt_at LIMIT batchSize`, marks them `processing` + `locked_at = now`, and hands them to the pipeline. ~20-30 lines.
4. **Concurrency gate** — a counter or small semaphore (or `p-queue`, see Q4) bounding how many rows are processed at once. ~5-15 lines depending on whether a library is used.
5. **Backoff/retry calculation** — on failure, increment `attempts`, compute `next_attempt_at = now + base * 2^(attempts-1)` (mirroring BullMQ's own documented exponential formula), optionally add jitter; on `attempts >= max`, set `status = 'dead'` and record `last_error`. ~15-25 lines.
6. **Stalled-row recovery** — on poll, also reclaim rows stuck in `processing` past a timeout (`locked_at < now - staleThreshold`) back to `pending`. ~10-15 lines.
7. **Pipeline glue** — calling the existing validate → transform → geocode → persist → email steps in sequence and catching/recording errors per step. This work exists regardless of which queue mechanism is chosen (BullMQ would need the same processor function), so it isn't incremental queue-infrastructure cost.

**Rough total incremental LOC for the queue mechanism itself (excluding the pipeline steps, which are needed either way): roughly 80-150 lines of TypeScript**, plus tests. This is an estimate based on the pattern described, not a citation-backed figure. It requires zero new runtime dependencies beyond what's already installed (SQLite + Drizzle), and zero new processes for a reviewer to start.

---

## 4. Lighter-weight alternatives

**BullMQ itself has no official lite/embedded/in-memory mode.** Confirmed by:
- No mention of any such mode anywhere in the [docs.bullmq.io](https://docs.bullmq.io/) site content or the [GitHub README](https://github.com/taskforcesh/bullmq) reviewed.
- An open, unresolved GitHub feature request explicitly asking for exactly this ("Is there a way to run BullMQ solely in memory for integration testing?", [Issue #3363](https://github.com/taskforcesh/bullmq/issues/3363)), with no maintainer commitment shown.
- The maintainer's direct answer in [Discussion #2412](https://github.com/taskforcesh/bullmq/discussions/2412): "No, you need a Redis instance in order to use BullMQ," recommending `worker_threads` as the alternative when Redis isn't wanted — i.e., recommending *not using BullMQ* rather than a lite mode.

**npm registry search for SQLite-native queue libraries** (via `https://registry.npmjs.org/-/v1/search`, live searches performed against npm's registry API):

- **`better-queue-sqlite`** — "A Sqlite store for SQLite for better-queue." Exists and does what the task asked about, but is **effectively unmaintained**: latest version 1.0.7, published October 2022 (per the npm registry's own version/time metadata), with multi-year gaps between prior releases (2016 → 2018 → 2021 → 2022). Depends on the callback-style `sqlite3` package (not `better-sqlite3`), and on `async`. Not a good fit to add as a project dependency for a take-home meant to demonstrate good engineering judgment — both because of staleness and because it doesn't integrate with the project's existing `better-sqlite3-multiple-ciphers`/Drizzle stack.
- **`better-queue`** (the base library `better-queue-sqlite` plugs into) — actively describes itself as supporting "persistent (and extendable) storage," "retry on fail," and timing controls, but its own latest version is also from September 2022 per the registry, so it carries similar staleness concerns despite matching feature words.
- **`@sidequest/engine`** / **`@sidequest/core`** — "the core engine of SideQuest, a distributed background job processing system for Node.js and TypeScript," latest version 1.16.3 published August 2026 (actively maintained), but its description does not confirm SQLite as a first-class backend from the registry metadata alone — would need further evaluation and, notably, is a multi-package system (`@sidequest/backend` as a separate dependency), adding more surface area than a hand-rolled table.
- **`@workglow/sqlite`** — described as "SQLite backends for storage and job-queue systems," found via search but not independently vetted for maintenance/adoption in this pass.
- No results for "better-sqlite3 queue" surfaced anything purpose-built and well-adopted beyond the above — the search mostly returned `better-sqlite3` itself and unrelated generic queue data-structure packages (`yocto-queue`, `tinyqueue`, `denque`), which are plain data structures, not durable job queues.
- Notable non-SQLite alternative surfaced in the same searches: **`pg-boss`** ("Queueing jobs in Postgres from Node.js like a boss") — confirms the pattern (DB-table-backed job queue) is an established, named approach in the Node ecosystem, just for Postgres rather than SQLite. This supports the hand-rolled approach as a recognized pattern rather than a one-off improvisation.

**`p-queue`** — confirmed via its npm registry description: **"Promise queue with concurrency control."** This is purely an in-process, in-memory concurrency limiter (bounding how many promises run at once); it has no notion of persistence, durability, retries, or backoff, and nothing in its package description mentions storage or durability. It solves a different, narrower problem than a durable job queue: it would only be useful here as the concurrency-gate piece of a hand-rolled consumer (item 4 in Question 3's list), not as a replacement for the queue table or retry logic. It is optional — a manual counter accomplishes the same thing in a handful of lines.

**Conclusion:** no well-maintained, purpose-built "SQLite job queue" library stands out as clearly better than writing the ~100 lines directly against the project's own schema. The one candidate that matches the exact ask (`better-queue-sqlite`) is stale and pulls in a different SQLite driver than the project already uses.

---

## 5. Recommendation, justified

Given the findings above:

- **Setup friction (Q1, Q3):** BullMQ fails the stated zero-external-infra bar outright — its own Quick Start requires a running Redis service. A DB-polling consumer adds nothing beyond what's already installed.
- **Feature value at this scale (Q2):** BullMQ's built-in retry/backoff/concurrency/stalled-job features are real, but every one of them is small, well-documented (and thus easy to reimplement correctly) at the scale of "a handful of jobs processed by one reviewer running the test suite." BullMQ's remaining differentiators — multi-worker coordination, global rate limiting, deduplication — are not needs this project has.
- **No middle-ground library (Q4):** there is no maintained, drop-in SQLite-native queue library that would remove the need to write this logic anyway, and BullMQ has no lite mode to fall back to. `p-queue` is a useful, honest building block for the concurrency piece only, not a substitute for the durable-queue piece.
- **What a grader is actually assessing:** the prompt frames "demonstrating resilience/retry DESIGN THINKING" as the graded skill, not "correctly configured a third-party queue library." A hand-rolled poller that visibly implements exponential backoff, an attempt cap, a terminal-failure state, and stalled-row recovery *is* the demonstration of that design thinking, directly reviewable in the diff, versus a `backoff: { type: 'exponential' }` config line whose actual behavior lives inside BullMQ's source.

**Recommendation: build the hand-rolled SQLite-backed polling consumer.** Reuse BullMQ's documented backoff formula and semantics as a design reference (cited above) so the implementation is grounded in an established pattern, but do not add BullMQ or Redis as a dependency. If any external concurrency-limiting utility is wanted for polish, `p-queue` is a reasonable, honest addition for that narrow purpose — clearly labeled in code/comments as concurrency-only, not persistence.

---

## Unresolved / lower-confidence points

- I was not able to load `https://docs.bullmq.io/guide/install` directly (404 on that exact path); the equivalent setup guidance was instead sourced from the live [Quick Start](https://docs.bullmq.io/quick-start) page, which is BullMQ's current install/quick-start entry point and states the Redis requirement directly, so the substance of Q1/Q3 is still primary-sourced.
- BullMQ's docs do not use the term "dead-letter queue" as a named feature anywhere I found; I've represented this accurately above as "the ordinary `failed` job state," which is the closest documented equivalent, rather than asserting a DLQ feature that isn't documented.
- `@sidequest/engine`'s SQLite support could not be confirmed one way or the other from registry metadata alone (its README wasn't fetched); flagged in Q4 as unverified rather than asserted.
- npm's website search UI (`npmjs.com/search`) returned HTTP 403 to automated fetches; all npm findings above were obtained instead via the public registry search API (`registry.npmjs.org/-/v1/search`), which is the same underlying data source and is itself a primary source (npm's own registry), just a different endpoint than the human-facing search page.
