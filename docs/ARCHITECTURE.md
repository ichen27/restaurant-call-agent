# Architecture

## Two entry points, shared order logic

The product demo (`src/demo/server.ts`) is deliberately separate from the provider-backed application (`src/index.ts`). They share menu validation, OrderService, repository types, status transitions, and order-event behavior. The demo creates a MemoryStore per visitor; the provider application chooses its repository through configuration.

This separation makes the project explorable without credentials and prevents a public demonstration from touching a restaurant's orders. Scripted conversation turns test the product workflow, not speech recognition or model quality.

## Order boundary

`priceMenuOrder` accepts menu items and requested IDs/quantities. It rejects missing or unavailable items and quantities outside 1–100, then produces immutable price/name snapshots and a server-calculated total.

The internal voice endpoint derives a stable idempotency key from the call ID when available. A single call represents one submitted pickup order. A replay returns the existing order. Requests without a call ID may supply an Idempotency-Key header.

The demo has a separate explicit confirmation state. It cannot create an order through the confirmation endpoint before reaching that state. Live model confirmation remains prompt-driven and needs provider-backed validation; the demo is not evidence of that behavior.

## State and events

Allowed order transitions are enforced in both repositories. Order creation and status changes append events. PostgreSQL also persists outbox records for delivery and retry. The authenticated staff application consumes WebSocket notifications and replays missed events.

The demo sends lightweight server-sent event notifications and fetches the authoritative session state. Five-second polling recovers missed notifications. Mutations are scoped by a random session token stored in browser sessionStorage; tokens grant access only to temporary synthetic data. Separate browser sessions cannot see each other's orders.

## Resource boundaries

Demo sessions expire after 30 minutes. Creation is limited to 20 sessions per IP per minute and 200 active sessions per process. Event connections are limited to four per session. A full process returns a visible busy response rather than silently evicting active visitors.

The demo is a single-instance service. Sessions disappear on restart and are not shared across replicas. Use one instance or sticky routing; use durable session storage before treating it as a multi-instance service.

## Voice integration

The existing voice worker bridges Twilio media and OpenAI Realtime, executes server-side tools, and requests transfer/hangup through Twilio. This release adds duplicate-order regression coverage but does not claim a verified live-provider conversation, production interruption handling, or successful telephone transfer.

Before using real traffic, verify the current provider session format, signed webhook/media boundaries, configured numbers, confirmation behavior, failure recovery, latency, and actual handoff. The older numbered design documents preserve earlier planning and can contain targets that are not measured results; the README and current deployment/verification guides describe this release.

## Tradeoffs

- **Scripted demo:** reproducible and free to try; cannot measure AI recognition accuracy.
- **Per-visitor memory:** clean isolation and quick reset; ephemeral, bounded, and single-process.
- **Server-owned prices:** consistent totals despite model output; menu IDs must stay synchronized.
- **One order per call:** simple retry safety; a second independent order requires a separate call identity.
- **Two event transports:** existing WebSockets remain available for staff; SSE keeps the standalone demo small and easy to host.
