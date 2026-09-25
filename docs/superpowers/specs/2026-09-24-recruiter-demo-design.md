# Restaurant Call Agent — Recruiter Demo Design
Date: 2026-09-24
Status: Ready for written-design review
Audience: Software and AI engineering recruiters and hiring managers
Repository: https://github.com/ichen27/restaurant-call-agent

## Intent and success criteria

Ivan approved improving the existing project through a passing, reproducible baseline, a polished call-to-order demonstration, and credible engineering evidence. The purpose is to let a visitor understand the problem, observe a useful result, and inspect the engineering behind it within two minutes.

Personal motivation comes from helping his parents operate their restaurant. Historical production metrics are not automatically attributable to this repository. The previously reported 145 orders in one month remains a user-reported claim until its source and project attribution are confirmed.

A successful first release provides:
- A fresh-checkout setup that works with the documented runtime.
- Passing backend and staff-web lint/type/build/test checks, with separately reported database and browser checks.
- A guided demonstration with synthetic data: caller request, menu validation, explicit confirmation, one created order, staff acceptance, preparation, and completion.
- An alternate unavailable-item or staff-handoff scenario with no accidental order submission.
- A concise README, actual UI screenshots, architecture explanation, and reproducible evidence.
- An explicit distinction between automated simulation, locally verified functionality, and live-provider functionality.

## Current baseline and preservation

Canonical checkout: /Volumes/SamsungSSD1/code/call-agent on the Mac mini.
Local branch: main; local HEAD at assessment: 6c27442.
Fetched public main at assessment: 906e6ea.
Local history contains 16 unpublished commits, including the voice integration and CI configuration.

Existing uncommitted changes in README.md, migrations/0005_phone_numbers.sql, src/app.ts, and src/store/memory.ts belong to the user. Preserve them and review their diffs before incorporation. Do not overwrite them or push the current branch as a shortcut.

Observed checks:
- Root CI passed lint, then failed TypeScript checking in audio conversion and logger tests.
- Backend test command passed when run separately; database coverage is not established by that result.
- Staff component tests failed on localStorage methods under the local Node 25.9.0 runtime.
- Existing CI specifies Node 22.
- Call-session tests cover construction and session configuration, not an actual streaming call.

Implementation must use an isolated SSD worktree based on the local unpublished history. Incorporate needed existing changes through a reviewed patch, retaining the original checkout. Establish provenance for the unpublished commits before publishing them.

## Architecture

Retain the TypeScript/Express backend, React/Vite staff application, repository interface, PostgreSQL implementation, order events, and WebSocket gateway. No framework migration or new third-party dependency is planned.

Maintain two clearly separated modes:

1. Production-capable application: existing staff authentication, API, repository, and telephony integration. Provider integration is validated separately with explicitly configured test resources.
2. Recruiter demonstration: an explicit demo entry point that starts an isolated in-memory application with synthetic users, menu, and orders. It does not load a production .env, connect to PostgreSQL, expose an outbound telephony adapter, or require provider keys.

Demo backend state is real application state, not a collection of frontend-only mock cards. The scenario driver uses shared order validation and service code; the staff board uses the application's actual order APIs and event stream. Scripted caller turns and tool requests are labeled as a simulation. Passing the demo does not establish speech recognition or model accuracy.

The initial demo runs as a local single-visitor session. Do not expose shared mutable demo state publicly. A public interactive deployment requires per-visitor isolation and expiry first; a verified recording can be published before that infrastructure is added.

## Visitor experience

Entry page:
- Project name: Restaurant Call Agent.
- One-sentence description of the restaurant problem and solution.
- Primary action: “Explore the demo.”
- Secondary links: architecture, source, and short recorded walkthrough when available.
- Persistent “Demo · synthetic data” indicator.

Demo workspace:
- Left pane: guided caller/agent conversation with scenario selection and next-step/play controls.
- Main pane: staff order board grouped by New, Preparing, Ready, and Completed.
- Order detail: menu items, quantities, calculated total, current status, and event history.
- Small optional activity panel: menu lookup, validation, confirmation, order creation, and staff updates. Label these as simulated requests exercising real application logic.
- Pause/replay/reset controls; resetting clears the demonstration's state, timers, and event cursor without affecting any other environment.
- Clear loading, empty, disconnected, error, and completed states.

Use a restrained restaurant-operations appearance: warm neutral background, readable dark text, one accent color, strong spacing, accessible contrast, keyboard controls, and responsive layouts. Avoid stock analytics charts, invented success metrics, and decorative controls that do nothing.

The existing staff workflow remains available. Shared order cards and detail views should be extracted only where reuse supports this experience; avoid an unrelated application rewrite.

## Scenarios and correctness

Happy path:
1. A synthetic customer asks for pickup.
2. The simulated agent obtains the current menu and availability.
3. The customer chooses items and quantities.
4. A summary shows exactly the validated items and backend-calculated price.
5. No order exists until an explicit confirmation step.
6. Confirmation creates one order and the board updates without a manual refresh.
7. Staff accepts, prepares, marks ready, and completes it.
8. The event history agrees with the visible state.

Unavailable item:
- A scenario sets a menu item unavailable.
- Attempting to order it produces a clear explanation.
- The visitor selects an available alternative or requests staff.
- No unavailable item is accepted into an order.

Handoff:
- A customer requests a person.
- A handoff event and concise synthetic summary are visible.
- No order is submitted automatically.
- The simulation does not claim a real phone transfer happened.

Replay and failures:
- Repeating the same confirmed request with the same operation identifier returns the existing order.
- A new independent scenario receives a new identifier.
- Invalid items or quantities are rejected by server validation.
- Disconnected staff clients recover through event replay or polling.
- Errors do not show success states; controls allow a clear retry or reset.
- Tests distinguish a retry of one operation from a genuinely new order.

## Voice integration work

Preserve the unpublished Twilio/OpenAI integration as the starting point, not proof of readiness.
- Check its provider API/session format against current official documentation before live validation.
- Exercise the session lifecycle with controlled provider doubles: streamed audio, tool results, interruption behavior, provider disconnect, failed transfer, and cleanup.
- Verify duplicate tool delivery and explicit confirmation rules at the shared order boundary.
- Check that transfer and hangup failures are observed, rather than treated as successful because a network request returned.
- Keep provider configuration and secrets server-side.
- Use synthetic calls and an isolated test configuration for live verification; do not route test orders into restaurant operations.
- If usable test credentials or a test number are unavailable, complete the local demo and report the live-call check as unverified.

## Verification and evidence

Baseline:
- Reproduce the existing failures.
- Standardize development and CI on Node 22 for this iteration and use existing lockfiles.
- Fix actual type errors without weakening strict TypeScript settings.
- Confirm whether the localStorage failure is a runtime/test-environment incompatibility before changing application behavior.

Automated acceptance:
- Backend lint, typecheck, tests, and build pass.
- Staff component tests, explicit TypeScript checking, and build pass.
- PostgreSQL integration tests run against an isolated disposable database, if the mini provides a suitable runtime. Report skipped integration work explicitly.
- Browser tests cover demo entry, confirmed order creation, staff progression, duplicate submission, unavailable item, handoff, reset, and recovery.
- Validate keyboard operation, narrow layout, browser console errors, and empty/error states.

Measurements:
- Deterministic scenario pass counts are reported as scenario results, not AI accuracy.
- Order-visibility delay is measured from confirmed order creation to board display; include sample size, environment, and method.
- Live voice response latency and spoken-order accuracy are reported only if measured during provider-backed tests, with definitions and limitations.
- Do not substitute a planned target for an achieved result.

Evidence artifacts:
- Screenshots of the actual implemented demo.
- A short recorded walkthrough if screen recording is available; otherwise disclose its absence.
- A dated verification report with commands, outcomes, skipped checks, and known limitations.
- A simple architecture diagram separating call transport, model/tool interaction, order validation/storage, and staff delivery.

## Repository presentation

Rewrite the README around:
1. What it does and why Ivan built it.
2. Screenshot and demo entry instructions.
3. Current capabilities and explicit limitations.
4. Architecture and selected engineering decisions.
5. Reproducible local setup and verification.
6. Measured results, where available.

Explain why prices and item availability are validated outside the model, how order retries avoid duplicates, how staff recover after disconnection, and what happens when an automated interaction cannot complete.

Review the backlog and operational docs for stale claims. Update CHANGELOG.md for delivered behavior and DECISIONS.md for the demo boundary and runtime choice. Keep the existing detailed technical documents as references rather than placing all of them in the README.

## Delivery sequence and boundaries

Milestone 1: reproducible baseline, preservation of current work, and verified voice/order boundaries.
Milestone 2: local guided demo and polished staff workflow, with meaningful browser tests.
Milestone 3: screenshots, recording where available, README, architecture, and measured evidence.

Each milestone must be independently reviewable. Publication follows validation of the intended commit set. No deployment, production settings change, customer call, or GitHub push occurs merely because a local build passes.

Out of scope: payments, POS integration, billing, delivery ordering, multilingual expansion, provider migration without evidence of need, and a general multi-tenant restaurant platform.
