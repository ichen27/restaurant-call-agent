# Recruiter Readiness: Reproducible Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task if Ivan chooses native execution, or superpowers:subagent-driven-development if he chooses delegation. Steps use checkbox syntax for tracking.

**Goal:** Make a fresh checkout build, test, and start reproducibly before adding the recruiter demonstration.

**Architecture:** Retain the current application and the 16 unpublished implementation commits. Work in an isolated SSD checkout, use Node 22 consistently, repair precise type/build configuration defects, and demonstrate the existing staff tests under the supported runtime. No order, authentication, or telephony contracts change in this milestone.

**Tech Stack:** Node 22, TypeScript, Express, React/Vite, Vitest, Playwright, PostgreSQL 16.

**Spec:** ../specs/2026-09-24-recruiter-demo-design.md — approved by Ivan on September 24, 2026.

## Global Constraints

- Development runs on the Mac mini, with code under /Volumes/SamsungSSD1/code and tool data under /Volumes/SamsungSSD1/tools.
- No framework migration or new third-party dependency is planned.
- Fix actual type errors without weakening strict TypeScript settings.
- Preserve the existing user changes in README.md, migrations/0005_phone_numbers.sql, src/app.ts, and src/store/memory.ts.
- Do not load production credentials or run integration tests against an existing restaurant database.
- No deployment, production settings change, customer call, or GitHub push occurs merely because a local build passes.
- Report skipped database/browser/provider checks explicitly.

## Scope and subsequent milestones

This plan delivers the reproducible-baseline portion of Milestone 1. It deliberately does not implement the independent demo subsystem or claim to complete the whole approved design.

Next implementation plans, retaining the approved design:
1. Voice/order boundary verification and fixes: duplicate tool delivery, explicit confirmation, menu validation, provider disconnects, transfer failure, and session cleanup.
2. Guided synthetic demo plus shared polished staff views and browser workflow coverage.
3. README, actual screenshots, architecture, recorded walkthrough where available, and dated measurement evidence.

Do not begin those subsystems under this baseline item's approval. The baseline report must record these as remaining work, rather than claiming recruiter readiness.

## Review Focus

1. A fresh checkout without .env must start its local memory-backed development path without asking for provider credentials.
2. A fresh build must produce the exact entry point consumed by npm start and Docker.
3. Every possible byte in a Twilio audio frame must have a defined decode-table entry; preserve PCM output.
4. Node's global Web Storage must not be confused with jsdom storage in staff tests.
5. Integration tests must only receive a disposable database URL because existing suites truncate tables.

## Preparation and preservation

Files:
- Read: /Volumes/SamsungSSD1/AGENTS.md and project-registry.json.
- Read: repository AGENTS.md, agents/orchestrator.md, agents/test-engineer.md.
- Modify during approved execution: BACKLOG.md, REQUESTS.md.
- Create worktree: /Volumes/SamsungSSD1/code/restaurant-call-agent-recruiter.
- Preserve original checkout: /Volumes/SamsungSSD1/code/call-agent.

- [ ] Follow using-git-worktrees before creating the worktree. Recheck HEAD, branch, status, and whether the proposed worktree path or branch already exists.
- [ ] Store a binary diff of the four existing modified files under a dated /Volumes/SamsungSSD1/tmp/restaurant-call-agent-recruiter directory; keep it out of the public repository. Record its checksum.
- [ ] Create branch codex/restaurant-recruiter-baseline from the current local HEAD, including the approved spec and this plan. Do not start from origin/main, which lacks the voice implementation.
- [ ] Inspect the preserved patch for operational values. Do not copy .env, ignored data, or credentials. Apply only the needed reviewed source/doc changes to the isolated checkout; retain the original files and patch.
- [ ] Add DX-2012, “Reproducible recruiter baseline,” to BACKLOG.md, with this plan's scope and acceptance criteria. Set READY + APPROVED only after Ivan approves this written plan. Record the approval in REQUESTS.md without reopening the design question.
- [ ] Record the existing commit count and uncommitted file hashes in the local work record. Recheck the original checkout at the end.

## Task 1: Align runtime and lockfile-based checks

**Files:**
- Create: .nvmrc
- Modify: package.json, package-lock.json
- Modify: apps/staff-web/package.json, apps/staff-web/package-lock.json
- Modify: .github/workflows/ci.yml
- Modify: README.md, AGENTS.md, DECISIONS.md

**Interfaces:**
- Consumes the existing npm scripts and lockfiles.
- Produces a documented Node 22 runtime, staff:web:typecheck, and CI that uses lockfiles for both packages.

Evidence already collected:
- Mini default Node is 25.9.0; CI and Docker use Node 22.
- Plain staff tests fail on missing localStorage methods.
- Running with NODE_OPTIONS=--no-experimental-webstorage passes both staff tests.
- Standalone frontend TypeScript checking already passes.
- Do not change application storage code to compensate for the host runtime.

- [ ] Locate an existing Node 22 runtime on the SSD. If absent, install a project-scoped official Node 22 runtime under tools/node22, verify its upstream checksum, and record its exact version. Do not replace system Node or change unrelated services.
- [ ] Install existing dependencies with npm ci in the root and npm --prefix apps/staff-web ci using Node 22. Keep dependency caches on the SSD. No dependency upgrades.
- [ ] Run the existing frontend tests without NODE_OPTIONS on Node 22 and record the result before making code changes. If they still fail, inspect globalThis.localStorage versus window.localStorage in the jsdom test context and resolve the environment boundary before proceeding.
- [ ] Add .nvmrc with exactly:
```text
22
```
- [ ] Add the same engines declaration to both package manifests:
```json
"engines": { "node": ">=22 <23" }
```
- [ ] Add these script entries while preserving the other scripts:
```json
// apps/staff-web/package.json
"typecheck": "tsc --noEmit"

// root package.json
"staff:web:typecheck": "npm --prefix apps/staff-web run typecheck",
"ci:staff": "npm run staff:web:typecheck && npm run staff:web:test && npm run staff:web:build"
```
The comments identify destination files and must not appear in JSON.
- [ ] Refresh only lockfile root metadata using npm install --package-lock-only --ignore-scripts in each package. Inspect the diff; retain all existing dependency resolutions.
- [ ] In each Actions setup-node step, replace node-version: 22 with node-version-file: .nvmrc. In staff-web, replace npm --prefix apps/staff-web install with npm --prefix apps/staff-web ci and run npm run ci:staff after installing both packages.
- [ ] Update AGENTS.md to describe the actual existing workflow and include the frontend typecheck command. Add a dated decision explaining Node 22 alignment and the observed Node 25 storage collision.
- [ ] Run npm run ci:staff on Node 22, with no experimental-storage override. Expected: typecheck, 2 existing component tests, and Vite build pass.
- [ ] Commit only this task's reviewed changes as “chore: align development and CI on Node 22”.

## Task 2: Repair strict backend typing without altering audio output

**Files:**
- Modify: src/workers/call-audio.ts
- Modify: tests/logger.test.ts
- Modify: tests/callAudio.test.ts

**Interfaces:**
- Preserve mulawToPcm16(mulawBuf: Buffer): Buffer and all existing audio functions.
- Preserve safeLog and its runtime implementation.
- Produce exact mock logger typing and a defined lookup for every possible byte.

- [ ] Run npm run typecheck and retain the existing failure output. This is the pre-fix regression check for the type errors.
- [ ] Add the following test within the mulawToPcm16 describe block:
```ts
it('decodes all byte values and preserves reference samples', () => {
  const input = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
  const output = mulawToPcm16(input);
  expect(output.length).toBe(512);
  expect(output.readInt16LE(0x00 * 2)).toBe(-32124);
  expect(output.readInt16LE(0x80 * 2)).toBe(32124);
  expect(output.readInt16LE(0x7f * 2)).toBe(0);
  expect(output.readInt16LE(0xff * 2)).toBe(0);
});

it('returns empty PCM for an empty frame', () => {
  expect(mulawToPcm16(Buffer.alloc(0))).toEqual(Buffer.alloc(0));
});
```
These pin unchanged output; they need not fail before a typing-only correction.
- [ ] Run npx vitest run tests/callAudio.test.ts to establish that the added reference assertions match current behavior.
- [ ] Change the decode lookup in the bounded loop to:
```ts
// A Buffer byte is 0..255; the decode table contains all 256 entries.
pcm.writeInt16LE(MULAW_DECODE_TABLE[mulawBuf[i]!]!, i * 2);
```
Do not substitute a silent zero fallback for an impossible missing entry or disable noUncheckedIndexedAccess.
- [ ] Replace the mock logger's unconstrained Record<string, ...> type with:
```ts
type MockLogger = Record<'info' | 'warn' | 'error', ReturnType<typeof vi.fn>>;

async function getMockLogger(): Promise<MockLogger> {
  const mod = await import('pino') as unknown as { __mockLogger: MockLogger };
  return mod.__mockLogger;
}
```
- [ ] Run npm run typecheck and npx vitest run tests/callAudio.test.ts tests/logger.test.ts. Expected: both commands exit zero.
- [ ] Commit as “fix: satisfy strict audio and logger mock typing”.

## Task 3: Make fresh-checkout build and startup agree

**Files:**
- Create: tsconfig.build.json
- Modify: package.json
- Modify: Dockerfile
- Modify: README.md
- Modify: CHANGELOG.md
- Create: docs/14_Recruiter_Baseline_Verification.md

**Interfaces:**
- Existing npm run typecheck continues to include src and tests.
- npm run build emits runtime source only, with dist/index.js as the entry point.
- npm start continues to execute node dist/index.js.
- npm run dev can start without a .env file; explicit provider configuration remains necessary for real phone calls.

Evidence: existing local output contains dist/src/index.js because the base TypeScript project includes both src and tests. Docker copies only src, so the implicit output root differs between environments.

- [ ] Add tsconfig.build.json:
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"],
  "exclude": ["tests", "dist", "node_modules"]
}
```
- [ ] Update these root script values:
```json
"build": "tsc -p tsconfig.build.json",
"dev": "node --env-file-if-exists=.env --import tsx/esm --watch src/index.ts"
```
- [ ] Update Dockerfile's configuration copy:
```dockerfile
COPY tsconfig.json tsconfig.build.json ./
```
- [ ] In the isolated worktree only, remove the ignored dist output with a path-scoped filesystem operation. Run npm run build and verify:
```sh
test -f dist/index.js
test ! -d dist/tests
```
- [ ] Choose an unused local port after checking listeners. Start the built app with NODE_ENV=test, STORE_BACKEND=memory, and that explicit PORT. Do not load .env or connect a telephony client. Fetch /health and confirm ok=true and backend=memory; terminate only the process started for this check.
- [ ] Repeat the health check using npm run dev with no .env in the worktree. Confirm that startup does not fail for a missing .env. Do not alter the original checkout's environment file.
- [ ] Amend the existing README changes, preserving the user's prose while fixing factual setup instructions. Use Node 22, npm ci for each package, and separate local staff-demo setup from provider-backed calling. Remove the obsolete claim that the new voice worker still uses the removed deterministic state machine.
- [ ] Run npm run ci on Node 22 and record exact pass/fail/skip totals.
- [ ] Run the existing browser login test on an isolated local frontend port. Ensure Playwright launches its own server and does not reuse an unrelated existing application; record browser version and result.
- [ ] Inspect available Docker/PostgreSQL tools. If available, run the existing database suite sequentially against a new disposable PostgreSQL 16 instance with a unique database and explicit connection URL. The suites migrate and truncate tables; never reuse any discovered production DATABASE_URL. Remove only the test instance afterward.
- [ ] If a browser or database runtime is unavailable, record that check as NOT RUN with the concrete reason. Do not silently count a skipped database suite as a database pass.
- [ ] If Docker is available, build the image from this checkout and smoke-test /health using isolated memory storage. Do not start the existing production docker-compose deployment.
- [ ] Write docs/14_Recruiter_Baseline_Verification.md with the exact Node/npm versions, commit, commands, observed results, database/browser limitations, original-work preservation, and remaining recruiter milestones.
- [ ] Update CHANGELOG.md with the runtime, strict typing, startup, and CI fixes; mark DX-2012 DONE only after required baseline checks pass and optional gaps are explicitly recorded.
- [ ] Commit as “fix: make local and container build entry points consistent”.

## Whole-milestone review and handoff

- [ ] Review the resulting diff against the approved design and this plan. No broad dependency upgrades, user-file overwrite, unrelated formatting, production data access, or behavioral order changes.
- [ ] Obtain the independent reviewer required by the selected execution skill after implementation.
- [ ] Verify git diff --check, clean intended worktree state, and original checkout preservation.
- [ ] Report changes, exact verification results, unresolved risks, branch/path, and remaining work. Update the Obsidian project note.
- [ ] Do not publish the branch or claim a verified live phone demo from these checks.

## Rollback

The work remains on codex/restaurant-recruiter-baseline. Revert the individual task commits if necessary. The original checkout, preserved patch, and unpublished history remain intact. No deployment rollback is needed because this plan changes no running production service.
