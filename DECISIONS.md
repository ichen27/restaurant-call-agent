# Decisions

## 2026-02-22 - Adopt Minimal-Core Agent Workflow Scaffold (ADR-0001)

- Status: accepted
- Context:
  - The repository had a generic `AGENTS.md` template with TODO placeholders.
  - We needed workflow modeling based on `CODEX-WORKFLOW-KIT copy.md`, but adapted pragmatically to current repo scope.
- Decision:
  - Adopt a minimal core workflow set now:
    - `AGENTS.md` (repo-truth + gates + command hooks)
    - `agents/README.md`, `agents/HANDOFF-CONTRACT.md`, `agents/orchestrator.md`, `agents/test-engineer.md`
    - `prompts/*.md` workflow templates
  - Defer optional specialist modules (`backend-api`, `ops-observability`, `payments-ledger`, `safety-moderation`) until scope expansion requires them.
- Rationale:
  - Keeps process overhead low for MVP while enforcing clear quality and safety gates.
  - Matches current project footprint (single backend service with API + voice state machine + tests).
- Consequences:
  - Immediate consistency in planning/review/handoffs.
  - Additional specialist roles may still be needed for future cross-cutting or security-heavy work.
- Rollback:
  - Revert workflow docs/files if they create friction; keep only `AGENTS.md` command hooks and core DoD/stop-and-ask sections.

## 2026-02-22 - Keep MVP Runtime In-Memory Before Persistence/Realtimes (ADR-0002)

- Status: accepted
- Context:
  - Product docs target a production architecture with Postgres, Redis, outbox worker, and WebSocket fanout.
  - Current delivery goal is validating core call-to-order behavior quickly with low setup friction.
- Decision:
  - Keep runtime storage in `MemoryStore` for this phase.
  - Implement only core API and telephony state-machine behavior needed for MVP flow simulation.
  - Defer DB migrations, durable outbox, and realtime infrastructure to subsequent milestones.
- Rationale:
  - Enables rapid iteration on API contracts and voice interaction logic before infrastructure lock-in.
  - Reduces operational complexity while behavior and requirements are still moving.
- Consequences:
  - Data is non-durable and process-local.
  - No true multi-instance consistency, no resilient event delivery, and no production-grade replay behavior.
- Rollback:
  - Replace `MemoryStore` behind existing service interfaces with persistent adapters (Postgres + outbox + pub/sub) while preserving endpoint contracts.

## 2026-02-22 - Add In-Memory Outbox Modeling Endpoints Before Worker Integration (ADR-0003)

- Status: accepted
- Context:
  - The target architecture requires transactional outbox publication, but persistent DB/worker layers are not implemented yet.
  - We need a concrete outbox lifecycle shape now to guide later Postgres + worker migration.
- Decision:
  - Introduce outbox event records inside `MemoryStore` for each order-domain event.
  - Add internal/debug endpoints to inspect and publish pending outbox events:
    - `GET /api/internal/outbox`
    - `POST /api/internal/outbox/publish`
- Rationale:
  - Preserves forward-compatible event model and testable behavior without adding infrastructure dependencies in this phase.
- Consequences:
  - Outbox behavior is process-local and non-durable.
  - Internal endpoints are not production-safe and must be protected or removed in hardened environments.
- Rollback:
  - Remove internal endpoints and route publication through dedicated worker once persistent outbox storage is in place.

## 2026-02-22 - Introduce Repository Interface Before Database Cutover (ADR-0004)

- Status: accepted
- Context:
  - Core services and voice tools were directly typed against `MemoryStore`.
  - Upcoming Postgres implementation requires a drop-in replacement without widespread behavioral rewrites.
- Decision:
  - Introduce `AppRepository` as the storage contract for API/service/tool operations.
  - Keep `MemoryStore` as one implementation of this interface.
  - Refactor service/tool wiring to depend on the interface instead of concrete store type.
- Rationale:
  - Lowers migration risk by decoupling business logic from storage implementation.
  - Enables incremental cutover and parallel test coverage for memory and Postgres adapters.
- Consequences:
  - Slightly broader type surface to maintain.
  - Clearer boundaries for persistence and worker phases.
- Rollback:
  - Revert to direct `MemoryStore` coupling if adapter strategy proves unnecessary.

## 2026-02-22 - Stage Postgres as Async Adapter Before App Runtime Switch (ADR-0005)

- Status: accepted
- Context:
  - Current Express handlers and service flow are synchronous and memory-backed.
  - Postgres operations are naturally async and require request path changes to fully cut over.
- Decision:
  - Implement Postgres repository, migration runner, and outbox worker entrypoint now.
  - Keep HTTP runtime on memory backend until async handler conversion is complete.
  - Fail fast if `STORE_BACKEND=postgres` is selected for the current sync app path.
- Rationale:
  - Preserves delivery momentum while reducing risk of a large unsafe one-shot conversion.
  - Enables early schema validation and worker development in parallel.
- Consequences:
  - Temporary dual-backend state with postgres only partially wired.
  - Additional follow-up needed for complete runtime cutover.
- Rollback:
  - Remove postgres scaffolding and revert to memory-only workflow if deployment constraints change.

## 2026-02-22 - Complete Async Repository Cutover for HTTP Runtime (ADR-0006)

- Status: accepted
- Context:
  - Repository contract and postgres adapter existed, but Express runtime was still memory-only due sync handler flow.
- Decision:
  - Convert repository contract and call sites (app routes, order service, voice tools/state machine) to async.
  - Enable repository factory to return Postgres backend for HTTP runtime when configured.
- Rationale:
  - Unblocks true runtime validation of API behavior against persistent storage.
  - Aligns application control flow with database IO semantics.
- Consequences:
  - More async error paths to handle and test.
  - Existing supertest/integration tests still need environment support and DB harness to validate postgres end-to-end.
- Rollback:
  - Force `STORE_BACKEND=memory` in runtime configuration while retaining async interfaces.

## 2026-02-22 - Process Outbox Rows Per Event with Explicit Success/Failure State (ADR-0007)

- Status: accepted
- Context:
  - Previous worker behavior marked outbox batches as sent without transport-aware per-event handling.
- Decision:
  - Introduce publisher abstraction and process pending outbox rows one-by-one.
  - Mark each event as `SENT` on publish success or `FAILED` on publish error.
- Rationale:
  - Establishes failure visibility and deterministic retry targets before integrating real transport.
- Consequences:
  - Worker throughput is currently lower than bulk updates.
  - Retry policy is still minimal and needs dedicated backoff logic in a later phase.
- Rollback:
  - Revert to batch mark-sent worker behavior if per-event processing causes operational issues in early environments.

## 2026-02-22 - Add Centralized Async Error Middleware and DB-Gated Integration Tests (ADR-0008)

- Status: accepted
- Context:
  - Express 4 async handlers can leak unhandled promise rejections without explicit wrapper usage.
  - Postgres runtime support needs integration evidence while keeping local workflows optional.
- Decision:
  - Introduce `asyncRoute` wrapper and shared `errorMiddleware` for centralized API error mapping/logging.
  - Add `test:integration` suite for `PostgresStore`, gated by `DATABASE_URL` presence.
- Rationale:
  - Improves runtime safety under async DB failures and makes persistence behavior regression-testable.
- Consequences:
  - Error code mapping is centralized and easier to evolve.
  - Full API integration testing still requires network-enabled environments due sandbox port restrictions.
- Rollback:
  - Revert wrapper/middleware if route-level handling is preferred, while preserving equivalent rejection safety.

## 2026-02-22 - Persist Retry Scheduling and Dead-Letter Outbox State (ADR-0009)

- Status: accepted
- Context:
  - Per-event worker processing existed, but retry cadence and terminal failure routing were not explicit.
- Decision:
  - Add `next_attempt_at` scheduling metadata for outbox rows.
  - Process only due outbox rows in worker (`status IN PENDING/FAILED AND next_attempt_at <= now()`).
  - Apply exponential backoff and move exhausted events to `DEAD_LETTER`.
- Rationale:
  - Makes retry behavior deterministic and inspectable across worker restarts.
  - Prevents infinite immediate retries on repeatedly failing events.
- Consequences:
  - Adds migration and policy config surface (`OUTBOX_MAX_ATTEMPTS`, `OUTBOX_BASE_DELAY_MS`, `OUTBOX_MAX_DELAY_MS`).
  - Requires future operational metrics/alerts on dead-letter backlog.
- Rollback:
  - Disable due-time filtering and revert to immediate retry loop if staged rollout shows unacceptable latency.

## 2026-02-22 - Introduce JWT Auth and RBAC with Configurable Enforcement Mode (ADR-0010)

- Status: accepted
- Context:
  - API now has sensitive staff/manager operations but lacked auth primitives and role checks.
  - Existing local workflow and sandbox tests need minimal friction while security features are being integrated.
- Decision:
  - Add JWT login/me endpoints and request auth middleware.
  - Add route-level RBAC guards (`STAFF`, `MANAGER`) for protected operations.
  - Make hard enforcement configurable with `AUTH_REQUIRED`.
  - If `AUTH_REQUIRED` is unset, default to permissive in `development/test` and enforced in non-local environments.
- Rationale:
  - Establishes production auth path now while allowing incremental rollout and test continuity.
- Consequences:
  - Local/test flow remains low-friction while non-local environments are secure by default.
  - Follow-up needed for persistent users + hardened credential storage.
- Rollback:
  - Keep middleware loaded but disable enforcement (`AUTH_REQUIRED=false`) while fixing auth regressions.

## 2026-02-22 - Persist Staff Credentials and Standardize PBKDF2 Password Verification (ADR-0011)

- Status: accepted
- Context:
  - Auth middleware and JWT issuance existed, but user credentials were still seeded from in-memory plaintext.
  - The implementation plan requires persistent staff-user storage with secure password handling.
- Decision:
  - Add `staff_users` table migration with store-scoped unique emails and `password_hash` storage.
  - Add repository-level `getAuthUserByEmail` contract used by `AuthService.login`.
  - Standardize password format on `pbkdf2_sha256$iterations$salt$digest` and verify with timing-safe comparison.
- Rationale:
  - Moves credential source of truth into persistent storage in postgres mode.
  - Removes plaintext password matching from runtime auth flow.
- Consequences:
  - Bootstrap/rotation process must now manage PBKDF2 password hashes.
  - Local memory mode still supports configured users, but normalized into hashed form at startup.
- Rollback:
  - Revert login lookup to config-seeded users while preserving JWT/RBAC route guards.

## 2026-02-22 - Enforce Store Scope on Authenticated Route Access (ADR-0012)

- Status: accepted
- Context:
  - Role checks alone allowed a valid token to call routes targeting another store.
  - Multi-store safety requires store-bound access even before broader tenancy layers are introduced.
- Decision:
  - Add store-scope checks using token `storeId` on store and order-event operations.
  - Return `403 FORBIDDEN` on authenticated cross-store access attempts.
- Rationale:
  - Prevents accidental or malicious cross-store operations with otherwise valid credentials.
- Consequences:
  - Existing clients must use tokens aligned with target store resources.
  - Additional route coverage is needed as new store-bound endpoints are added.
- Rollback:
  - Disable store-scope checks while retaining role gates if rollout uncovers incompatible client assumptions.

## 2026-02-22 - Add Webhook Outbox Transport and Structured Worker Backlog Metrics (ADR-0013)

- Status: accepted
- Context:
  - Outbox worker had retry/dead-letter state but only stdout placeholder publishing and limited operational visibility.
- Decision:
  - Add env-driven transport selection for outbox publisher (`stdout` or `webhook`).
  - Add webhook transport controls: URL, timeout, optional bearer auth.
  - Emit structured worker result logs with backlog-before/backlog-after counts and explicit dead-letter alert events.
- Rationale:
  - Enables immediate external integration without adding new runtime dependencies.
  - Improves operator visibility into backlog growth and dead-letter incidents.
- Consequences:
  - Webhook delivery semantics are at-least-once and depend on receiver idempotency.
  - Queue-native transports (Redis/pubsub) remain a follow-up for higher throughput fan-out.
- Rollback:
  - Force `OUTBOX_PUBLISH_TRANSPORT=stdout` and continue using retry/dead-letter state machine.

## 2026-02-22 - Add Optional Service Token Protection for Telephony/Internal Endpoints (ADR-0014)

- Status: accepted
- Context:
  - Telephony webhooks and internal outbox endpoints are sensitive but were open by default.
- Decision:
  - Support optional shared-token enforcement for internal and telephony routes:
    - `INTERNAL_API_KEY` -> `x-internal-api-key`
    - `TELEPHONY_WEBHOOK_TOKEN` -> `x-telephony-token`
  - Keep behavior optional for local/dev compatibility when env vars are unset.
- Rationale:
  - Adds immediate abuse protection and change-safe hardening without breaking current local flows.
- Consequences:
  - Deployments must provision and rotate service tokens in secret management.
  - Future provider-native webhook signatures can layer on top of this control.
- Rollback:
  - Unset service-token env vars to restore permissive behavior while preserving route functionality.

## 2026-02-22 - Enforce HMAC Verification for Telephony Webhooks When Secret Configured (ADR-0015)

- Status: accepted
- Context:
  - Shared tokens protect routes, but webhook authenticity should be verifiable from payload signatures.
- Decision:
  - Capture request raw body during JSON parsing.
  - When `TELEPHONY_WEBHOOK_SECRET` is set, require `x-telephony-signature` and verify HMAC SHA-256.
  - Reject missing/invalid signatures with `401`.
- Rationale:
  - Reduces spoofing risk and aligns with provider webhook security patterns.
- Consequences:
  - Signature must be computed over exact raw JSON body bytes.
  - Provider-specific canonicalization/timestamp rules may require adaptation later.
- Rollback:
  - Unset `TELEPHONY_WEBHOOK_SECRET` to disable signature enforcement while keeping token guard if needed.

## 2026-02-22 - Add Native WebSocket Gateway and Internal Realtime Publish Endpoint (ADR-0016)

- Status: accepted
- Context:
  - Outbox reliability is in place, but staff-facing realtime fanout path was still missing.
- Decision:
  - Add native websocket upgrade handling at `/ws` with JWT token + store-scope authorization.
  - Add `/api/internal/realtime/publish` endpoint for worker fanout into connected store clients.
  - Add outbox publisher transport mode `ws` to post outbox envelopes to realtime publish endpoint.
- Rationale:
  - Delivers realtime visibility without introducing new infrastructure dependencies for pilot MVP.
- Consequences:
  - WebSocket implementation is intentionally minimal (server push focused).
  - Horizontal scaling and shared connection state need follow-up architecture (Redis/broker) post-pilot.
- Rollback:
  - Switch `OUTBOX_PUBLISH_TRANSPORT` back to `stdout` or `webhook` and disable websocket client usage.

## 2026-02-22 - Staff UI MVP Stack and Scope (ADR-0017)

- Status: accepted
- Context:
  - Realtime and auth backend paths now exist, but operator workflow requires a concrete staff-facing app.
- Decision:
  - Use React + Vite + TypeScript for MVP staff UI under `apps/staff-web`.
  - MVP shell includes login, live order board, websocket connection indicator, ack/status actions, and manager mode/item controls.
- Rationale:
  - Fastest path to a maintainable single-store pilot frontend with straightforward local/staging deployment.
- Consequences:
  - Frontend build/test lifecycle is currently separate from root backend CI scripts.
  - Reconnect replay cursor logic remains a follow-up hardening item.
- Rollback:
  - Keep backend realtime endpoints and temporarily revert staff operations to API/manual scripts if UI regressions appear.

## 2026-02-22 - Expand Postgres Coverage to API Route Integration Tests (ADR-0018)

- Status: accepted
- Context:
  - Postgres testing previously focused on repository-level integration and missed HTTP route wiring behavior.
- Decision:
  - Add DB-gated route integration tests (`tests/postgresApi.integration.test.ts`) covering login, idempotent create, status/ack transitions, events replay, and store-scope rejection.
  - Include the suite under `npm run test:integration`.
- Rationale:
  - Validates end-to-end API behavior on real Postgres-backed runtime path before pilot rollout.
- Consequences:
  - Requires `DATABASE_URL` for full integration suite execution.
  - Slightly longer CI time in DB-enabled environments.
- Rollback:
  - Keep repository integration tests as fallback if route suite becomes unstable in constrained environments.

## 2026-02-22 - Add Launch-Control Flags, Runtime Rate Limits, and Non-Local Secret Gates (ADR-0016)

- Status: accepted
- Context:
  - Launch and rollback docs require immediate disable controls for automation and safer abuse handling.
  - Non-local deployments need predictable fail-fast behavior when critical secrets are missing.
- Decision:
  - Add env controls:
    - `AGENT_ENABLED` (telephony automation gate)
    - `ORDER_INTAKE_ENABLED` (order creation gate)
  - Add in-memory per-IP rate limits for telephony inbound, auth login, and API order creation with deterministic `429 RATE_LIMITED` responses.
  - Validate runtime security config at boot in non-local environments:
    - reject default `JWT_SECRET` when auth is enforced
    - require `INTERNAL_API_KEY`
    - require `TELEPHONY_WEBHOOK_TOKEN` or `TELEPHONY_WEBHOOK_SECRET`
- Rationale:
  - Gives operations immediate rollback levers without code redeploy.
  - Reduces abuse risk in MVP environments while preserving dependency constraints.
- Consequences:
  - Limits are process-local for MVP single-instance deployments.
  - Non-local environments must provision required secrets before boot.
- Rollback:
  - Set flags back to enabled and relax secret requirements only if incident mitigation requires temporary permissive mode.

## 2026-02-22 - Add Staff-Web Automated Test Baseline (ADR-0017)

- Status: accepted
- Context:
  - Staff web lacked automated tests, leaving core workflow changes unguarded.
  - Human approval allowed targeted frontend dependency additions.
- Decision:
  - Add component-test harness in `apps/staff-web` using Vitest + Testing Library.
  - Add browser E2E scaffolding using Playwright in `apps/staff-web/e2e`.
  - Extend root CI to include staff-web tests and build (`npm run ci:staff` via `npm run ci`).
- Rationale:
  - Establishes immediate regression checks for login/workflow surfaces with minimal tooling overhead.
- Consequences:
  - Slightly longer CI duration.
  - Browser-level E2E coverage starts as scaffolding and should be expanded alongside workflow features.
- Rollback:
  - Remove frontend test scripts/deps and revert root CI wiring if maintenance overhead outweighs current MVP risk reduction.

## 2026-09-24 — Use Node 22 consistently

Development, CI, and container images use Node 22. The existing jsdom tests collide with Node 25 global Web Storage; both pass unchanged under Node 22. Lockfiles are used for both packages and frontend type checking is explicit. No application storage workaround or dependency upgrade is needed.
