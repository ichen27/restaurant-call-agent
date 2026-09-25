# Deployment

## Product demo

From the repository root:

```bash
docker compose -f compose.demo.yml up --build -d
docker compose -f compose.demo.yml ps
curl --fail http://localhost:4173/health
```

Expected health fields: `ok: true`, `service: restaurant-call-agent-demo`, `storage: isolated-memory`.

To use another host port:

```bash
DEMO_PORT=8080 docker compose -f compose.demo.yml up --build -d
```

To stop only this deployment:

```bash
docker compose -f compose.demo.yml down
```

The image contains the compiled UI and backend, runs as the unprivileged node user, and includes a health check. Compose uses a read-only filesystem and temporary /tmp. No volumes, API keys, database, or .env file are needed.

### Public hosting

Run one instance of the demo container and route HTTPS traffic to port 4173. Disable proxy buffering on /api/demo/events and allow long-lived event streams. Polling provides a fallback if an event stream drops.

Preserve the demo/synthetic-data labels. Sessions expire after 30 minutes, disappear on restart, and are isolated by a random token. A reverse proxy may make visitors share one observed IP, so the 20-new-sessions-per-minute limit can apply to all visitors behind it. Configure trusted proxy handling deliberately if higher traffic requires it; never trust arbitrary forwarded headers.

Health checks do not prove provider-backed telephony works. This container intentionally has no telephone integration routes and does not use a production database.

### Local Node setup

Use Node 22 (`.nvmrc`) and the checked-in lockfiles:

```bash
npm ci
npm --prefix apps/staff-web ci
npm run demo:build
npm run demo
```

The local server binds to 127.0.0.1:4173. Set HOST=0.0.0.0 only when access from other machines is intended. PORT changes the listening port. A UI edit requires rebuilding the frontend; demo:dev watches neither UI assets nor source automatically.

## Provider-backed application

This is distinct from the demo and requires further live validation.

- Use .env.example as the configuration reference. Keep secrets outside Git.
- Supply OpenAI and Twilio credentials, correctly mapped telephone numbers, a publicly reachable HTTPS/WSS endpoint, and a separate staff transfer destination.
- Use PostgreSQL for durable orders and run migrations before starting the API and outbox worker.
- Configure JWT_SECRET, explicit staff credentials, AUTH_REQUIRED, and internal service credentials.
- Verify authentication on staff/internal routes and provider signatures/media admission before exposing telephone endpoints.
- Test a real confirmation, duplicate callback, disconnect, unavailable item, and staff transfer with synthetic calls before customer traffic.

Local development:

```bash
npm run dev
npm --prefix apps/staff-web run dev
```

The original staff interface is at http://localhost:5173/staff and proxies to the API on port 3000. In development, the seeded demo manager is manager@store.test with password123; replace default users before any nonlocal use.

Compiled API: `npm run build && npm start`. The original Dockerfile and docker-compose.yml belong to this provider path; compose.demo.yml is the verified self-contained demonstration.

## Database checks

The integration suites migrate and truncate tables. Use only a disposable test database:

```bash
DATABASE_URL=postgres://test:test@localhost:5432/restaurant_test npm run test:integration
```

The suites run sequentially because they share database fixtures. Do not point this command at application data.

## Rollback

For the demo, redeploy the prior image or check out the prior release commit and rebuild. No database rollback is required because demo data is temporary. Provider-backed database migrations and rollback require a separate deployment plan.
