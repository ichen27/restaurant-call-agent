# Development

Use Node 22 and install both packages with npm ci. The root package runs the API and backend checks; apps/staff-web contains React, Vite, and browser tests.

## Checks

```bash
npm run ci
npm run demo:build
npm --prefix apps/staff-web exec playwright install chromium
npm run demo:test:e2e
```

For a disposable PostgreSQL database, run npm run test:integration with DATABASE_URL explicitly set. The tests truncate tables.

## Working conventions

- Keep prices and availability in server-side menu logic.
- Preserve per-call order idempotency and legal status transitions.
- Add a regression test for changed behavior.
- Keep synthetic demo data separate from real restaurant configuration.
- Capture screenshots from the actual UI, not a mockup.
- Describe measured outcomes separately from targets.
- Prefer small commits that each explain one change.

## Refresh screenshots

Build and start the demo, then in another terminal:

```bash
DEMO_URL=http://127.0.0.1:4173 node scripts/capture-demo.mjs
```

This uses the existing Playwright dependency and writes images plus a short silent walkthrough to docs/images. Review generated assets before committing them.

## Documentation

README.md is the project entry point. docs/ARCHITECTURE.md, docs/DEPLOYMENT.md, and docs/VERIFICATION.md describe current behavior. Older numbered docs and planning files retain project history; they are not proof that every proposed feature was delivered.
