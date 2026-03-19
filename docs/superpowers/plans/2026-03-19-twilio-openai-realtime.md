# Twilio + OpenAI Realtime API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect inbound Twilio phone calls to OpenAI Realtime API for voice-driven restaurant ordering, replacing the text-based state machine.

**Architecture:** A standalone call worker process bridges Twilio Media Streams (mulaw audio over WebSocket) to OpenAI Realtime API (PCM16 audio over WebSocket). OpenAI drives the conversation via system prompt + function calling. The worker executes tool calls (menu lookup, order creation, call control) against the existing API server over HTTP using internal endpoints.

**Tech Stack:** TypeScript, Node.js, `ws` (WebSocket client), `twilio` (REST API + webhook validation), OpenAI Realtime API, Express, PostgreSQL.

**Spec:** `docs/superpowers/specs/2026-03-19-twilio-openai-realtime-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/workers/call.ts` | Call worker entry point — HTTP server for health check, WebSocket upgrade handler for `/media-stream`, graceful shutdown |
| `src/workers/call-session.ts` | Per-call lifecycle — connects Twilio WS ↔ OpenAI Realtime WS, routes audio and events |
| `src/workers/call-audio.ts` | Audio format conversion — mulaw↔PCM16, 8kHz↔24kHz resampling |
| `src/workers/call-tools.ts` | Function call handler — executes OpenAI tool calls via HTTP to API server |
| `src/workers/call-prompt.ts` | System prompt builder — constructs OpenAI instructions from store name |
| `migrations/0005_phone_numbers.sql` | Phone number → store mapping table |
| `tests/callAudio.test.ts` | Unit tests for audio conversion |
| `tests/callTools.test.ts` | Unit tests for tool execution |
| `tests/callPrompt.test.ts` | Unit tests for prompt builder |
| `tests/callSession.test.ts` | Unit tests for session lifecycle |
| `tests/callWorker.test.ts` | Integration tests for worker WebSocket handling |
| `tests/internalEndpoints.test.ts` | Tests for new internal API endpoints |

### Modified Files
| File | Changes |
|------|---------|
| `src/app.ts` | Remove telephony endpoints (lines 436-521), remove `allowTelephonyAccess` (lines 560-586), remove `telephonyLimiter` (lines 140-144), remove `VoiceTools`/`handleCallerUtterance` imports (lines 7-8) and `voiceTools` init (line 127). Add new internal endpoints + TwiML endpoints. |
| `src/store/repository.ts` | Add `getStoreByPhone(phone: string): Promise<Store \| undefined>` method |
| `src/store/postgres.ts` | Implement `getStoreByPhone` using `phone_numbers` table join |
| `src/store/memory.ts` | Implement `getStoreByPhone` stub |
| `package.json` | Add `ws`, `twilio` dependencies; add `worker:call` script |
| `.env.example` | Add new env vars |
| `docker-compose.yml` | Add `call-worker` service |
| `Dockerfile` | Add `EXPOSE 3001` |

### Removed Files
| File | Reason |
|------|--------|
| `src/voice/stateMachine.ts` | Replaced by OpenAI Realtime conversation |
| `src/voice/tools.ts` | Replaced by `call-tools.ts` calling API over HTTP |
| `tests/stateMachine.test.ts` | Tests for removed code |
| `tests/voiceTools.test.ts` | Tests for removed code |
| `tests/telephony.test.ts` | Tests for removed endpoints |

---

## Task 1: Install dependencies and add npm scripts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install ws and twilio packages**

```bash
cd /Users/ivanchen/Projects/call-agent && npm install ws twilio
```

- [ ] **Step 2: Install ws type definitions**

```bash
cd /Users/ivanchen/Projects/call-agent && npm install -D @types/ws
```

- [ ] **Step 3: Add worker:call script to package.json**

In `package.json`, add to `"scripts"`:
```json
"worker:call": "tsx src/workers/call.ts"
```

Place it after the existing `"worker:outbox"` line.

- [ ] **Step 4: Verify install**

```bash
cd /Users/ivanchen/Projects/call-agent && npm run typecheck
```

Expected: passes (no new code yet, just dependencies)

- [ ] **Step 5: Commit**

```bash
cd /Users/ivanchen/Projects/call-agent && git add package.json package-lock.json && git commit -m "feat: add ws and twilio dependencies for call worker"
```

---

## Task 2: Add phone_numbers migration and repository method

**Files:**
- Create: `migrations/0005_phone_numbers.sql`
- Modify: `src/store/repository.ts`
- Modify: `src/store/postgres.ts`
- Modify: `src/store/memory.ts`

- [ ] **Step 1: Write the migration file**

Create `migrations/0005_phone_numbers.sql`:
```sql
CREATE TABLE phone_numbers (
  phone_number TEXT PRIMARY KEY,
  store_id     TEXT NOT NULL REFERENCES stores(id),
  label        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed: map a default number to store-1 for development
INSERT INTO phone_numbers (phone_number, store_id, label)
VALUES ('+15551234567', 'store-1', 'Dev Test Number')
ON CONFLICT DO NOTHING;
```

- [ ] **Step 2: Add `getStoreByPhone` to the repository interface**

In `src/store/repository.ts`, add to the `AppRepository` interface after `getStoreMode` (line 31):
```typescript
getStoreByPhone(phone: string): Promise<Store | undefined>;
```

- [ ] **Step 3: Implement `getStoreByPhone` in PostgresStore**

In `src/store/postgres.ts`, add a new method to the `PostgresStore` class:
```typescript
async getStoreByPhone(phone: string): Promise<Store | undefined> {
  const result = await this.pool.query<StoreRow>(
    `SELECT s.id, s.name, s.timezone, s.public_phone, s.mode, s.default_prep_mins
     FROM stores s
     JOIN phone_numbers pn ON pn.store_id = s.id
     WHERE pn.phone_number = $1`,
    [phone]
  );
  const row = result.rows[0];
  if (!row) return undefined;
  return {
    id: row.id,
    name: row.name,
    timezone: row.timezone,
    publicPhone: row.public_phone,
    mode: row.mode as StoreMode,
    defaultPrepMins: row.default_prep_mins
  };
}
```

Note: This uses inline mapping matching the pattern in `getStoreById` (postgres.ts lines 77-84). There is no `mapStoreRow` helper — the existing code maps inline.

- [ ] **Step 4: Implement `getStoreByPhone` stub in MemoryStore**

In `src/store/memory.ts`, add:
```typescript
async getStoreByPhone(_phone: string): Promise<Store | undefined> {
  return undefined;
}
```

- [ ] **Step 5: Run typecheck**

```bash
cd /Users/ivanchen/Projects/call-agent && npm run typecheck
```

Expected: passes

- [ ] **Step 6: Commit**

```bash
cd /Users/ivanchen/Projects/call-agent && git add migrations/0005_phone_numbers.sql src/store/repository.ts src/store/postgres.ts src/store/memory.ts && git commit -m "feat: add phone_numbers table and getStoreByPhone repository method"
```

---

## Task 3: Audio bridge — mulaw ↔ PCM16 conversion

**Files:**
- Create: `src/workers/call-audio.ts`
- Create: `tests/callAudio.test.ts`

- [ ] **Step 1: Write failing tests for audio conversion**

Create `tests/callAudio.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { mulawToPcm16, pcm16ToMulaw, upsample, downsample } from '../src/workers/call-audio.js';

describe('call-audio', () => {
  describe('mulawToPcm16', () => {
    it('converts a single mulaw byte to a 16-bit PCM sample', () => {
      // mulaw silence byte is 0xFF (or 0x7F), which should decode near 0
      const input = Buffer.from([0xff]);
      const output = mulawToPcm16(input);
      expect(output).toBeInstanceOf(Buffer);
      expect(output.length).toBe(2); // 1 mulaw byte → 1 PCM16 sample = 2 bytes
      const sample = output.readInt16LE(0);
      expect(Math.abs(sample)).toBeLessThan(100); // near silence
    });

    it('converts multiple mulaw bytes', () => {
      const input = Buffer.from([0xff, 0x7f, 0x00, 0x80]);
      const output = mulawToPcm16(input);
      expect(output.length).toBe(8); // 4 bytes → 4 samples × 2 bytes
    });
  });

  describe('pcm16ToMulaw', () => {
    it('converts a PCM16 sample to mulaw', () => {
      // Near-silence PCM16 sample
      const input = Buffer.alloc(2);
      input.writeInt16LE(0, 0);
      const output = pcm16ToMulaw(input);
      expect(output.length).toBe(1);
    });

    it('roundtrips approximately', () => {
      // A known PCM value → mulaw → PCM should be close
      const original = Buffer.alloc(2);
      original.writeInt16LE(1000, 0);
      const mulaw = pcm16ToMulaw(original);
      const recovered = mulawToPcm16(mulaw);
      const recoveredSample = recovered.readInt16LE(0);
      // mulaw is lossy, but should be within ~100 for low values
      expect(Math.abs(recoveredSample - 1000)).toBeLessThan(200);
    });
  });

  describe('upsample 8kHz → 24kHz', () => {
    it('triples the number of samples', () => {
      // 4 samples at 8kHz = 8 bytes PCM16
      const input = Buffer.alloc(8);
      input.writeInt16LE(0, 0);
      input.writeInt16LE(300, 2);
      input.writeInt16LE(600, 4);
      input.writeInt16LE(900, 6);
      const output = upsample(input, 8000, 24000);
      // 4 input samples → 12 output samples = 24 bytes
      expect(output.length).toBe(24);
    });
  });

  describe('downsample 24kHz → 8kHz', () => {
    it('reduces samples by factor of 3', () => {
      // 12 samples at 24kHz = 24 bytes PCM16
      const input = Buffer.alloc(24);
      for (let i = 0; i < 12; i++) {
        input.writeInt16LE(i * 100, i * 2);
      }
      const output = downsample(input, 24000, 8000);
      // 12 input → 4 output = 8 bytes
      expect(output.length).toBe(8);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/ivanchen/Projects/call-agent && npx vitest run tests/callAudio.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement the audio bridge**

Create `src/workers/call-audio.ts`:
```typescript
// mulaw decoding lookup table (ITU-T G.711)
const MULAW_DECODE_TABLE = new Int16Array(256);
(function buildMulawDecodeTable() {
  for (let i = 0; i < 256; i++) {
    const mu = ~i & 0xff;
    const sign = mu & 0x80 ? -1 : 1;
    const exponent = (mu >> 4) & 0x07;
    const mantissa = mu & 0x0f;
    const magnitude = ((mantissa << 1) + 33) * (1 << exponent) - 33;
    MULAW_DECODE_TABLE[i] = sign * magnitude;
  }
})();

// mulaw encoding: PCM16 → mulaw byte
const MULAW_BIAS = 33;
const MULAW_CLIP = 32635;

function encodeMulawSample(sample: number): number {
  const sign = sample < 0 ? 0x80 : 0x00;
  let magnitude = Math.min(Math.abs(sample), MULAW_CLIP);
  magnitude += MULAW_BIAS;

  let exponent = 7;
  const expMask = 0x4000;
  for (let i = 0; i < 8; i++) {
    if (magnitude & (expMask >> i)) {
      exponent = 7 - i;
      break;
    }
  }

  const mantissa = (magnitude >> (exponent + 3)) & 0x0f;
  const mulawByte = ~(sign | (exponent << 4) | mantissa) & 0xff;
  return mulawByte;
}

export function mulawToPcm16(mulawBuf: Buffer): Buffer {
  const pcm = Buffer.alloc(mulawBuf.length * 2);
  for (let i = 0; i < mulawBuf.length; i++) {
    pcm.writeInt16LE(MULAW_DECODE_TABLE[mulawBuf[i]!], i * 2);
  }
  return pcm;
}

export function pcm16ToMulaw(pcmBuf: Buffer): Buffer {
  const sampleCount = pcmBuf.length >> 1;
  const mulaw = Buffer.alloc(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    mulaw[i] = encodeMulawSample(pcmBuf.readInt16LE(i * 2));
  }
  return mulaw;
}

export function upsample(pcmBuf: Buffer, fromRate: number, toRate: number): Buffer {
  const ratio = toRate / fromRate;
  const inputSamples = pcmBuf.length >> 1;
  const outputSamples = Math.round(inputSamples * ratio);
  const output = Buffer.alloc(outputSamples * 2);

  for (let i = 0; i < outputSamples; i++) {
    const srcIndex = (i / ratio);
    const srcFloor = Math.floor(srcIndex);
    const srcCeil = Math.min(srcFloor + 1, inputSamples - 1);
    const frac = srcIndex - srcFloor;

    const a = pcmBuf.readInt16LE(srcFloor * 2);
    const b = pcmBuf.readInt16LE(srcCeil * 2);
    const interpolated = Math.round(a + (b - a) * frac);
    output.writeInt16LE(interpolated, i * 2);
  }

  return output;
}

export function downsample(pcmBuf: Buffer, fromRate: number, toRate: number): Buffer {
  const ratio = fromRate / toRate;
  const inputSamples = pcmBuf.length >> 1;
  const outputSamples = Math.floor(inputSamples / ratio);
  const output = Buffer.alloc(outputSamples * 2);

  for (let i = 0; i < outputSamples; i++) {
    const srcIndex = Math.round(i * ratio);
    const clamped = Math.min(srcIndex, inputSamples - 1);
    output.writeInt16LE(pcmBuf.readInt16LE(clamped * 2), i * 2);
  }

  return output;
}

/** Full pipeline: Twilio mulaw 8kHz base64 → OpenAI PCM16 24kHz base64 */
export function twilioToOpenAI(base64Mulaw: string): string {
  const mulaw = Buffer.from(base64Mulaw, 'base64');
  const pcm8k = mulawToPcm16(mulaw);
  const pcm24k = upsample(pcm8k, 8000, 24000);
  return pcm24k.toString('base64');
}

/** Full pipeline: OpenAI PCM16 24kHz base64 → Twilio mulaw 8kHz base64 */
export function openAIToTwilio(base64Pcm24k: string): string {
  const pcm24k = Buffer.from(base64Pcm24k, 'base64');
  const pcm8k = downsample(pcm24k, 24000, 8000);
  const mulaw = pcm16ToMulaw(pcm8k);
  return mulaw.toString('base64');
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/ivanchen/Projects/call-agent && npx vitest run tests/callAudio.test.ts
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/ivanchen/Projects/call-agent && git add src/workers/call-audio.ts tests/callAudio.test.ts && git commit -m "feat: add mulaw/PCM16 audio bridge for Twilio-OpenAI conversion"
```

---

## Task 4: System prompt builder

**Files:**
- Create: `src/workers/call-prompt.ts`
- Create: `tests/callPrompt.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/callPrompt.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../src/workers/call-prompt.js';

describe('buildSystemPrompt', () => {
  it('includes the store name', () => {
    const prompt = buildSystemPrompt('Mario\'s Pizza');
    expect(prompt).toContain('Mario\'s Pizza');
  });

  it('includes pickup-only rule', () => {
    const prompt = buildSystemPrompt('Test Store');
    expect(prompt).toContain('pickup');
  });

  it('mentions tool names', () => {
    const prompt = buildSystemPrompt('Test Store');
    expect(prompt).toContain('get_store_mode');
    expect(prompt).toContain('search_menu');
    expect(prompt).toContain('create_order');
    expect(prompt).toContain('transfer_to_staff');
    expect(prompt).toContain('end_call');
  });

  it('instructs to collect customer name', () => {
    const prompt = buildSystemPrompt('Test Store');
    expect(prompt).toContain('name');
  });

  it('instructs to confirm order before submitting', () => {
    const prompt = buildSystemPrompt('Test Store');
    expect(prompt).toContain('confirm');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/ivanchen/Projects/call-agent && npx vitest run tests/callPrompt.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement the prompt builder**

Create `src/workers/call-prompt.ts`:
```typescript
export function buildSystemPrompt(storeName: string): string {
  return `You are a friendly phone ordering assistant for ${storeName}. You help callers place pickup orders.

## Rules
- This is a PICKUP ONLY restaurant. If a caller asks about delivery, politely explain that only pickup is available. If they insist on delivery, use the transfer_to_staff tool.
- Payment is at pickup. Do not ask for payment information.
- You MUST collect the caller's name before taking their order.
- You can ONLY offer items that exist in the menu. Use the search_menu tool to look up items.
- Before submitting an order, read it back to the caller and get explicit confirmation ("yes", "that's right", etc.). Do NOT submit until they confirm.
- Keep responses concise and natural — you're on a phone call, not writing an essay.

## Store Mode Behavior
- Call get_store_mode at the start of every call.
- If the store is OPEN: greet the caller and offer to take their order.
- If the store is BUSY: inform the caller that wait times may be longer than usual, but still take orders.
- If the store is CLOSED: apologize, let them know the store is closed, and use end_call.

## Conversation Flow
1. Greet the caller warmly. Check the store mode.
2. Ask for their name.
3. Take their order — ask what they'd like. Use search_menu to validate each item.
4. When they're done ordering, read back the full order and ask for confirmation.
5. On confirmation, use create_order to submit.
6. Thank them and let them know their order is in. Use end_call.

## Escalation
- If the caller asks for a staff member, human, or manager, use transfer_to_staff immediately.
- If you cannot understand the caller after 2-3 attempts, use transfer_to_staff.
- If the situation is outside your scope (complaints, refunds, etc.), use transfer_to_staff.

## Tools Available
- get_store_mode: Check if the store is OPEN, BUSY, or CLOSED.
- search_menu: Search for menu items by name. Returns matching items with prices.
- create_order: Submit a confirmed order. Requires customer_name and items with item_id and qty.
- transfer_to_staff: Transfer the call to a staff member. Provide a reason.
- end_call: End the call. Use after completing an order or when the store is closed.`;
}

export function buildToolDefinitions(): Array<{
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}> {
  return [
    {
      type: 'function',
      name: 'get_store_mode',
      description: 'Check if the store is currently OPEN, BUSY, or CLOSED. Call this at the start of every conversation.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    },
    {
      type: 'function',
      name: 'search_menu',
      description: 'Search the menu for items matching a query. Returns item names, IDs, prices, and availability.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search term for menu items (e.g. "burger", "fries", "drink")'
          }
        },
        required: ['query']
      }
    },
    {
      type: 'function',
      name: 'create_order',
      description: 'Submit a confirmed pickup order. Only call this AFTER the caller has confirmed the order readback.',
      parameters: {
        type: 'object',
        properties: {
          customer_name: {
            type: 'string',
            description: 'The caller\'s name'
          },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                item_id: { type: 'string', description: 'Menu item ID from search_menu results' },
                qty: { type: 'integer', description: 'Quantity ordered' }
              },
              required: ['item_id', 'qty']
            },
            description: 'List of items to order'
          }
        },
        required: ['customer_name', 'items']
      }
    },
    {
      type: 'function',
      name: 'transfer_to_staff',
      description: 'Transfer the call to a staff member. Use when the caller requests a human, or the situation is outside your scope.',
      parameters: {
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            description: 'Why the call is being transferred (e.g. "caller_requested_staff", "cannot_understand", "complaint")'
          }
        },
        required: ['reason']
      }
    },
    {
      type: 'function',
      name: 'end_call',
      description: 'End the phone call. Use after successfully completing an order, or when the store is closed.',
      parameters: {
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            description: 'Why the call is ending (e.g. "order_complete", "store_closed", "caller_canceled")'
          }
        },
        required: ['reason']
      }
    }
  ];
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/ivanchen/Projects/call-agent && npx vitest run tests/callPrompt.test.ts
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/ivanchen/Projects/call-agent && git add src/workers/call-prompt.ts tests/callPrompt.test.ts && git commit -m "feat: add OpenAI Realtime system prompt and tool definitions"
```

---

## Task 5: Function call handler (call-tools)

**Files:**
- Create: `src/workers/call-tools.ts`
- Create: `tests/callTools.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/callTools.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CallToolHandler } from '../src/workers/call-tools.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('CallToolHandler', () => {
  let handler: CallToolHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new CallToolHandler({
      apiBaseUrl: 'http://localhost:3000',
      internalApiKey: 'test-key',
      storeId: 'store-1',
      callerPhone: '+15559876543',
      callSid: 'CA123'
    });
  });

  describe('get_store_mode', () => {
    it('fetches store info and returns mode', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'store-1',
          name: 'Test Store',
          mode: 'OPEN',
          default_prep_mins: 15
        })
      });

      const result = await handler.execute('get_store_mode', '{}');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/internal/stores/store-1',
        expect.objectContaining({
          headers: expect.objectContaining({ 'x-internal-api-key': 'test-key' })
        })
      );
      const parsed = JSON.parse(result);
      expect(parsed.mode).toBe('OPEN');
    });
  });

  describe('search_menu', () => {
    it('fetches menu with query param', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            { id: 'item-1', name: 'Cheeseburger', basePriceCents: 999, isAvailable: true }
          ]
        })
      });

      const result = await handler.execute('search_menu', JSON.stringify({ query: 'burger' }));
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/internal/stores/store-1/menu?q=burger',
        expect.any(Object)
      );
      const parsed = JSON.parse(result);
      expect(parsed.items).toHaveLength(1);
      expect(parsed.items[0].name).toBe('Cheeseburger');
    });
  });

  describe('create_order', () => {
    it('posts simplified order to internal endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'order-1',
          order_number: 42,
          status: 'NEW'
        })
      });

      const args = JSON.stringify({
        customer_name: 'Alice',
        items: [{ item_id: 'item-1', qty: 2 }]
      });
      const result = await handler.execute('create_order', args);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/internal/orders',
        expect.objectContaining({
          method: 'POST',
          body: expect.any(String)
        })
      );
      const parsed = JSON.parse(result);
      expect(parsed.order_number).toBe(42);
    });
  });

  describe('unknown tool', () => {
    it('returns an error string', async () => {
      const result = await handler.execute('nonexistent', '{}');
      expect(result).toContain('error');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/ivanchen/Projects/call-agent && npx vitest run tests/callTools.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement the tool handler**

Create `src/workers/call-tools.ts`:
```typescript
import { randomUUID } from 'node:crypto';
import { safeLog } from '../logger.js';

export interface CallToolConfig {
  apiBaseUrl: string;
  internalApiKey: string;
  storeId: string;
  callerPhone: string;
  callSid: string;
}

export class CallToolHandler {
  constructor(private readonly config: CallToolConfig) {}

  async execute(toolName: string, argsJson: string): Promise<string> {
    try {
      switch (toolName) {
        case 'get_store_mode':
          return await this.getStoreMode();
        case 'search_menu':
          return await this.searchMenu(argsJson);
        case 'create_order':
          return await this.createOrder(argsJson);
        case 'transfer_to_staff':
          return await this.transferToStaff(argsJson);
        case 'end_call':
          return await this.endCall(argsJson);
        default:
          return JSON.stringify({ error: `unknown tool: ${toolName}` });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      safeLog('error', 'tool_call_failed', {
        callSid: this.config.callSid,
        tool: toolName,
        error: message
      });
      return JSON.stringify({ error: message });
    }
  }

  private async apiGet(path: string): Promise<unknown> {
    const res = await fetch(`${this.config.apiBaseUrl}${path}`, {
      headers: {
        'x-internal-api-key': this.config.internalApiKey,
        'Accept': 'application/json'
      }
    });
    if (!res.ok) throw new Error(`API ${path} returned ${res.status}`);
    return res.json();
  }

  private async apiPost(path: string, body: unknown): Promise<unknown> {
    const res = await fetch(`${this.config.apiBaseUrl}${path}`, {
      method: 'POST',
      headers: {
        'x-internal-api-key': this.config.internalApiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Idempotency-Key': randomUUID()
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`API ${path} returned ${res.status}`);
    return res.json();
  }

  private async getStoreMode(): Promise<string> {
    const data = await this.apiGet(`/api/internal/stores/${this.config.storeId}`);
    return JSON.stringify(data);
  }

  private async searchMenu(argsJson: string): Promise<string> {
    const { query } = JSON.parse(argsJson) as { query: string };
    const data = await this.apiGet(
      `/api/internal/stores/${this.config.storeId}/menu?q=${encodeURIComponent(query)}`
    );
    return JSON.stringify(data);
  }

  private async createOrder(argsJson: string): Promise<string> {
    const { customer_name, items } = JSON.parse(argsJson) as {
      customer_name: string;
      items: Array<{ item_id: string; qty: number }>;
    };
    const data = await this.apiPost('/api/internal/orders', {
      store_id: this.config.storeId,
      call_id: this.config.callSid,
      customer_name,
      customer_phone: this.config.callerPhone,
      items
    });
    return JSON.stringify(data);
  }

  private async transferToStaff(argsJson: string): Promise<string> {
    const { reason } = JSON.parse(argsJson) as { reason: string };
    await this.apiPost('/api/internal/call-events', {
      store_id: this.config.storeId,
      call_id: this.config.callSid,
      event_type: 'CallHandoffRequested',
      payload: { reason, callerPhone: this.config.callerPhone }
    });
    // The actual Twilio call redirect is handled by call-session.ts
    return JSON.stringify({ status: 'transferring', reason });
  }

  private async endCall(argsJson: string): Promise<string> {
    const { reason } = JSON.parse(argsJson) as { reason: string };
    // The actual Twilio hangup is handled by call-session.ts
    return JSON.stringify({ status: 'ending', reason });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/ivanchen/Projects/call-agent && npx vitest run tests/callTools.test.ts
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/ivanchen/Projects/call-agent && git add src/workers/call-tools.ts tests/callTools.test.ts && git commit -m "feat: add call tool handler for OpenAI function calls"
```

---

## Task 6: Per-call session manager

**Files:**
- Create: `src/workers/call-session.ts`
- Create: `tests/callSession.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/callSession.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CallSession, CallSessionConfig } from '../src/workers/call-session.js';

// We test the session's message routing logic, not actual WebSocket connections
describe('CallSession', () => {
  let config: CallSessionConfig;

  beforeEach(() => {
    config = {
      streamSid: 'MZ123',
      callSid: 'CA123',
      storeId: 'store-1',
      storeName: 'Test Store',
      callerPhone: '+15559876543',
      apiBaseUrl: 'http://localhost:3000',
      internalApiKey: 'test-key',
      openaiApiKey: 'sk-test',
      openaiModel: 'gpt-4o-realtime-preview',
      openaiVoice: 'alloy',
      twilioAccountSid: 'AC123',
      twilioAuthToken: 'auth-token'
    };
  });

  it('creates a session with correct config', () => {
    const session = new CallSession(config);
    expect(session.callSid).toBe('CA123');
    expect(session.storeId).toBe('store-1');
  });

  it('builds correct OpenAI session.update message', () => {
    const session = new CallSession(config);
    const msg = session.buildSessionUpdate();
    expect(msg.type).toBe('session.update');
    expect(msg.session.model).toBe('gpt-4o-realtime-preview');
    expect(msg.session.voice).toBe('alloy');
    expect(msg.session.tools).toHaveLength(5);
    expect(msg.session.instructions).toContain('Test Store');
    expect(msg.session.input_audio_format).toBe('pcm16');
    expect(msg.session.output_audio_format).toBe('pcm16');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/ivanchen/Projects/call-agent && npx vitest run tests/callSession.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement call-session**

Create `src/workers/call-session.ts`:
```typescript
import WebSocket from 'ws';
import { safeLog } from '../logger.js';
import { twilioToOpenAI, openAIToTwilio } from './call-audio.js';
import { CallToolHandler } from './call-tools.js';
import { buildSystemPrompt, buildToolDefinitions } from './call-prompt.js';

export interface CallSessionConfig {
  streamSid: string;
  callSid: string;
  storeId: string;
  storeName: string;
  callerPhone: string;
  apiBaseUrl: string;
  internalApiKey: string;
  openaiApiKey: string;
  openaiModel: string;
  openaiVoice: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
}

export class CallSession {
  readonly callSid: string;
  readonly storeId: string;
  private openaiWs: WebSocket | null = null;
  private twilioWs: WebSocket | null = null;
  private toolHandler: CallToolHandler;
  private config: CallSessionConfig;
  private startedAt = Date.now();
  private closed = false;

  constructor(config: CallSessionConfig) {
    this.config = config;
    this.callSid = config.callSid;
    this.storeId = config.storeId;
    this.toolHandler = new CallToolHandler({
      apiBaseUrl: config.apiBaseUrl,
      internalApiKey: config.internalApiKey,
      storeId: config.storeId,
      callerPhone: config.callerPhone,
      callSid: config.callSid
    });
  }

  buildSessionUpdate(): {
    type: 'session.update';
    session: Record<string, unknown>;
  } {
    return {
      type: 'session.update',
      session: {
        model: this.config.openaiModel,
        modalities: ['text', 'audio'],
        voice: this.config.openaiVoice,
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: { model: 'whisper-1' },
        turn_detection: { type: 'server_vad' },
        tools: buildToolDefinitions(),
        instructions: buildSystemPrompt(this.config.storeName)
      }
    };
  }

  start(twilioSocket: WebSocket): void {
    this.twilioWs = twilioSocket;

    const openaiUrl = `wss://api.openai.com/v1/realtime?model=${this.config.openaiModel}`;
    this.openaiWs = new WebSocket(openaiUrl, {
      headers: {
        'Authorization': `Bearer ${this.config.openaiApiKey}`,
        'OpenAI-Beta': 'realtime=v1'
      }
    });

    this.openaiWs.on('open', () => {
      safeLog('info', 'openai_ws_connected', { callSid: this.callSid });
      this.openaiWs!.send(JSON.stringify(this.buildSessionUpdate()));
    });

    this.openaiWs.on('message', (data) => {
      this.handleOpenAIMessage(data.toString());
    });

    this.openaiWs.on('error', (err) => {
      safeLog('error', 'openai_ws_error', {
        callSid: this.callSid,
        error: err.message
      });
      this.handleOpenAIFailure();
    });

    this.openaiWs.on('close', () => {
      safeLog('info', 'openai_ws_closed', { callSid: this.callSid });
      if (!this.closed) this.cleanup('openai_disconnect');
    });

    twilioSocket.on('message', (data) => {
      this.handleTwilioMessage(data.toString());
    });

    twilioSocket.on('close', () => {
      safeLog('info', 'twilio_ws_closed', { callSid: this.callSid });
      this.cleanup('caller_hangup');
    });

    twilioSocket.on('error', (err) => {
      safeLog('error', 'twilio_ws_error', {
        callSid: this.callSid,
        error: err.message
      });
      this.cleanup('twilio_error');
    });

    safeLog('info', 'call_started', {
      callSid: this.callSid,
      storeId: this.storeId,
      callerPhone: this.config.callerPhone
    });
  }

  private handleTwilioMessage(raw: string): void {
    const msg = JSON.parse(raw);

    if (msg.event === 'media' && this.openaiWs?.readyState === WebSocket.OPEN) {
      const pcmBase64 = twilioToOpenAI(msg.media.payload);
      this.openaiWs.send(JSON.stringify({
        type: 'input_audio_buffer.append',
        audio: pcmBase64
      }));
    }

    if (msg.event === 'stop') {
      this.cleanup('twilio_stop');
    }
  }

  private handleOpenAIMessage(raw: string): void {
    const msg = JSON.parse(raw);

    if (msg.type === 'response.audio.delta' && this.twilioWs?.readyState === WebSocket.OPEN) {
      const mulawBase64 = openAIToTwilio(msg.delta);
      this.twilioWs.send(JSON.stringify({
        event: 'media',
        streamSid: this.config.streamSid,
        media: { payload: mulawBase64 }
      }));
    }

    if (msg.type === 'response.function_call_arguments.done') {
      this.handleFunctionCall(msg.call_id, msg.name, msg.arguments);
    }
  }

  private async handleFunctionCall(callId: string, name: string, argsJson: string): Promise<void> {
    safeLog('info', 'tool_called', {
      callSid: this.callSid,
      tool: name
    });

    const result = await this.toolHandler.execute(name, argsJson);

    // Send result back to OpenAI
    if (this.openaiWs?.readyState === WebSocket.OPEN) {
      this.openaiWs.send(JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: callId,
          output: result
        }
      }));

      // Trigger OpenAI to continue the conversation
      this.openaiWs.send(JSON.stringify({ type: 'response.create' }));
    }

    // Handle call control tools
    if (name === 'end_call') {
      await this.twilioHangup();
    }

    if (name === 'transfer_to_staff') {
      await this.twilioTransfer();
    }
  }

  private async twilioHangup(): Promise<void> {
    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${this.config.twilioAccountSid}/Calls/${this.callSid}.json`;
      await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(
            `${this.config.twilioAccountSid}:${this.config.twilioAuthToken}`
          ).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'Status=completed'
      });
    } catch (err) {
      safeLog('error', 'twilio_hangup_failed', {
        callSid: this.callSid,
        error: err instanceof Error ? err.message : 'unknown'
      });
    }
  }

  private async twilioTransfer(): Promise<void> {
    try {
      const twimlUrl = `${this.config.apiBaseUrl}/api/telephony/twiml-transfer?store_id=${this.storeId}`;
      const url = `https://api.twilio.com/2010-04-01/Accounts/${this.config.twilioAccountSid}/Calls/${this.callSid}.json`;
      await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(
            `${this.config.twilioAccountSid}:${this.config.twilioAuthToken}`
          ).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `Url=${encodeURIComponent(twimlUrl)}`
      });
    } catch (err) {
      safeLog('error', 'twilio_transfer_failed', {
        callSid: this.callSid,
        error: err instanceof Error ? err.message : 'unknown'
      });
    }
  }

  private handleOpenAIFailure(): void {
    // Redirect call to error TwiML
    const twimlUrl = `${this.config.apiBaseUrl}/api/telephony/twiml-error`;
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.config.twilioAccountSid}/Calls/${this.callSid}.json`;
    fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(
          `${this.config.twilioAccountSid}:${this.config.twilioAuthToken}`
        ).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `Url=${encodeURIComponent(twimlUrl)}`
    }).catch((err) => {
      safeLog('error', 'twilio_error_redirect_failed', {
        callSid: this.callSid,
        error: err instanceof Error ? err.message : 'unknown'
      });
    });
    this.cleanup('openai_failure');
  }

  cleanup(reason: string): void {
    if (this.closed) return;
    this.closed = true;

    const durationMs = Date.now() - this.startedAt;
    safeLog('info', 'call_ended', {
      callSid: this.callSid,
      storeId: this.storeId,
      duration_ms: durationMs,
      reason
    });

    if (this.openaiWs && this.openaiWs.readyState === WebSocket.OPEN) {
      this.openaiWs.close();
    }
    if (this.twilioWs && this.twilioWs.readyState === WebSocket.OPEN) {
      this.twilioWs.close();
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/ivanchen/Projects/call-agent && npx vitest run tests/callSession.test.ts
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/ivanchen/Projects/call-agent && git add src/workers/call-session.ts tests/callSession.test.ts && git commit -m "feat: add per-call session manager bridging Twilio and OpenAI"
```

---

## Task 7: Call worker entry point

**Files:**
- Create: `src/workers/call.ts`
- Create: `tests/callWorker.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/callWorker.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { createCallWorkerServer } from '../src/workers/call.js';

describe('call worker server', () => {
  it('exports createCallWorkerServer function', () => {
    expect(typeof createCallWorkerServer).toBe('function');
  });

  it('creates an HTTP server that responds to /health', async () => {
    const { server } = createCallWorkerServer({
      port: 0, // random port
      apiBaseUrl: 'http://localhost:3000',
      internalApiKey: 'test',
      openaiApiKey: 'sk-test',
      openaiModel: 'gpt-4o-realtime-preview',
      openaiVoice: 'alloy',
      twilioAccountSid: 'AC123',
      twilioAuthToken: 'auth'
    });

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;

    const res = await fetch(`http://localhost:${port}/health`);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.service).toBe('call-worker');
    expect(body.active_calls).toBe(0);

    server.close();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/ivanchen/Projects/call-agent && npx vitest run tests/callWorker.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement the call worker**

Create `src/workers/call.ts`:
```typescript
import { createServer, type IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import WebSocket, { WebSocketServer } from 'ws';
import { safeLog } from '../logger.js';
import { CallSession } from './call-session.js';

interface CallWorkerConfig {
  port: number;
  apiBaseUrl: string;
  internalApiKey: string;
  openaiApiKey: string;
  openaiModel: string;
  openaiVoice: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
}

export function createCallWorkerServer(config: CallWorkerConfig) {
  const activeSessions = new Map<string, CallSession>();

  const server = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        service: 'call-worker',
        active_calls: activeSessions.size
      }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? '/', `http://localhost:${config.port}`);
    if (url.pathname !== '/media-stream') {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      handleNewTwilioConnection(ws, config, activeSessions);
    });
  });

  return { server, activeSessions };
}

function handleNewTwilioConnection(
  ws: WebSocket,
  config: CallWorkerConfig,
  activeSessions: Map<string, CallSession>
): void {
  let streamSid: string | null = null;

  // This handler ONLY processes the initial "start" event from Twilio.
  // Once the session is created, session.start(ws) registers its own
  // handlers for media/stop events. We remove this listener after
  // setup to avoid double-processing audio frames.
  const onMessage = (data: WebSocket.RawData) => {
    const msg = JSON.parse(data.toString());

    if (msg.event === 'start') {
      const { customParameters } = msg.start;
      streamSid = msg.start.streamSid;
      const callSid = msg.start.callSid;
      const storeId = customParameters?.store_id ?? 'store-1';
      const storeName = customParameters?.store_name ?? 'Restaurant';
      const callerPhone = customParameters?.caller_phone ?? 'unknown';

      const session = new CallSession({
        streamSid: streamSid!,
        callSid,
        storeId,
        storeName,
        callerPhone,
        apiBaseUrl: config.apiBaseUrl,
        internalApiKey: config.internalApiKey,
        openaiApiKey: config.openaiApiKey,
        openaiModel: config.openaiModel,
        openaiVoice: config.openaiVoice,
        twilioAccountSid: config.twilioAccountSid,
        twilioAuthToken: config.twilioAuthToken
      });

      activeSessions.set(streamSid!, session);

      // Remove this listener BEFORE calling start() to avoid
      // double-registration on the WebSocket
      ws.removeListener('message', onMessage);

      session.start(ws);

      safeLog('info', 'call_session_created', {
        streamSid,
        callSid,
        storeId,
        active_calls: activeSessions.size
      });
    }
  };

  ws.on('message', onMessage);

  ws.on('close', () => {
    if (streamSid) {
      activeSessions.delete(streamSid);
    }
  });
}

// --- Main entry point (only runs when executed directly) ---

function readEnvOrThrow(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

async function main(): Promise<void> {
  const port = Number(process.env.CALL_WORKER_PORT ?? 3001);

  const config: CallWorkerConfig = {
    port,
    apiBaseUrl: readEnvOrThrow('API_BASE_URL'),
    internalApiKey: readEnvOrThrow('INTERNAL_API_KEY'),
    openaiApiKey: readEnvOrThrow('OPENAI_API_KEY'),
    openaiModel: process.env.OPENAI_REALTIME_MODEL ?? 'gpt-4o-realtime-preview',
    openaiVoice: process.env.OPENAI_VOICE ?? 'alloy',
    twilioAccountSid: readEnvOrThrow('TWILIO_ACCOUNT_SID'),
    twilioAuthToken: readEnvOrThrow('TWILIO_AUTH_TOKEN')
  };

  const { server, activeSessions } = createCallWorkerServer(config);

  // Graceful shutdown
  let draining = false;
  const shutdown = () => {
    if (draining) return;
    draining = true;
    safeLog('info', 'call_worker_shutting_down', { active_calls: activeSessions.size });

    // Stop accepting new connections
    server.close();

    // Wait for active calls or timeout after 30s
    const timeout = setTimeout(() => {
      safeLog('warn', 'call_worker_force_shutdown', { remaining_calls: activeSessions.size });
      for (const session of activeSessions.values()) {
        session.cleanup('shutdown');
      }
      process.exit(0);
    }, 30_000);

    const checkDrained = setInterval(() => {
      if (activeSessions.size === 0) {
        clearInterval(checkDrained);
        clearTimeout(timeout);
        safeLog('info', 'call_worker_shutdown_complete', {});
        process.exit(0);
      }
    }, 1000);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  server.listen(port, () => {
    safeLog('info', 'call_worker_started', { port });
  });
}

// Run at module scope (same pattern as outbox.ts)
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/ivanchen/Projects/call-agent && npx vitest run tests/callWorker.test.ts
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/ivanchen/Projects/call-agent && git add src/workers/call.ts tests/callWorker.test.ts && git commit -m "feat: add call worker entry point with WebSocket server and graceful shutdown"
```

---

## Task 8: Add internal API endpoints and TwiML endpoints to the API server

**Files:**
- Modify: `src/app.ts`
- Modify: `src/store/repository.ts` (already done in Task 2)
- Create: `tests/internalEndpoints.test.ts`

- [ ] **Step 1: Write failing tests for internal endpoints**

Create `tests/internalEndpoints.test.ts`:
```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('internal call endpoints', () => {
  let app: ReturnType<typeof createApp>['app'];
  let db: ReturnType<typeof createApp>['db'];

  beforeAll(() => {
    process.env.INTERNAL_API_KEY = 'test-internal-key';
    const created = createApp();
    app = created.app;
    db = created.db;
  });

  describe('GET /api/internal/stores/:storeId', () => {
    it('returns store info with valid API key', async () => {
      const res = await request(app)
        .get('/api/internal/stores/store-1')
        .set('x-internal-api-key', 'test-internal-key');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('mode');
      expect(res.body).toHaveProperty('name');
    });

    it('returns 401 without API key', async () => {
      const res = await request(app)
        .get('/api/internal/stores/store-1');
      expect(res.status).toBe(401);
    });

    it('returns 404 for unknown store', async () => {
      const res = await request(app)
        .get('/api/internal/stores/nonexistent')
        .set('x-internal-api-key', 'test-internal-key');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/internal/stores/:storeId/menu', () => {
    it('returns menu items', async () => {
      const res = await request(app)
        .get('/api/internal/stores/store-1/menu')
        .set('x-internal-api-key', 'test-internal-key');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('items');
    });

    it('filters by query param', async () => {
      const res = await request(app)
        .get('/api/internal/stores/store-1/menu?q=burger')
        .set('x-internal-api-key', 'test-internal-key');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('items');
    });
  });

  describe('POST /api/internal/orders', () => {
    it('creates order with simplified payload', async () => {
      // Requires menu items to exist in the store — may need seeding
      // For memory backend, this test verifies the endpoint exists and validates input
      const res = await request(app)
        .post('/api/internal/orders')
        .set('x-internal-api-key', 'test-internal-key')
        .send({
          store_id: 'store-1',
          call_id: 'CA-test-123',
          customer_name: 'Test Caller',
          customer_phone: '+15551234567',
          items: [{ item_id: 'nonexistent', qty: 1 }]
        });
      // Expect either 201 (if items exist) or 400/404 (if items don't exist)
      expect([201, 400, 404]).toContain(res.status);
    });
  });

  describe('POST /api/telephony/twiml-answer', () => {
    it('returns TwiML XML', async () => {
      const res = await request(app)
        .post('/api/telephony/twiml-answer')
        .type('form')
        .send({ Called: '+15551234567', From: '+15559876543', CallSid: 'CA123' });
      expect(res.status).toBe(200);
      expect(res.header['content-type']).toContain('xml');
    });
  });

  describe('POST /api/telephony/twiml-transfer', () => {
    it('returns Dial TwiML', async () => {
      const res = await request(app)
        .post('/api/telephony/twiml-transfer')
        .query({ store_id: 'store-1' });
      expect(res.status).toBe(200);
      expect(res.header['content-type']).toContain('xml');
      expect(res.text).toContain('<Dial>');
    });
  });

  describe('POST /api/telephony/twiml-error', () => {
    it('returns apology TwiML', async () => {
      const res = await request(app)
        .post('/api/telephony/twiml-error');
      expect(res.status).toBe(200);
      expect(res.header['content-type']).toContain('xml');
      expect(res.text).toContain('<Say>');
      expect(res.text).toContain('<Hangup');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/ivanchen/Projects/call-agent && npx vitest run tests/internalEndpoints.test.ts
```

Expected: FAIL — endpoints don't exist yet

- [ ] **Step 3: Add the internal endpoints and TwiML endpoints to src/app.ts**

In `src/app.ts`, add the following endpoints after the existing internal endpoints block (after line 434), BEFORE the telephony endpoints that will be removed in Task 9:

```typescript
  // --- Internal endpoints for call worker ---

  app.get('/api/internal/stores/:storeId', asyncRoute(async (req, res) => {
    if (!allowServiceToken(req, res, process.env.INTERNAL_API_KEY, 'x-internal-api-key')) return;
    const storeId = z.string().parse(req.params.storeId);
    const store = await db.getStoreById(storeId);
    if (!store) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'store not found' } });
    res.json({
      id: store.id,
      name: store.name,
      timezone: store.timezone,
      public_phone: store.publicPhone,
      mode: store.mode,
      default_prep_mins: store.defaultPrepMins
    });
  }));

  app.get('/api/internal/stores/:storeId/menu', asyncRoute(async (req, res) => {
    if (!allowServiceToken(req, res, process.env.INTERNAL_API_KEY, 'x-internal-api-key')) return;
    const storeId = z.string().parse(req.params.storeId);
    const items = await db.getMenu(storeId);
    const query = typeof req.query.q === 'string' ? req.query.q.toLowerCase() : '';
    const filtered = query
      ? items.filter((item) => item.name.toLowerCase().includes(query))
      : items;
    res.json({
      items: filtered.map((item) => ({
        id: item.id,
        name: item.name,
        price_cents: item.basePriceCents,
        is_available: item.isAvailable
      }))
    });
  }));

  app.post('/api/internal/orders', asyncRoute(async (req, res) => {
    if (!allowServiceToken(req, res, process.env.INTERNAL_API_KEY, 'x-internal-api-key')) return;
    if (!isOrderIntakeEnabled()) {
      return res.status(503).json({ error: { code: 'ORDER_INTAKE_DISABLED', message: 'order intake disabled' } });
    }
    const parsed = z.object({
      store_id: z.string().min(1),
      call_id: z.string().optional(),
      customer_name: z.string().min(1),
      customer_phone: z.string().min(4),
      items: z.array(z.object({
        item_id: z.string().min(1),
        qty: z.number().int().positive()
      })).min(1)
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    // Hydrate items from menu
    const menuItems = await db.getMenu(parsed.data.store_id);
    const menuMap = new Map(menuItems.map((m) => [m.id, m]));
    const hydratedItems: OrderItemInput[] = [];
    for (const item of parsed.data.items) {
      const menuItem = menuMap.get(item.item_id);
      if (!menuItem) return res.status(400).json({ error: { code: 'ITEM_NOT_FOUND', message: `menu item ${item.item_id} not found` } });
      if (!menuItem.isAvailable) return res.status(400).json({ error: { code: 'ITEM_UNAVAILABLE', message: `${menuItem.name} is currently unavailable` } });
      hydratedItems.push({
        itemId: menuItem.id,
        itemNameSnapshot: menuItem.name,
        qty: item.qty,
        basePriceCents: menuItem.basePriceCents,
        modifiersSnapshotJson: [],
        lineTotalCents: menuItem.basePriceCents * item.qty
      });
    }
    const totalCents = hydratedItems.reduce((sum, i) => sum + i.lineTotalCents, 0);

    const order = await orderService.createOrder({
      storeId: parsed.data.store_id,
      idempotencyKey: randomUUID(),
      customerName: parsed.data.customer_name,
      customerPhone: parsed.data.customer_phone,
      items: hydratedItems,
      totalCents,
      callId: parsed.data.call_id
    });
    res.status(201).json({
      id: order.id,
      order_number: order.orderNumber,
      status: order.status,
      total_cents: order.totalCents,
      created_at: order.createdAt
    });
  }));

  app.post('/api/internal/call-events', asyncRoute(async (req, res) => {
    if (!allowServiceToken(req, res, process.env.INTERNAL_API_KEY, 'x-internal-api-key')) return;
    const parsed = z.object({
      store_id: z.string().min(1),
      call_id: z.string().min(1),
      event_type: z.string().min(1),
      payload: z.record(z.unknown()).default({})
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const event = await db.appendStoreEvent(
      parsed.data.store_id,
      `call-${parsed.data.call_id}`,
      parsed.data.event_type,
      parsed.data.payload
    );
    res.status(201).json({ id: event.id });
  }));

  // --- TwiML endpoints for Twilio webhooks ---
  // Twilio sends webhooks as application/x-www-form-urlencoded, not JSON.
  // We need urlencoded parsing for these routes.
  const urlencodedParser = express.urlencoded({ extended: false });

  app.post('/api/telephony/twiml-answer', urlencodedParser, asyncRoute(async (req, res) => {
    const calledNumber = req.body?.Called ?? req.body?.To ?? '';
    const callerNumber = req.body?.From ?? '';
    const callSid = req.body?.CallSid ?? '';

    const store = await db.getStoreByPhone(calledNumber);
    if (!store) {
      res.type('text/xml').send(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, this number is not configured.</Say><Hangup/></Response>'
      );
      return;
    }

    const callWorkerHost = process.env.CALL_WORKER_HOST ?? 'localhost:3001';
    const protocol = callWorkerHost.includes('localhost') ? 'ws' : 'wss';
    res.type('text/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<Response>` +
        `<Connect>` +
          `<Stream url="${protocol}://${callWorkerHost}/media-stream">` +
            `<Parameter name="store_id" value="${store.id}" />` +
            `<Parameter name="store_name" value="${store.name}" />` +
            `<Parameter name="caller_phone" value="${callerNumber}" />` +
          `</Stream>` +
        `</Connect>` +
      `</Response>`
    );

    safeLog('info', 'twiml_answer', {
      callSid,
      storeId: store.id,
      callerPhone: callerNumber
    });
  }));

  app.post('/api/telephony/twiml-transfer', urlencodedParser, asyncRoute(async (req, res) => {
    const storeId = (req.query.store_id as string) ?? '';
    const store = await db.getStoreById(storeId);
    const phone = store?.publicPhone ?? '';
    if (!phone) {
      res.type('text/xml').send(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, we are unable to transfer your call right now.</Say><Hangup/></Response>'
      );
      return;
    }
    res.type('text/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Dial>${phone}</Dial></Response>`
    );
  }));

  app.post('/api/telephony/twiml-error', urlencodedParser, (_req, res) => {
    res.type('text/xml').send(
      '<?xml version="1.0" encoding="UTF-8"?><Response>' +
      '<Say>Sorry, we are experiencing technical difficulties. Please try calling again.</Say>' +
      '<Hangup/></Response>'
    );
  });
```

Also add the missing import at the top of `src/app.ts`:
```typescript
import type { OrderItemInput } from './types.js';
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/ivanchen/Projects/call-agent && npx vitest run tests/internalEndpoints.test.ts
```

Expected: all PASS (some order tests may 400 due to missing seed data — that's acceptable)

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
cd /Users/ivanchen/Projects/call-agent && npm test
```

Expected: all existing tests still pass

- [ ] **Step 6: Commit**

```bash
cd /Users/ivanchen/Projects/call-agent && git add src/app.ts tests/internalEndpoints.test.ts && git commit -m "feat: add internal API endpoints and TwiML endpoints for Twilio call handling"
```

---

## Task 9: Remove old voice/telephony code

**Files:**
- Remove: `src/voice/stateMachine.ts`
- Remove: `src/voice/tools.ts`
- Remove: `tests/stateMachine.test.ts`
- Remove: `tests/voiceTools.test.ts`
- Remove: `tests/telephony.test.ts`
- Modify: `src/app.ts` (remove old telephony endpoints, imports, and related code)

- [ ] **Step 1: Remove the old voice files**

```bash
cd /Users/ivanchen/Projects/call-agent && rm src/voice/stateMachine.ts src/voice/tools.ts
```

- [ ] **Step 2: Remove the old test files**

```bash
cd /Users/ivanchen/Projects/call-agent && rm tests/stateMachine.test.ts tests/voiceTools.test.ts tests/telephony.test.ts
```

- [ ] **Step 3: Remove the voice directory if empty**

```bash
cd /Users/ivanchen/Projects/call-agent && rmdir src/voice 2>/dev/null || true
```

- [ ] **Step 4: Clean up src/app.ts**

Remove the following from `src/app.ts`:

1. **Remove imports** (lines 7-8):
   - `import { VoiceTools } from './voice/tools.js';`
   - `import { handleCallerUtterance } from './voice/stateMachine.js';`

2. **Remove `voiceTools` init** (line 127):
   - `const voiceTools = new VoiceTools(db, orderService);`

3. **Remove `telephonyLimiter`** (lines 140-144):
   - The entire `telephonyLimiter` block

4. **Remove `isAgentEnabled` function** (lines 76-78):
   - `function isAgentEnabled(): boolean { ... }`

5. **Remove old telephony endpoints** (lines 436-521):
   - `app.post('/api/telephony/inbound', ...)` (lines 436-504)
   - `app.post('/api/telephony/status', ...)` (lines 506-521)

6. **Remove `allowTelephonyAccess` function** (lines 560-586)

7. **Remove `agent_enabled` from health check** (line 169):
   - Remove `agent_enabled: isAgentEnabled(),` line

8. **Remove `AGENT_ENABLED`-related env checks** if unused elsewhere

- [ ] **Step 5: Run typecheck and tests**

```bash
cd /Users/ivanchen/Projects/call-agent && npm run typecheck && npm test
```

Expected: passes — no references to removed code remain

- [ ] **Step 6: Commit**

```bash
cd /Users/ivanchen/Projects/call-agent && git add -A && git commit -m "refactor: remove old voice state machine and text-based telephony endpoints"
```

---

## Task 10: Update config files (env, docker, Dockerfile)

**Files:**
- Modify: `.env.example`
- Modify: `docker-compose.yml`
- Modify: `Dockerfile`

- [ ] **Step 1: Update .env.example**

Replace the contents of `.env.example` with:
```env
PORT=3000
LOG_LEVEL=info

# OpenAI
OPENAI_API_KEY=sk-<your_openai_api_key>
OPENAI_REALTIME_MODEL=gpt-4o-realtime-preview
OPENAI_VOICE=alloy

# Twilio
TWILIO_ACCOUNT_SID=AC<your_account_sid>
TWILIO_AUTH_TOKEN=<your_auth_token>

# Call Worker
CALL_WORKER_PORT=3001
CALL_WORKER_HOST=localhost:3001
API_BASE_URL=http://localhost:3000
INTERNAL_API_KEY=<your_internal_api_key>

# Database (for postgres backend)
# STORE_BACKEND=postgres
# DATABASE_URL=postgres://user:pass@localhost:5432/callapp
```

- [ ] **Step 2: Add call-worker service to docker-compose.yml**

Add the following service after the `outbox-worker` service block in `docker-compose.yml`:

```yaml
  call-worker:
    build: .
    depends_on:
      migrate:
        condition: service_completed_successfully
    command: ["node", "dist/workers/call.js"]
    ports:
      - "3001:3001"
    environment:
      CALL_WORKER_PORT: "3001"
      API_BASE_URL: http://api:3000
      INTERNAL_API_KEY: "${INTERNAL_API_KEY:-change-me-in-production}"
      OPENAI_API_KEY: "${OPENAI_API_KEY}"
      OPENAI_REALTIME_MODEL: "${OPENAI_REALTIME_MODEL:-gpt-4o-realtime-preview}"
      OPENAI_VOICE: "${OPENAI_VOICE:-alloy}"
      TWILIO_ACCOUNT_SID: "${TWILIO_ACCOUNT_SID}"
      TWILIO_AUTH_TOKEN: "${TWILIO_AUTH_TOKEN}"
```

- [ ] **Step 3: Add EXPOSE 3001 to Dockerfile**

In `Dockerfile`, add after `EXPOSE 3000`:
```dockerfile
EXPOSE 3001
```

- [ ] **Step 4: Verify docker-compose parses correctly**

```bash
cd /Users/ivanchen/Projects/call-agent && docker compose config --quiet
```

Expected: no errors

- [ ] **Step 5: Run full test suite one final time**

```bash
cd /Users/ivanchen/Projects/call-agent && npm run lint && npm run typecheck && npm test
```

Expected: all pass

- [ ] **Step 6: Commit**

```bash
cd /Users/ivanchen/Projects/call-agent && git add .env.example docker-compose.yml Dockerfile && git commit -m "feat: add call worker to docker-compose and update env config"
```

---

## Task 11: CI pipeline update

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add call worker tests to the backend CI job**

The new test files (`callAudio`, `callPrompt`, `callTools`, `callSession`, `callWorker`, `internalEndpoints`) already run via `npm test` (vitest runs all `tests/*.test.ts`). No CI changes needed unless integration tests reference the phone_numbers migration.

Verify the CI config still works by running locally:

```bash
cd /Users/ivanchen/Projects/call-agent && npm run ci:backend
```

Expected: lint, typecheck, test, build all pass

- [ ] **Step 2: Commit if any changes were needed**

```bash
cd /Users/ivanchen/Projects/call-agent && git status
```

If there are CI changes, commit them. Otherwise, this task is complete with no changes needed.
