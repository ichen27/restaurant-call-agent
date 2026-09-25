# BACKLOG

## Rules (for agents)
- The file first starts with a file description, followed by a template, followed by the live backlog.
- You may only implement items where: `Status: READY` **and** `Approval: APPROVED`.
- If info is missing, convert the item to `TRIAGE` or `BLOCKED` and write a request in `REQUESTS.md`.
- One item at a time. New discoveries become new backlog items (do not expand scope mid-task).
- Please follow the template when implementing new backlog items


# =========================
# ===== TEMPLATE (READ-ONLY)
# =========================

## Backlog Template
---

### NOW (READY + APPROVED)
<!-- Approved items go here -->
---
### QUEUE (TRIAGE / READY but not approved)
<!-- Items being shaped for approval live here -->
---
### IDEAS FUNCTIONAL REQUIREMENTS (RAW)
<!-- One-liners only. Convert to TRIAGE when selected. -->
---
### DONE (recent)
<!-- Keep last ~10 for quick reference -->


## Work Item Template
### <TYPE>-<####> — <NAME>

Type: FEAT | BUG | DOC | REFACTOR | CHORE | PERF | SEC | DX
ID: <TYPE>-<####>
Priority: HIGH | MEDIUM | LOW
Risk: LOW | MEDIUM | HIGH

Approval: REQUIRED | APPROVED
Status: IDEA | TRIAGE | READY | DOING | BLOCKED | DONE
Blocking: <optional: what is blocking it / link to REQ-###>

Owner: AI
Created: YYYY-MM-DD
Last updated: YYYY-MM-DD

Context:
- <What’s happening today / why this exists>
- <For bugs: where observed + impact>

Goal (user-facing outcome):
- <What changes for the user or system>

In Scope:
- <bullet>
- <bullet>

Out of Scope:
- <bullet>
- <bullet>

Constraints:
- Follow existing patterns in: <file paths or modules>
- No new dependencies unless approved
- Backward compatible APIs (unless explicitly approved)
- Do not log secrets / PII

Assumptions:
- <If needed; otherwise “None”>

Acceptance Criteria:
- [ ] <testable outcome>
- [ ] <testable outcome>

Implementation Notes (optional):
- Approach: <1–5 bullets>
- Edge cases: <bullets>

Files to Start Reading:
- <path A>
- <path B>
- <path C>

Test Plan (must run + report results):
- Lint: <command>
- Typecheck: <command>
- Unit: <command>
- Integration: <command>
- E2E/smoke: <command or “N/A”>

Verification Results (fill after work):
- Lint: PASS/FAIL + notes
- Typecheck: PASS/FAIL + notes
- Unit: PASS/FAIL + notes
- Integration: PASS/FAIL + notes
- E2E/smoke: PASS/FAIL + notes

Rollback Strategy:
- <Revert commit / feature flag / config toggle / migration rollback>


# =========================
# ===== LIVE BACKLOG BELOW
# =========================

---

## NOW (READY + APPROVED)

<!-- Approved items go here -->

---
## QUEUE (TRIAGE / READY but not approved)

### FEAT-2001 — API Contract + Store Scope Closure

Type: FEAT
ID: FEAT-2001
Priority: HIGH
Risk: HIGH

Approval: APPROVED
Status: DONE
Blocking: None

Owner: AI
Created: 2026-02-22
Last updated: 2026-02-22

Context:
- `docs/05_API_Spec.md` and implementation have drift on key staff/store endpoints.
- Auth store-scope is enforced on some write routes but missing on key read routes.

Goal (user-facing outcome):
- Staff/manager API behavior matches documented MVP contract with safe multi-store boundaries.

In Scope:
- Add `GET /api/stores/:storeId` per API spec.
- Enforce authenticated token store scope on `GET /api/orders` and `GET /api/orders/:orderId`.
- Extend `PATCH /api/orders/:orderId` for reject reason, optional note, optional promised time update with validation.
- Add/extend route tests for all new contract and auth behaviors.

Out of Scope:
- New external integrations.
- Large response schema redesign outside MVP spec.

Constraints:
- Follow existing patterns in: `src/app.ts`, `src/store/repository.ts`, `tests/authRoutes.test.ts`, `tests/postgresApi.integration.test.ts`
- No new dependencies unless approved
- Backward compatible APIs (unless explicitly approved)
- Do not log secrets / PII

Assumptions:
- Existing clients can handle additive fields in order update payloads.

Acceptance Criteria:
- [ ] `GET /api/stores/:storeId` implemented and store-scoped.
- [ ] Authenticated cross-store access to order list/detail returns `403`.
- [ ] Reject status requires reason; invalid payloads return `400` with safe structured errors.
- [ ] Unit/integration tests cover happy + failure + authz paths.

Files to Start Reading:
- `src/app.ts`
- `src/store/memory.ts`
- `src/store/postgres.ts`

Test Plan (must run + report results):
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Unit: `npm test`
- Integration: `npm run test:integration`
- E2E/smoke: `N/A`

Verification Results (fill after work):
- Lint: TODO
- Typecheck: TODO
- Unit: TODO
- Integration: TODO
- E2E/smoke: TODO

Rollback Strategy:
- Revert API route changes; keep existing auth gates and idempotency untouched.

### FEAT-2002 — Voice Flow Completion (Readback, Clarification Policy, Busy Mode, Handoff Summary)

Type: FEAT
ID: FEAT-2002
Priority: HIGH
Risk: HIGH

Approval: APPROVED
Status: DONE
Blocking: FEAT-2001

Owner: AI
Created: 2026-02-22
Last updated: 2026-02-22

Context:
- Voice state machine exists but does not yet satisfy full MVP acceptance in `docs/02_User_Stories_MVP.md`.
- Current flow lacks full order readback, retry policy alignment, and structured handoff data.

Goal (user-facing outcome):
- Caller can reliably place a compliant pickup order with safe escalation paths.

In Scope:
- Add full readback summary before confirmation (name, phone, items, qty, notes/modifiers if present).
- Enforce max 2 clarification attempts then transfer/handoff.
- Implement BUSY mode prep-time messaging behavior.
- Emit structured handoff summary event/payload for staff view.
- Add telephony tests for all above paths.

Out of Scope:
- Full LLM-driven NLU redesign.
- Delivery workflow beyond MVP transfer policy.

Constraints:
- Follow existing patterns in: `src/voice/stateMachine.ts`, `src/voice/tools.ts`, `tests/telephony.test.ts`
- No new dependencies unless approved
- Backward compatible APIs (unless explicitly approved)
- Do not log secrets / PII

Assumptions:
- Handoff summary can be represented as order event payload in MVP.

Acceptance Criteria:
- [ ] Confirmation step includes full deterministic order summary.
- [ ] Ambiguous-item flow hard-stops after two failed clarifications.
- [ ] BUSY mode changes customer-facing prep-time response.
- [ ] Telephony tests cover happy path, ambiguous path, busy mode, and handoff.

Files to Start Reading:
- `src/voice/stateMachine.ts`
- `src/voice/tools.ts`
- `tests/telephony.test.ts`

Test Plan (must run + report results):
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Unit: `npm test`
- Integration: `npm run test:integration`
- E2E/smoke: `N/A`

Verification Results (fill after work):
- Lint: TODO
- Typecheck: TODO
- Unit: TODO
- Integration: TODO
- E2E/smoke: TODO

Rollback Strategy:
- Revert voice state transitions and tool contract changes.

### FEAT-2003 — Staff UI Workflow Completion (Detail Drawer, Reject Reason, Call Customer)

Type: FEAT
ID: FEAT-2003
Priority: HIGH
Risk: MEDIUM

Approval: APPROVED
Status: DONE
Blocking: FEAT-2001

Owner: AI
Created: 2026-02-22
Last updated: 2026-02-22

Context:
- Current UI shell lacks required detail workflow and reject-with-reason behavior from UX and user stories.
- Staff cannot inspect audit trail or trigger customer call from UI.

Goal (user-facing outcome):
- Staff can fully process and manage each order from the app without backend/manual workarounds.

In Scope:
- Add order detail drawer/modal with items + events/audit display.
- Add reject action with required reason and optional note.
- Add `tel:` call customer action.
- Improve error handling and action feedback around order workflow actions.

Out of Scope:
- Full design-system overhaul.
- Multi-store UX redesign.

Constraints:
- Follow existing patterns in: `apps/staff-web/src/App.tsx`, `docs/06_UX_UI_Spec.md`
- No new dependencies unless approved
- Backward compatible APIs (unless explicitly approved)
- Do not log secrets / PII

Assumptions:
- Additive backend payload fields are available from FEAT-2001.

Acceptance Criteria:
- [ ] Detail view shows full order data and audit/event timeline.
- [ ] Reject action is blocked without reason and persists reason in backend.
- [ ] Customer phone action renders valid `tel:` link.
- [ ] Manual smoke confirms end-to-end staff status flow.

Files to Start Reading:
- `apps/staff-web/src/App.tsx`
- `src/app.ts`
- `docs/06_UX_UI_Spec.md`

Test Plan (must run + report results):
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Unit: `npm test`
- Integration: `npm run test:integration`
- E2E/smoke: `npm run build && (cd apps/staff-web && npm run build)`

Verification Results (fill after work):
- Lint: TODO
- Typecheck: TODO
- Unit: TODO
- Integration: TODO
- E2E/smoke: TODO

Rollback Strategy:
- Revert UI detail/reject components and related route field handling.

### FEAT-2004 — Realtime Resilience (Cursor Persistence, Reconnect Catch-up, Polling Fallback)

Type: FEAT
ID: FEAT-2004
Priority: HIGH
Risk: HIGH

Approval: APPROVED
Status: DONE
Blocking: FEAT-2003

Owner: AI
Created: 2026-02-22
Last updated: 2026-02-22

Context:
- WebSocket path exists but resilience behavior is incomplete for disconnects and missed event recovery.
- MVP requires no missed orders after reconnect.

Goal (user-facing outcome):
- Staff UI remains trustworthy during network interruptions and recovers without lost events.

In Scope:
- Persist event cursor and unread/ack state in local/session storage.
- Add polling fallback while websocket is disconnected.
- Harden reconnect catch-up and de-duplication logic.
- Add integration tests for reconnect and replay behavior.

Out of Scope:
- Multi-instance shared broker rollout.
- New realtime protocol version.

Constraints:
- Follow existing patterns in: `apps/staff-web/src/App.tsx`, `src/realtime/gateway.ts`, `tests/realtimeRoutes.test.ts`
- No new dependencies unless approved
- Backward compatible APIs (unless explicitly approved)
- Do not log secrets / PII

Assumptions:
- Existing `/api/stores/:storeId/events` endpoint remains replay source.

Acceptance Criteria:
- [ ] Reconnect resumes from persisted cursor without duplicate state churn.
- [ ] UI can poll and keep board fresh while WS is down.
- [ ] Integration coverage validates disconnect -> order creation -> reconnect -> replay path.

Files to Start Reading:
- `apps/staff-web/src/App.tsx`
- `src/realtime/gateway.ts`
- `tests/realtimeRoutes.test.ts`

Test Plan (must run + report results):
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Unit: `npm test`
- Integration: `npm run test:integration`
- E2E/smoke: `N/A`

Verification Results (fill after work):
- Lint: TODO
- Typecheck: TODO
- Unit: TODO
- Integration: TODO
- E2E/smoke: TODO

Rollback Strategy:
- Revert fallback polling/cursor persistence logic and keep current WS-only path.

### FEAT-2005 — Outbox Worker Runtime Hardening + Operational Controls

Type: FEAT
ID: FEAT-2005
Priority: HIGH
Risk: HIGH

Approval: APPROVED
Status: DONE
Blocking: FEAT-2004

Owner: AI
Created: 2026-02-22
Last updated: 2026-02-22

Context:
- Worker currently executes one batch then exits.
- MVP reliability needs sustained processing and safer dead-letter operations.

Goal (user-facing outcome):
- Outbox delivery is continuously processed with clear operator controls for failures.

In Scope:
- Add long-running worker mode with interval loop and graceful shutdown.
- Add dead-letter inspection/replay controls for local/dev/stage operations.
- Add tests for continuous processing and replay safety.

Out of Scope:
- Redis/queue infrastructure migration.
- Exactly-once delivery semantics.

Constraints:
- Follow existing patterns in: `src/workers/outbox.ts`, `src/workers/outboxRunner.ts`, `src/workers/publishers.ts`
- No new dependencies unless approved
- Backward compatible APIs (unless explicitly approved)
- Do not log secrets / PII

Assumptions:
- At-least-once delivery remains acceptable with idempotent consumers.

Acceptance Criteria:
- [ ] Worker can run continuously and stop cleanly on process signals.
- [ ] Operators can inspect and replay dead-lettered events safely.
- [ ] Worker metrics logs include before/after backlog counts per batch.

Files to Start Reading:
- `src/workers/outbox.ts`
- `src/workers/outboxRunner.ts`
- `docs/09_Observability_Plan.md`

Test Plan (must run + report results):
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Unit: `npm test`
- Integration: `npm run test:integration`
- E2E/smoke: `N/A`

Verification Results (fill after work):
- Lint: TODO
- Typecheck: TODO
- Unit: TODO
- Integration: TODO
- E2E/smoke: TODO

Rollback Strategy:
- Revert to one-shot worker execution mode.

### SEC-2006 — Abuse Controls + Secure Runtime Defaults

Type: SEC
ID: SEC-2006
Priority: HIGH
Risk: HIGH

Approval: APPROVED
Status: DONE
Blocking: FEAT-2001

Owner: AI
Created: 2026-02-22
Last updated: 2026-02-22

Context:
- Security checklist has important unchecked controls: rate limiting, strict secret validation, and abuse-path tests.
- Public telephony/internal surfaces need stronger runtime guardrails.

Goal (user-facing outcome):
- Production deployments fail safe, and abusive request patterns are constrained.

In Scope:
- Add basic per-route rate limiting for public telephony and selected API routes.
- Add startup validation for required secrets in non-local environments.
- Add negative tests for rate-limit and missing-secret configurations.

Out of Scope:
- WAF/IP allowlist infrastructure rollout.
- Compliance certification process.

Constraints:
- Follow existing patterns in: `src/app.ts`, `src/auth/config.ts`, `tests/internalSecurity.test.ts`
- No new dependencies unless approved
- Backward compatible APIs (unless explicitly approved)
- Do not log secrets / PII

Assumptions:
- In-memory limiter is acceptable for MVP single-instance and pilot stage.

Acceptance Criteria:
- [ ] Rate limiting returns deterministic error responses under abuse load.
- [ ] Non-local boot fails fast if critical auth/service secrets are missing.
- [ ] Security tests validate reject paths.

Files to Start Reading:
- `src/app.ts`
- `src/auth/config.ts`
- `docs/10_Security_Privacy_Checklist.md`

Test Plan (must run + report results):
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Unit: `npm test`
- Integration: `npm run test:integration`
- E2E/smoke: `N/A`

Verification Results (fill after work):
- Lint: TODO
- Typecheck: TODO
- Unit: TODO
- Integration: TODO
- E2E/smoke: TODO

Rollback Strategy:
- Disable limiter paths behind config and revert startup strict-mode checks if required.

### FEAT-2007 — Launch Controls (`agent_enabled`, `order_intake_enabled`) + Safe Rollback Behavior

Type: FEAT
ID: FEAT-2007
Priority: HIGH
Risk: MEDIUM

Approval: APPROVED
Status: DONE
Blocking: FEAT-2002

Owner: AI
Created: 2026-02-22
Last updated: 2026-02-22

Context:
- Launch/rollback docs depend on feature flags not yet implemented.
- Operations need immediate disable switches without code deploy.

Goal (user-facing outcome):
- Ops can disable automated intake safely during incidents while preserving visibility.

In Scope:
- Implement `agent_enabled` behavior for telephony flow gating.
- Implement `order_intake_enabled` behavior for order creation guard.
- Add explicit responses/logs for disabled states.
- Add tests for flag behavior and rollback semantics.

Out of Scope:
- Full feature-flag platform integration.
- Dynamic per-store flag UI.

Constraints:
- Follow existing patterns in: `src/app.ts`, `src/voice/stateMachine.ts`, `docs/11_Launch_and_Rollback_Plan.md`
- No new dependencies unless approved
- Backward compatible APIs (unless explicitly approved)
- Do not log secrets / PII

Assumptions:
- Env-based flags are sufficient for MVP rollout.

Acceptance Criteria:
- [ ] Telephony/order paths respect disabled flags with deterministic safe behavior.
- [ ] Rollback simulation confirms no new automated orders while system remains observable.
- [ ] Docs and tests cover operational runbook usage.

Files to Start Reading:
- `src/app.ts`
- `src/voice/stateMachine.ts`
- `docs/11_Launch_and_Rollback_Plan.md`

Test Plan (must run + report results):
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Unit: `npm test`
- Integration: `npm run test:integration`
- E2E/smoke: `N/A`

Verification Results (fill after work):
- Lint: TODO
- Typecheck: TODO
- Unit: TODO
- Integration: TODO
- E2E/smoke: TODO

Rollback Strategy:
- Revert flag checks and restore previous flow defaults.

### DX-2008 — End-to-End and Frontend Test Coverage Expansion

Type: DX
ID: DX-2008
Priority: HIGH
Risk: MEDIUM

Approval: APPROVED
Status: DONE
Blocking: Human decision on allowed frontend testing dependencies (REQ needed)

Owner: AI
Created: 2026-02-22
Last updated: 2026-02-22

Context:
- Backend tests are strong, but staff-web has no automated test suite.
- MVP test plan requires call->order->staff workflow and reconnect behavior evidence.

Goal (user-facing outcome):
- Regressions are caught automatically across backend + staff-web critical workflows.

In Scope:
- Add frontend test harness for critical UI flows.
- Add E2E flow for call simulation through order lifecycle and UI update verification.
- Add reconnect + replay resilience tests to automated suite.

Out of Scope:
- Visual regression platform.
- Non-critical UI micro-interaction testing.

Constraints:
- Follow existing patterns in: `tests/`, `apps/staff-web/src/`
- No new dependencies unless approved
- Backward compatible APIs (unless explicitly approved)
- Do not log secrets / PII

Assumptions:
- Human approval is required before adding frontend test dependencies.

Acceptance Criteria:
- [ ] Automated suite validates MVP critical flows end-to-end.
- [ ] Frontend workflow regressions are checked in CI path.
- [ ] Test docs updated with execution guidance.

Files to Start Reading:
- `docs/07_Test_Plan.md`
- `apps/staff-web/src/App.tsx`
- `tests/telephony.test.ts`

Test Plan (must run + report results):
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Unit: `npm test`
- Integration: `npm run test:integration`
- E2E/smoke: `TBD after dependency approval`

Verification Results (fill after work):
- Lint: TODO
- Typecheck: TODO
- Unit: TODO
- Integration: TODO
- E2E/smoke: TODO

Rollback Strategy:
- Remove new test harness and keep existing backend suite only.

### FEAT-2009 — MVP Observability Implementation (Metrics, Correlation IDs, Alertability)

Type: FEAT
ID: FEAT-2009
Priority: MEDIUM
Risk: MEDIUM

Approval: APPROVED
Status: DONE
Blocking: FEAT-2005

Owner: AI
Created: 2026-02-22
Last updated: 2026-02-22

Context:
- Observability plan is documented but mostly not implemented.
- Launch confidence requires measurable SLO/KPI visibility.

Goal (user-facing outcome):
- Operators can detect and triage failures quickly during pilot and launch.

In Scope:
- Add correlation/request IDs propagation in API and worker logs.
- Emit MVP metric signals (orders created, outbox backlog/failures, ws clients).
- Add dashboard/alert checklist implementation notes and validation steps.

Out of Scope:
- Full distributed tracing platform rollout.
- Enterprise monitoring vendor migration.

Constraints:
- Follow existing patterns in: `src/logger.ts`, `src/workers/outbox.ts`, `docs/09_Observability_Plan.md`
- No new dependencies unless approved
- Backward compatible APIs (unless explicitly approved)
- Do not log secrets / PII

Assumptions:
- Structured log-based metrics are acceptable for MVP.

Acceptance Criteria:
- [ ] Core metrics fields are emitted consistently for API + outbox + realtime paths.
- [ ] Correlation IDs are available across request lifecycle.
- [ ] Observability doc checklist updated with concrete verification evidence.

Files to Start Reading:
- `src/logger.ts`
- `src/workers/outbox.ts`
- `docs/09_Observability_Plan.md`

Test Plan (must run + report results):
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Unit: `npm test`
- Integration: `npm run test:integration`
- E2E/smoke: `N/A`

Verification Results (fill after work):
- Lint: TODO
- Typecheck: TODO
- Unit: TODO
- Integration: TODO
- E2E/smoke: TODO

Rollback Strategy:
- Revert new telemetry fields and metric emitters if signal quality is poor.

### DX-2010 — Root CI Coverage Parity (Backend + Staff Web + DB Path)

Type: DX
ID: DX-2010
Priority: MEDIUM
Risk: MEDIUM

Approval: APPROVED
Status: DONE
Blocking: DX-2008

Owner: AI
Created: 2026-02-22
Last updated: 2026-02-22

Context:
- Root `npm run ci` validates backend only.
- Staff-web build/test and DB-backed integration checks are not guaranteed in one canonical path.

Goal (user-facing outcome):
- One repeatable CI path validates MVP-ready backend + frontend + integration quality gates.

In Scope:
- Add root scripts for staff-web build/test inclusion.
- Add DB-enabled CI profile for integration tests.
- Document local/stage CI execution matrix.

Out of Scope:
- Hosted CI provider setup.
- Performance/load test pipelines.

Constraints:
- Follow existing patterns in: `package.json`, `apps/staff-web/package.json`, `README.md`
- No new dependencies unless approved
- Backward compatible APIs (unless explicitly approved)
- Do not log secrets / PII

Assumptions:
- Local canonical CI command stays `npm run ci` with optional DB profile extension.

Acceptance Criteria:
- [ ] Root scripts validate backend and staff-web artifacts.
- [ ] DB-backed integration path is clearly codified and repeatable.
- [ ] Readme and test plan reflect the new CI matrix.

Files to Start Reading:
- `package.json`
- `apps/staff-web/package.json`
- `README.md`

Test Plan (must run + report results):
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Unit: `npm test`
- Integration: `npm run test:integration`
- E2E/smoke: `npm run ci`

Verification Results (fill after work):
- Lint: TODO
- Typecheck: TODO
- Unit: TODO
- Integration: TODO
- E2E/smoke: TODO

Rollback Strategy:
- Revert CI script changes and restore prior backend-only root flow.

### DOC-2011 — MVP Documentation Reconciliation + Exit-Criteria Readiness Report

Type: DOC
ID: DOC-2011
Priority: MEDIUM
Risk: LOW

Approval: APPROVED
Status: DONE
Blocking: FEAT-2001, FEAT-2002, FEAT-2003, FEAT-2004, FEAT-2005, SEC-2006, FEAT-2007, FEAT-2009, DX-2010

Owner: AI
Created: 2026-02-22
Last updated: 2026-02-22

Context:
- Multiple docs currently contain aspirational behavior not yet aligned with code reality.
- Launch decisions need one final “MVP ready” evidence pass.

Goal (user-facing outcome):
- Product, engineering, and operations documentation accurately represent the shipped MVP.

In Scope:
- Reconcile `docs/05_API_Spec.md`, `docs/04_Data_Model_Schema_Indexes.md`, and `README.md` with final behavior.
- Update `CHANGELOG.md` and `DECISIONS.md` for all user-visible and non-obvious decisions.
- Produce checklist-style readiness summary against `docs/11_Launch_and_Rollback_Plan.md` DoD.

Out of Scope:
- New feature implementation.
- Post-MVP roadmap definition.

Constraints:
- Follow existing patterns in: `docs/`, `CHANGELOG.md`, `DECISIONS.md`
- No new dependencies unless approved
- Backward compatible APIs (unless explicitly approved)
- Do not log secrets / PII

Assumptions:
- All upstream MVP backlog items are complete before this task starts.

Acceptance Criteria:
- [ ] Key docs are synchronized with implemented behavior.
- [ ] Changelog and ADR log reflect completed MVP milestones.
- [ ] Readiness report clearly marks pass/fail for every MVP exit criterion.

Files to Start Reading:
- `docs/05_API_Spec.md`
- `docs/11_Launch_and_Rollback_Plan.md`
- `CHANGELOG.md`

Test Plan (must run + report results):
- Lint: `N/A`
- Typecheck: `N/A`
- Unit: `N/A`
- Integration: `N/A`
- E2E/smoke: `N/A`

Verification Results (fill after work):
- Lint: TODO
- Typecheck: TODO
- Unit: TODO
- Integration: TODO
- E2E/smoke: TODO

Rollback Strategy:
- Revert documentation updates if inconsistencies are introduced.

---
## IDEAS / FUNCTIONAL REQUIREMENTS (RAW)

- Add configurable SMS receipt fallback after explicit caller opt-in.
- Add queue/broker-backed realtime fanout for horizontal scaling.
- Add multilingual voice support after English MVP launch.

---
## DONE (recent)

### DOC-1999 — MVP Gap Assessment Snapshot

Type: DOC
ID: DOC-1999
Priority: MEDIUM
Risk: LOW

Approval: APPROVED
Status: DONE
Blocking: None

Owner: AI
Created: 2026-02-22
Last updated: 2026-02-22

Context:
- Needed a concrete baseline before planning execution backlog.

Goal (user-facing outcome):
- Provide clear visibility into implemented vs missing MVP behavior.

In Scope:
- Audit codebase and docs against MVP requirements.
- Publish prioritized gap list.

Out of Scope:
- Runtime code changes.
- Test harness expansion.

Constraints:
- Follow existing patterns in: `docs/13_MVP_Gap_Task_List.md`
- No new dependencies unless approved
- Backward compatible APIs (unless explicitly approved)
- Do not log secrets / PII

Assumptions:
- None.

Acceptance Criteria:
- [x] Gap list produced with P0/P1/P2 priorities.
- [x] Execution order and MVP exit criteria documented.

Files to Start Reading:
- `docs/13_MVP_Gap_Task_List.md`
- `docs/08_Implementation_Plan.md`
- `BACKLOG.md`

Test Plan (must run + report results):
- Lint: N/A
- Typecheck: N/A
- Unit: N/A
- Integration: N/A
- E2E/smoke: N/A

Verification Results (fill after work):
- Lint: PASS - N/A
- Typecheck: PASS - N/A
- Unit: PASS - N/A
- Integration: PASS - N/A
- E2E/smoke: PASS - N/A

Rollback Strategy:
- Revert doc update if prioritization changes.


## Recruiter presentation release — approved 2026-09-24
### DX-2012 — Reproducible baseline
Status: DONE
Approval: APPROVED
Scope: docs/superpowers/plans/2026-09-24-recruiter-baseline.md
### FEAT-2013 — Isolated guided product demo
Status: DONE
Approval: APPROVED
Scope: approved recruiter demo design; synthetic sessions, shared order logic, polished UI, browser tests.
### DOC-2014 — GitHub product presentation
Status: DONE
Approval: APPROVED
Scope: accurate README, screenshots, deployment instructions, verification report, focused commits.
