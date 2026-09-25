# AGENTS.md — Codex Coding Agent Guide

Purpose: ship production-quality changes that are correct, secure, tested, maintainable, and reviewable.

## Repository context (fill in / keep updated)

- Repo type: backend service (MVP)
- Languages: TypeScript (Node.js)
- Frameworks/tools: Express, Zod, Pino
- Testing tools: Vitest, Supertest
- CI/CD: GitHub Actions in `.github/workflows/ci.yml`; canonical local CI command is `npm run ci`, including staff typecheck
- Target environments: local now; docs target local/dev/stage/prod rollout
- Coding standards: TypeScript strict mode, no `any`, consistent type imports, schema validation at HTTP boundaries
- Constraints: no new dependencies unless approved, preserve API behavior, preserve order idempotency guarantees, preserve telephony state-machine safety

### Source-of-truth docs
- Product/scope: `docs/01_PRD.md`, `docs/02_User_Stories_MVP.md`
- Architecture/data: `docs/03_System_Design_Architecture.md`, `docs/04_Data_Model_Schema_Indexes.md`
- API contract: `docs/05_API_Spec.md`
- Testing expectations: `docs/07_Test_Plan.md`
- Observability: `docs/09_Observability_Plan.md`
- Security/privacy: `docs/10_Security_Privacy_Checklist.md`
- Rollout/rollback: `docs/11_Launch_and_Rollback_Plan.md`
- Auth operations: `docs/12_Auth_Operations_Runbook.md`
- Change log: `CHANGELOG.md`
- Architecture decisions: `DECISIONS.md`
- Backlog: `BACKLOG.md`

### Repo discovery (do first on every task)

Before coding, confirm scope and risk by checking:

- `README*`, `docs/`
- Build/test config (`package.json`, `tsconfig.json`, `eslint.config.js`)
- CI config (`.github/workflows/*` if present)
- Backlog and tasks are listed in `BACKLOG.md` and new tasks or features or ideas go here
- Any need for human input shall be implemented as a request in `REQUESTS.md`
- Nearby implementation/tests in `src/` and `tests/`

If this section diverges from repo reality, follow repo reality and update this file.

---
## Backlog and Requests Workflow
The backlog is the authoritative plan. All implementation items must come from `BACKLOG.md`.

Rules:
- Only implement items in `BACKLOG.md` with `Status: READY` and `Approval: APPROVED`.
- If information is missing or ambiguous, move the item to `TRIAGE` or `BLOCKED` and create a request in `REQUESTS.md`.
- `REQUESTS.md` is the outlet for human input and the place to check for responses before continuing work that depends on human decisions.
- New ideas must enter via `BACKLOG.md` (as IDEAS/RAW) and never be implemented directly.

---

## 1) Mission & priorities

### Priorities (in order)

1. Correctness & safety (no regressions; handles edge cases)
2. Security & privacy (validation, authz, safe defaults, no leaks)
3. Reliability (clear errors, predictable failure modes)
4. Maintainability (small diffs, consistent patterns, readable code)
5. Testability (tests prove behavior)
6. Performance (avoid obvious inefficiencies; measure if uncertain)
7. Operational clarity (minimal, useful logs/metrics)

### Non-goals

- Drive-by refactors unrelated to the task
- New dependencies unless explicitly approved

## 2) Task modes and gate matrix

| Task mode | Typical scope | Required specialists | Required checks |
| --- | --- | --- | --- |
| `micro-fix` | single-file tweak, no contract/state-machine/security impact | `orchestrator` | lint/typecheck optional; run targeted tests if behavior changes |
| `small-fix` | localized bug/validation behavior | `orchestrator`, `test-engineer` | `npm run lint`, `npm run typecheck`, relevant tests |
| `feature` | additive behavior in one subsystem | `orchestrator`, `test-engineer` | `npm run ci` or equivalent evidence |
| `security-sensitive` | auth/authz, PII handling, telephony abuse controls, privacy/logging | `orchestrator`, `test-engineer` | `npm run ci` + negative-path tests proving controls |
| `cross-cutting` | multi-subsystem behavior, contract + docs + ops impact | `orchestrator`, `test-engineer` | `npm run ci` + targeted scenario tests |
| `docs-only` | no runtime behavior change | `orchestrator` | checks optional |

### `micro-fix` hard boundaries

Escalate out of `micro-fix` if any are true:

- changes public API shape/status/error behavior
- changes idempotency key behavior
- changes telephony state transitions or order confirmation rules
- changes security/privacy behavior (redaction, auth, sensitive logging)
- requires new dependencies or non-trivial build/CI changes

## 3) Stop-and-ask policy (hard gates)

Stop and ask (don’t proceed) if:

- Requirements are ambiguous/contradictory
- Public API/contracts, migrations, or backward compatibility may break
- Work touches auth/authz, crypto, payments, PII retention/deletion, or compliance
- Work changes order creation idempotency or confirmation semantics
- Work changes telephony handoff safety behavior or high-risk state-machine transitions
- New dependencies/major upgrades/non-trivial CI-build changes are required
- You can’t define a reliable test plan
- Elevated production risk exists (data loss, destructive ops, unsafe defaults)

When asking, include risk/ambiguity + 2–3 options + recommendation + test/rollout plan.

## 4) Workflow (step-by-step)

1. Scope: restate goal; list constraints; define acceptance criteria
2. Understand: trace current behavior; identify conventions
3. Plan: split into small commits (refactor -> change -> tests/docs)
4. Implement: follow repo patterns; small composable functions; validate boundaries
5. Test: add tests (happy/edge/failure/security); run relevant checks
6. Document/Ops: update docs/config if behavior or operations changed
7. Self-review: remove dead code/debug output; verify errors/logging/tests are meaningful

Chunking rules:

- Each commit builds and keeps tests passing
- Don’t mix formatting/renames with logic unless necessary
- Prefer add new path -> switch callers -> delete old path

## 5) Coding standards

- Formatting: use repo formatter/linter; don’t hand-format
- Naming: clear, domain-aligned; avoid unclear abbreviations
- Comments: explain why, not what
- Types/contracts:
  - TS: avoid `any`; prefer `unknown` + narrowing when needed
  - Keep boundary types explicit and strict
- Validation: treat external inputs as untrusted (HTTP/env/files)
- Error handling: never swallow; include enough context; keep user-facing errors safe
- Logging:
  - Use structured logs
  - Never log secrets, tokens, credentials, raw PII, or full sensitive payloads
- Simplicity: avoid premature abstraction; prefer local, testable logic

## 6) Quality bar (Definition of Done)

A change is done when:

- Behavior matches requirements and existing contracts
- Tests are added/updated for changed behavior (if behavior changed)
- Relevant checks pass (lint/typecheck/tests/build as applicable)
- No dead code/debug prints/commented blocks are left behind
- Docs are updated when behavior/config/API expectations changed
- `CHANGELOG.md` updated for user-visible behavior/process changes
- `DECISIONS.md` updated when non-obvious technical or policy decisions are made
- Security review completed for boundary/auth/logging changes
- PR/handoff includes clear summary + test evidence + risk + rollback notes (when relevant)

## 7) Security & privacy

- Validate early at trust boundaries
- Deny-by-default for privileged/sensitive operations
- Never hardcode secrets
- Redact sensitive fields in logs/errors
- Prefer existing dependencies; new deps require explicit approval and justification

## 8) Design & architecture expectations

- Follow existing architecture and patterns in `src/` and `tests/`
- Keep changes localized when possible
- Keep business logic testable
- Preserve API contracts in `docs/05_API_Spec.md` unless explicitly approved
- Preserve deterministic order and call-flow behavior from current state machine

## 9) Output contract (required)

For substantial tasks, output includes:

- Status: `blocked | in progress | ready for review`
- Assumptions (if any)
- Plan (short numbered list when useful)
- Changes: what changed and why
- Tests: commands run and outcomes (never claim unrun commands)
- Tradeoffs (if relevant)
- Risks and mitigations
- Next steps (if any)
- Docs governance:
  - State whether `CHANGELOG.md` was updated (and why/why not)
  - State whether `DECISIONS.md` was updated (and why/why not)

If multiple valid approaches exist, present 2–3 options with a recommendation.

## 10) Repository-specific command hooks

- install: `npm install`
- lint: `npm run lint`
- typecheck: `npm run typecheck`
- test: `npm test`
- build: `npm run build`
- run (local): `npm run dev`
- ci: `npm run ci`
