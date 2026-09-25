# Changelog

## 2026-09-24 — Recruiter product workspace

### Added
- Isolated synthetic demo with pickup, unavailable-item, and handoff scenarios.
- Responsive order board, menu controls, receipts, event history, and explicit confirmation.
- Standalone demo image, Compose deployment, browser CI, and real UI screenshots/walkthrough.
- Shared menu validation and regression coverage for repeated voice orders.

### Fixed
- Accepted orders survive menu changes and simultaneous database retries.
- Delayed conversation steps cannot advance another call; demo history and mutation rates are bounded.
- Unavailable-item scenarios recover through an explicit workspace reset.
- Stable per-call order identity prevents duplicate voice submissions.
- Node 22 runtime alignment resolves the staff test environment mismatch.
- Strict audio/logger typing and consistent compiled startup paths.
- Repeatable PostgreSQL integration migrations and sequential database checks.

### Documentation
- Product-focused README, current architecture/deployment guides, and a dated verification report.
- Live telephony remains a separately configured, unverified provider path for this release.

## Earlier development history

### Added

- Store contract endpoint `GET /api/stores/:storeId` plus store-bound auth scope enforcement on order read routes.
- Extended order status update payload with `reject_reason`, optional `note`, and optional `promised_time` validation.
- Voice flow upgrades: full order readback before confirmation, two-attempt clarification policy, busy-mode prep messaging, and structured handoff summary events.
- Staff UI workflow upgrades: order detail drawer, audit/event timeline, reject-with-reason form, and `tel:` call-customer action.
- Staff UI realtime resilience improvements: persisted event cursor, reconnect catch-up, and polling fallback while websocket is down.
- Outbox worker runtime modes (`once`, `loop`, `replay-dead-letter`) with graceful shutdown and dead-letter replay control endpoint.
- Route-level abuse controls via in-memory rate limiting and deterministic `429 RATE_LIMITED` responses.
- Non-local runtime security validation for critical secrets before app boot.
- Frontend automation baseline in `apps/staff-web` with Vitest component tests and Playwright E2E scaffolding.

- Core MVP backend service with Express routes for health, menu, store mode, orders, order events, and telephony webhooks.
- Deterministic voice order state machine with controlled tool execution (`get_store_mode`, `validate_item`, `create_order`, `handoff`).
- In-memory domain store for menu, store mode, call sessions, orders, idempotency keys, and append-only order events.
- Initial test coverage for order idempotency/status transitions and telephony confirmation duplicate protection.
- Agent workflow scaffolding: `agents/` role routing + handoff contract.
- Prompt templates under `prompts/` for task briefs, implementation plans, risk checks, reviews, and PR summaries.
- Order detail endpoint implementation: `GET /api/orders/{order_id}` returning order + associated event history.
- In-memory outbox surface (`/api/internal/outbox`, `/api/internal/outbox/publish`) to model outbox lifecycle before persistent infrastructure.
- Unit tests for outbox creation and publish behavior in `tests/memoryStore.test.ts`.
- Postgres migration scaffolding (`migrations/0001_init.sql`, `npm run migrate`).
- Async Postgres repository implementation scaffold (`src/store/postgres.ts`) with transactional create/idempotency/event/outbox methods for upcoming runtime cutover.
- Outbox worker entrypoint (`npm run worker:outbox`) for pending->sent flow in postgres mode.
- Outbox publisher abstraction (`src/workers/publishers.ts`) with stdout transport placeholder.
- Store factory selection layer (`src/store/factory.ts`) and tests for backend selection behavior (`tests/storeFactory.test.ts`).
- Postgres repository integration test suite (`tests/postgresStore.integration.test.ts`) for idempotency, transitions, replay, and outbox state updates.
- Outbox batch runner policy module (`src/workers/outboxRunner.ts`) with exponential retry scheduling and dead-letter routing.
- Outbox worker policy tests (`tests/outboxRunner.test.ts`).
- Follow-up migration (`migrations/0002_outbox_backoff.sql`) to add `next_attempt_at` scheduling field for existing databases.
- JWT auth service + middleware (`/api/auth/login`, `/api/auth/me`) with role-aware route protection scaffolding.
- Auth service tests (`tests/authService.test.ts`).
- Route-level auth integration tests (`tests/authRoutes.test.ts`) for `401`/`403`/optional-auth behavior.
- Password hashing utility/tests (`src/auth/password.ts`, `tests/password.test.ts`) with PBKDF2 verification.
- Staff user auth migration (`migrations/0003_staff_users_auth.sql`) for persistent credential storage.
- Store-scope authorization checks for authenticated users on store/order event operations.
- Outbox publisher webhook transport mode with timeout/auth configuration and dedicated publisher tests.
- Optional service-token enforcement for telephony and internal outbox endpoints.
- Auth operations runbook for credential/token bootstrap and rotation (`docs/12_Auth_Operations_Runbook.md`).
- Telephony webhook HMAC signature enforcement (`TELEPHONY_WEBHOOK_SECRET`, `x-telephony-signature`).
- Native realtime websocket gateway (`/ws`) with JWT store-scoped connections.
- Internal realtime publish endpoint and outbox `ws` transport mode for worker-to-gateway fanout.
- Staff web app MVP shell (`apps/staff-web`) with login, live orders board, websocket updates, status/ack actions, and manager controls.
- Postgres API integration test coverage for auth/order/status/events route behavior (`tests/postgresApi.integration.test.ts`).

### Changed

- Root CI now includes backend checks plus staff-web test/build parity (`npm run ci`) and an explicit DB profile (`npm run ci:db`).
- Health payload now exposes launch-control flag state (`agent_enabled`, `order_intake_enabled`).
- Telephony and order-create flows now honor launch-control env toggles (`AGENT_ENABLED`, `ORDER_INTAKE_ENABLED`).
- Structured logs now include generated request IDs and additional metric-style fields for key operations.

- `AGENTS.md` now reflects repository truth, command hooks, task modes, and stop-and-ask gates for this codebase.
- Storage usage in services is now interface-driven (`AppRepository`) instead of hard-coupled to `MemoryStore`, enabling cleaner Postgres cutover.
- Health endpoint now includes backend metadata.
- API request path, order service, and voice tool/state-machine flow now use async repository contracts.
- `STORE_BACKEND=postgres` is now supported by the HTTP app runtime (with `DATABASE_URL`).
- Outbox worker flow now marks each event as `SENT` or `FAILED` based on per-event publish result.
- API routing now uses centralized async error capture and shared error middleware for safer async failure handling.
- Outbox storage/worker flow now supports `DEAD_LETTER` status and due-time filtering (`next_attempt_at`) for retry control.
- Protected order/mode/menu routes now support RBAC enforcement (`STAFF`/`MANAGER`) with configurable `AUTH_REQUIRED` mode.
- Auth enforcement defaults are now environment-aware: required outside local/test unless explicitly overridden.
- Auth login flow now resolves users from repository storage (`staff_users` in Postgres) instead of in-memory plaintext credentials.
- Authenticated requests are now constrained to their token store scope (`403` on cross-store access).
- Outbox worker now emits structured backlog metrics and dead-letter alert logs per run.
- Internal and telephony sensitive routes can be locked with explicit service tokens.

### Fixed

-

### Security

- Added explicit workflow guardrails for sensitive logging, API contract risk, idempotency, and telephony state-machine safety.
