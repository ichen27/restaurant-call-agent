# Twilio + OpenAI Realtime API Integration

**Date:** 2026-03-19
**Status:** Approved

## Overview

Connect inbound phone calls to the restaurant ordering system via Twilio Media Streams and OpenAI Realtime API. OpenAI drives the conversation via a system prompt and function calling. A new standalone call worker process bridges audio between Twilio and OpenAI, and executes tool calls against the existing API.

## Architecture

```
                         ┌─────────────────────────┐
  Caller ──phone──▶ Twilio                         │
                         │  POST /api/telephony/    │
                         │  twiml-answer            │
                         │  (returns <Connect>      │
                         │   <Stream> TwiML)        │
                         └──────────┬──────────────┘
                                    │ WebSocket (mulaw audio)
                                    ▼
                         ┌─────────────────────────┐
                         │    Call Worker Process   │
                         │                         │
                         │  Per-call session:       │
                         │  - Twilio WS ◄──────►   │
                         │  - OpenAI Realtime WS    │
                         │  - Audio format bridge   │
                         │  - Function call handler │
                         └──────────┬──────────────┘
                                    │ HTTP calls
                                    ▼
                         ┌─────────────────────────┐
                         │   Existing API Server    │
                         │  (orders, menu, stores)  │
                         └─────────────────────────┘
```

### Approach: Direct Bridge

One WebSocket from Twilio and one WebSocket to OpenAI per active call. The worker forwards audio between them and handles function calls. Each call is an independent pair of WebSockets held in a `Map<string, CallConnection>` keyed by Twilio `streamSid`. No shared state between calls.

## Components

### 1. Call Worker Process (`src/workers/call.ts`)

A standalone HTTP + WebSocket server, similar to the existing `outbox.ts` worker.

- Listens on `CALL_WORKER_PORT` (default 3001)
- Exposes WebSocket endpoint at `/media-stream`
- Manages per-call sessions

### 2. Per-Call Session (`src/workers/call-session.ts`)

Manages the lifecycle of a single call:

1. Twilio opens WebSocket to `/media-stream`
2. Worker receives `start` event with `streamSid`, `callSid`, and custom parameters (`store_id`, `caller_phone`) from `start.customParameters`
3. Worker opens WebSocket to OpenAI Realtime API (`wss://api.openai.com/v1/realtime`)
4. Worker sends `session.update` with system prompt, tools, voice config
5. Audio loop runs until call ends
6. Cleanup on caller hangup (`stop` event) or `end_call` tool invocation

**Error handling:** If the OpenAI WebSocket fails to connect or drops mid-call, the worker redirects the call via Twilio REST API to a TwiML endpoint that plays an apology message ("Sorry, we're having technical difficulties. Please try again.") and hangs up. No automatic reconnection is attempted — the call is treated as failed.

### 3. Audio Bridge (`src/workers/call-audio.ts`)

Converts audio between Twilio and OpenAI formats:

- **Twilio → OpenAI:** mulaw 8kHz base64 → PCM16 24kHz
  - Decode base64
  - Expand mulaw to PCM16 (codec lookup table)
  - Upsample 8kHz → 24kHz (linear interpolation for MVP; upgrade to sinc interpolation or `libsamplerate` if STT quality suffers)
- **OpenAI → Twilio:** PCM16 24kHz → mulaw 8kHz base64
  - Downsample 24kHz → 8kHz
  - Compress PCM16 to mulaw
  - Encode base64

### 4. System Prompt (`src/workers/call-prompt.ts`)

Exports a function `buildSystemPrompt(storeName: string): string` that constructs the OpenAI system prompt.

The prompt defines:
- Restaurant ordering assistant identity and tone
- Rules: pickup only, no delivery (→ transfer to staff), pay at pickup
- Must collect customer name before taking order
- Must confirm order readback before submitting
- Can only offer items retrieved via `search_menu` tool
- Store mode behavior: OPEN → normal, BUSY → warn of longer wait, CLOSED → apologize and end
- Escalate to staff when caller asks or situation is out of scope

### 5. Function Call Handler (`src/workers/call-tools.ts`)

Handles OpenAI `response.function_call_arguments.done` events. Executes tool calls against the API over HTTP.

**Authentication:** The call worker authenticates using `X-Internal-Api-Key` (same pattern as the outbox worker). Since existing store/menu/order endpoints require JWT auth (`requireRole('STAFF')`), new internal endpoints are added to the API server that accept the internal API key:

| Tool | Purpose | New Internal API Endpoint |
|------|---------|--------------------------|
| `get_store_mode` | Check store open/busy/closed | `GET /api/internal/stores/{storeId}` |
| `search_menu` | Find menu items by query | `GET /api/internal/stores/{storeId}/menu?q={query}` |
| `create_order` | Submit confirmed order | `POST /api/internal/orders` |
| `transfer_to_staff` | Escalate to human | Twilio REST API redirect call + `POST /api/internal/call-events` |
| `end_call` | Hang up | Twilio REST API to end call by `callSid` |

**`create_order` data assembly:**
The `POST /api/internal/orders` endpoint accepts a simplified payload: `{ store_id, call_id, customer_name, customer_phone, items: [{ item_id, qty }] }`. The server hydrates item names, prices, and computes totals server-side (mirroring what the old `VoiceTools.create_order` did internally). This avoids the call worker needing to know about pricing.

**`customer_phone` source:**
The caller's phone number is available from the Twilio `start` event (`start.callSid` → Twilio REST API lookup, or from the original TwiML webhook `From` field passed as a `<Parameter>`). The TwiML endpoint passes it as `<Parameter name="caller_phone" value="{from}" />` alongside `store_id`. The call worker stores it in the session and supplies it to the `create_order` tool automatically — OpenAI does not need to ask for it.

**`transfer_to_staff` implementation:**
When triggered, the worker calls the Twilio REST API to update the call (`POST /2010-04-01/Accounts/{AccountSid}/Calls/{CallSid}.json`) with a new TwiML URL pointing to `POST /api/telephony/twiml-transfer` on the API server. This new endpoint returns `<Response><Dial>{staff_phone}</Dial></Response>`, where `staff_phone` is the store's `public_phone` field. The worker also posts a handoff event to `POST /api/internal/call-events`.

**`end_call` cleanup:**
After calling the Twilio REST API to end the call, the worker also closes the OpenAI WebSocket and removes the session from the `Map<string, CallConnection>`.

### 6. TwiML Endpoint (on existing API server)

`POST /api/telephony/twiml-answer`

- Twilio POSTs here when a call comes in
- Reads `Called` (or `To`) field from Twilio's POST body (E.164 format)
- Looks up `store_id` from `phone_numbers` table
- Returns TwiML:

```xml
<Response>
  <Connect>
    <Stream url="wss://{CALL_WORKER_HOST}/media-stream">
      <Parameter name="store_id" value="{store_id}" />
      <Parameter name="caller_phone" value="{from}" />
      <Parameter name="store_name" value="{store_name}" />
    </Stream>
  </Connect>
</Response>
```

- If phone number not found: returns `<Response><Say>Sorry, this number is not configured.</Say><Hangup/></Response>`
- Auth: validates `X-Twilio-Signature` using Twilio auth token

### 7. OpenAI Realtime Session Config

Sent as `session.update` after connecting:

```json
{
  "type": "session.update",
  "session": {
    "model": "${OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview'}",
    "modalities": ["text", "audio"],
    "voice": "${OPENAI_VOICE || 'alloy'}",
    "input_audio_format": "pcm16",
    "output_audio_format": "pcm16",
    "input_audio_transcription": { "model": "whisper-1" },
    "turn_detection": { "type": "server_vad" },
    "tools": [ ... ],
    "instructions": "<system prompt>"
  }
}
```

## New Dependencies

| Package | Purpose |
|---------|---------|
| `ws` | WebSocket client for connecting to OpenAI Realtime API and handling Twilio Media Streams upgrade |
| `twilio` | Twilio REST API client (for ending/redirecting calls) and webhook signature validation |

## Observability

The call worker emits structured logs (same `safeLog` pattern as the rest of the codebase) for:
- `call_started` — callSid, streamSid, store_id, caller_phone
- `call_ended` — callSid, duration_ms, reason (hangup/end_call/error)
- `tool_called` — callSid, tool name, success/failure
- `openai_error` — callSid, error details
- `audio_bridge_error` — callSid, direction (inbound/outbound), error

## Graceful Shutdown

On `SIGINT`/`SIGTERM`, the call worker:
1. Stops accepting new WebSocket connections
2. Waits up to 30 seconds for active calls to finish
3. Force-closes remaining connections after timeout
4. Exits

## Database Changes

### New table: `phone_numbers`

```sql
CREATE TABLE phone_numbers (
  phone_number TEXT PRIMARY KEY,  -- E.164 format, e.g. '+15551234567'
  store_id     TEXT NOT NULL REFERENCES stores(id),
  label        TEXT,              -- optional friendly name
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

New migration file: `migrations/0005_phone_numbers.sql` (follows existing migration sequence; highest existing is 0004)

## Removed Code

The following files and endpoints are removed, as OpenAI replaces the text-based conversation flow:

**Files removed:**
- `src/voice/stateMachine.ts`
- `src/voice/tools.ts`
- Related test files (`tests/stateMachine.test.ts`, `tests/voiceTools.test.ts`, etc.)

**Endpoints removed from `src/app.ts`:**
- `POST /api/telephony/inbound`
- `POST /api/telephony/status`

## Docker Changes

**Dockerfile:** The existing Dockerfile builds to `dist/` and runs `node dist/index.js`. Since all workers share the same build output, no Dockerfile changes are needed — the `command` override in docker-compose selects the entry point. Add `EXPOSE 3001` for documentation purposes.

**docker-compose.yml:** New service added:

```yaml
call-worker:
  build: .
  depends_on:
    db:
      condition: service_healthy
    migrate:
      condition: service_completed_successfully
  command: ["node", "dist/workers/call.js"]
  ports:
    - "3001:3001"
  environment:
    CALL_WORKER_PORT: "3001"
    API_BASE_URL: http://api:3000
    OPENAI_API_KEY: "${OPENAI_API_KEY}"
    TWILIO_ACCOUNT_SID: "${TWILIO_ACCOUNT_SID}"
    TWILIO_AUTH_TOKEN: "${TWILIO_AUTH_TOKEN}"
    INTERNAL_API_KEY: "${INTERNAL_API_KEY}"
```

## Environment Variables (New)

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | OpenAI API key with Realtime API access |
| `TWILIO_ACCOUNT_SID` | Yes | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Yes | Twilio auth token (for webhook validation + REST API) |
| `CALL_WORKER_PORT` | No | Call worker listen port (default: 3001) |
| `CALL_WORKER_HOST` | Yes | Public hostname for the call worker (used in TwiML Stream URL) |
| `API_BASE_URL` | Yes | Internal URL of the API server (e.g. http://api:3000) |
| `OPENAI_REALTIME_MODEL` | No | Model to use (default: gpt-4o-realtime-preview) |
| `OPENAI_VOICE` | No | Voice to use (default: alloy) |

## New API Endpoints (on existing API server)

| Endpoint | Purpose |
|----------|---------|
| `POST /api/telephony/twiml-answer` | Answers inbound calls with TwiML (Twilio webhook) |
| `POST /api/telephony/twiml-transfer` | Returns `<Dial>` TwiML for staff transfer |
| `POST /api/telephony/twiml-error` | Returns apology + hangup TwiML for error recovery |
| `GET /api/internal/stores/{storeId}` | Store mode + name (internal API key auth) |
| `GET /api/internal/stores/{storeId}/menu` | Menu items with optional `?q=` filter (internal API key auth) |
| `POST /api/internal/orders` | Simplified order creation — accepts `(item_id, qty)` pairs, server hydrates prices (internal API key auth) |
| `POST /api/internal/call-events` | Record call events (handoff, error, etc.) for audit trail |

## New Files

| File | Purpose |
|------|---------|
| `src/workers/call.ts` | Worker entry point, HTTP + WebSocket server |
| `src/workers/call-session.ts` | Per-call connection manager (Twilio WS ↔ OpenAI WS) |
| `src/workers/call-prompt.ts` | System prompt builder |
| `src/workers/call-tools.ts` | Function call handler (executes tools via API HTTP calls) |
| `src/workers/call-audio.ts` | mulaw ↔ PCM16 conversion + resampling |
| `migrations/0005_phone_numbers.sql` | Phone number → store mapping table |

## Call Lifecycle Summary

1. Caller dials Twilio number
2. Twilio POSTs to `/api/telephony/twiml-answer`
3. API looks up store from phone number, returns `<Connect><Stream>` TwiML
4. Twilio opens WebSocket to call worker at `/media-stream`
5. Worker receives `start` event, opens WebSocket to OpenAI Realtime API
6. Worker sends `session.update` (prompt, tools, voice, audio format)
7. Audio flows: Twilio → (mulaw→PCM16 upsample) → OpenAI → (PCM16→mulaw downsample) → Twilio
8. OpenAI calls tools → worker executes via API HTTP → returns results to OpenAI
9. Call ends via caller hangup (Twilio `stop` event) or `end_call` tool → Twilio REST API hangup
10. Worker cleans up both WebSocket connections
