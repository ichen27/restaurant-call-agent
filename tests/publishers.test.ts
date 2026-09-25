import { afterEach, describe, expect, it, vi } from 'vitest';
import { __testing, createOutboxPublisher } from '../src/workers/publishers.js';
import type { OutboxEvent } from '../src/types.js';

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

function sampleEvent(type = 'OrderCreated'): OutboxEvent {
  return {
    id: 1,
    storeId: 'store-1',
    aggregateType: 'ORDER',
    aggregateId: 'order-1',
    eventType: type,
    payload: { orderId: 'order-1' },
    status: 'PENDING',
    attempts: 0,
    createdAt: '2026-02-22T00:00:00.000Z',
    nextAttemptAt: '2026-02-22T00:00:00.000Z'
  };
}

afterEach(() => {
  process.env = { ...originalEnv };
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('outbox publisher factory', () => {
  it('builds a payload envelope with metadata', () => {
    const payload = __testing.toPublishPayload(sampleEvent());
    expect(payload.kind).toBe('outbox_publish');
    expect(payload.event_id).toBe(1);
    expect(payload.aggregate_type).toBe('ORDER');
  });

  it('uses webhook transport when configured', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 202 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    process.env.OUTBOX_PUBLISH_TRANSPORT = 'webhook';
    process.env.OUTBOX_WEBHOOK_URL = 'https://example.test/outbox';
    process.env.OUTBOX_WEBHOOK_AUTH_BEARER = 'secret-token';

    const publisher = createOutboxPublisher();
    await publisher.publish(sampleEvent());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstCall = fetchMock.mock.calls[0] as unknown[] | undefined;
    if (!firstCall) {
      throw new Error('expected fetch call');
    }
    expect(firstCall[0]).toBe('https://example.test/outbox');
    const init = firstCall[1] as RequestInit | undefined;
    expect(init?.method).toBe('POST');
    const headers = init?.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer secret-token');
  });

  it('throws when webhook transport is missing a url', () => {
    process.env.OUTBOX_PUBLISH_TRANSPORT = 'webhook';
    delete process.env.OUTBOX_WEBHOOK_URL;
    expect(() => createOutboxPublisher()).toThrow(/OUTBOX_WEBHOOK_URL/);
  });

  it('treats non-2xx webhook responses as publish failures', async () => {
    globalThis.fetch = vi.fn(async () => new Response('bad', { status: 500, statusText: 'Internal Error' })) as typeof fetch;

    process.env.OUTBOX_PUBLISH_TRANSPORT = 'webhook';
    process.env.OUTBOX_WEBHOOK_URL = 'https://example.test/outbox';

    const publisher = createOutboxPublisher();
    await expect(publisher.publish(sampleEvent())).rejects.toThrow(/webhook publish failed/);
  });

  it('supports deterministic failure simulation in stdout mode', async () => {
    process.env.OUTBOX_PUBLISH_TRANSPORT = 'stdout';
    process.env.OUTBOX_FAIL_EVENT_TYPE = 'OrderCreated';
    const publisher = createOutboxPublisher();
    await expect(publisher.publish(sampleEvent())).rejects.toThrow(/simulated publish failure/);
  });

  it('defaults to stdout transport', () => {
    delete process.env.OUTBOX_PUBLISH_TRANSPORT;
    const publisher = createOutboxPublisher();
    // StdoutPublisher is the default — verify it doesn't throw
    expect(publisher).toBeDefined();
  });

  it('webhook publisher timeout aborts', async () => {
    // Simulate a fetch that never resolves by aborting
    globalThis.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      // Wait until signal aborts
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    }) as typeof fetch;

    process.env.OUTBOX_PUBLISH_TRANSPORT = 'webhook';
    process.env.OUTBOX_WEBHOOK_URL = 'https://example.test/outbox';
    process.env.OUTBOX_WEBHOOK_TIMEOUT_MS = '1'; // 1ms timeout

    const publisher = createOutboxPublisher();
    await expect(publisher.publish(sampleEvent())).rejects.toThrow(/timed out/);
  });

  it('realtime gateway publisher sends internal key header', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    process.env.OUTBOX_PUBLISH_TRANSPORT = 'ws';
    process.env.OUTBOX_REALTIME_PUBLISH_URL = 'http://localhost:3000/api/internal/realtime/publish';
    process.env.INTERNAL_API_KEY = 'my-internal-key';

    const publisher = createOutboxPublisher();
    await publisher.publish(sampleEvent());

    const firstCall = fetchMock.mock.calls[0] as unknown[] | undefined;
    const init = firstCall?.[1] as RequestInit | undefined;
    const headers = init?.headers as Record<string, string>;
    expect(headers['x-internal-api-key']).toBe('my-internal-key');
  });

  it('uses realtime ws transport endpoint when configured', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    process.env.OUTBOX_PUBLISH_TRANSPORT = 'ws';
    process.env.OUTBOX_REALTIME_PUBLISH_URL = 'http://localhost:3000/api/internal/realtime/publish';
    process.env.INTERNAL_API_KEY = 'internal-secret';

    const publisher = createOutboxPublisher();
    await publisher.publish(sampleEvent());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstCall = fetchMock.mock.calls[0] as unknown[] | undefined;
    if (!firstCall) {
      throw new Error('expected fetch call');
    }
    expect(firstCall[0]).toBe('http://localhost:3000/api/internal/realtime/publish');
    const init = firstCall[1] as RequestInit | undefined;
    const headers = init?.headers as Record<string, string>;
    expect(headers['x-internal-api-key']).toBe('internal-secret');
  });
});
