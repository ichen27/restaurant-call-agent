# Verification — September 24, 2026

These results describe the recruiter product demo and the repository checks run on the Mac mini. They are not a claim about production telephone performance.

## Environment

- Node 22.23.3, macOS arm64.
- PostgreSQL 16 in a dedicated disposable container.
- Chromium through the checked-in Playwright test stack.
- Docker image built from Dockerfile.demo; container runs as node with a read-only filesystem.

## Results

| Check | Observed result |
| --- | --- |
| Root lint and TypeScript checks | Passed |
| Backend unit/API tests | 200 passed; 8 database tests run separately |
| Staff TypeScript / component tests / build | Passed; 2 component tests |
| Demo browser workflows | 3 passed: full pickup lifecycle, unavailable-item handoff/reset, mobile menu controls/no horizontal overflow |
| Original staff login browser workflow | 1 passed |
| PostgreSQL integration | 8 passed against isolated test storage |
| Demo image | Built successfully |
| Running demo container | UI returns 200; health is OK; a session creates four sample orders |
| Desktop/mobile visual check | Actual screenshots inspected; no clipped controls or horizontal overflow observed |
| Provider-backed telephone call | Not run |
| Real transfer / speech accuracy / voice latency | Not measured |

The backend tests include duplicate voice submission, server-owned prices, unavailable items, explicit demo confirmation, concurrent confirmation, illegal transitions, session isolation/expiry/capacity, stale-call rejection, bounded scenario history, reset-resistant mutation limits, repeated conversation steps, and invalid menu inputs.

## Reproduction

```bash
npm ci
npm --prefix apps/staff-web ci
npm run ci
npm --prefix apps/staff-web exec playwright install chromium
npm run demo:test:e2e
```

Database check, with only disposable credentials:

```bash
DATABASE_URL=postgres://test:test@localhost:5432/restaurant_test npm run test:integration
```

Container check:

```bash
docker compose -f compose.demo.yml up --build -d
curl --fail http://localhost:4173/health
```

## Observations and fixes

- Node 25's global Web Storage collided with the older jsdom test environment. Both component tests pass unchanged under the documented Node 22 runtime.
- Strict TypeScript checking exposed a guaranteed decode-table lookup and overly broad logger mock typing. Both were corrected without weakening compiler settings.
- Local builds included tests and emitted dist/src/index.js while startup expected dist/index.js. A source-only build configuration now produces the same entry point locally and in containers.
- Repeated voice submissions previously generated new random order IDs. Stable per-call idempotency now prevents duplicate order/event creation.
- Running database suites twice exposed a non-repeatable phone-number migration. The migration is now repeatable and database suites run sequentially.
- One early backend run returned an unexpected 501 in a realtime-auth test. The targeted rerun and subsequent full checks passed; no application route emits 501. This observation is retained rather than silently discarded.

### Final review fixes
An independent review found three issues, each reproduced with a failing regression test before correction:
- A retry after a menu change could reject an already accepted order. The voice API now resolves its stable identity before current menu validation.
- Simultaneous PostgreSQL submissions could collide on the idempotency key. The losing transaction now rolls back and returns the committed order.
- A delayed conversation step could advance a replacement call. Each step now identifies its call as well as its cursor.
- A session could accumulate unbounded history. Sessions now permit 30 scenarios between resets and 120 mutations per minute; resetting does not bypass the mutation limit.

The unavailable-item outcome now offers an explicit workspace reset, and the browser test verifies that a pickup order succeeds afterward.

## Local order visibility measurement

Ten fresh Chromium sessions against the local demo container measured elapsed time from the Playwright confirmation click to the Alex Morgan order card becoming visible. The samples in milliseconds were 77, 75, 72, 76, 93, 74, 97, 93, 87, and 95.

Median: **82 ms**. Nearest-rank p95 (the maximum for ten samples): **97 ms**.

This includes browser automation and local HTTP/rendering time. It is a small local measurement, not a production latency target, speech response measurement, or network benchmark.

Reproduce with the demo running:

```bash
DEMO_URL=http://localhost:4173 node scripts/measure-demo.mjs
```

## Boundaries

The guided conversation is scripted. The UI and shared order logic are real. Public demo sessions are temporary and limited; the demo is a single-instance application. No real customer information or production credentials were used.

The provider-backed path needs independent validation of current API compatibility, admission/signature checks, explicit caller confirmation, interruptions, reconnect behavior, and actual staff transfer. Existing planning targets are not measured production results.

The original checkout's four uncommitted files were preserved. Implementation takes place on codex/restaurant-recruiter-baseline in an isolated SSD worktree.
