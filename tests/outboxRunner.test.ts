import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/store/memory.js';
import { computeBackoffDelayMs, processOutboxBatch } from '../src/workers/outboxRunner.js';
import type { OutboxEvent } from '../src/types.js';

class TestPublisher {
  constructor(private readonly failEventTypes = new Set<string>()) {}

  async publish(event: OutboxEvent): Promise<void> {
    if (this.failEventTypes.has(event.eventType)) {
      throw new Error('publish failed');
    }
  }
}

describe('outbox runner', () => {
  it('computes bounded exponential backoff', () => {
    expect(computeBackoffDelayMs(1, 1000, 60000)).toBe(1000);
    expect(computeBackoffDelayMs(2, 1000, 60000)).toBe(2000);
    expect(computeBackoffDelayMs(10, 1000, 5000)).toBe(5000);
  });

  it('computeBackoffDelayMs attempt 0 clamps exponent', () => {
    // attempts=0 → exponent = max(0, -1) = 0 → baseDelayMs * 1
    expect(computeBackoffDelayMs(0, 1000, 60000)).toBe(1000);
  });

  it('computeBackoffDelayMs very large attempt caps at max', () => {
    expect(computeBackoffDelayMs(100, 1000, 60000)).toBe(60000);
  });

  it('computeBackoffDelayMs zero base returns 0', () => {
    expect(computeBackoffDelayMs(5, 0, 60000)).toBe(0);
  });

  it('processOutboxBatch empty batch returns all zeros', async () => {
    const store = new MemoryStore();
    const result = await processOutboxBatch(store, new TestPublisher(), {
      batchLimit: 10,
      maxAttempts: 3,
      baseDelayMs: 1000,
      maxDelayMs: 60000,
      now: () => new Date('2026-02-22T00:00:00.000Z')
    });
    expect(result).toEqual({ selected: 0, sent: 0, failed: 0, deadLettered: 0 });
  });

  it('marks success as sent', async () => {
    const store = new MemoryStore();
    await store.createOrder({
      storeId: 'store-1',
      idempotencyKey: 'runner-1',
      customerName: 'A',
      customerPhone: '+15550000000',
      items: [
        {
          itemId: 'item-burrito',
          itemNameSnapshot: 'Chicken Burrito',
          qty: 1,
          basePriceCents: 1299,
          modifiersSnapshotJson: [],
          lineTotalCents: 1299
        }
      ],
      totalCents: 1299
    });

    const result = await processOutboxBatch(store, new TestPublisher(), {
      batchLimit: 10,
      maxAttempts: 3,
      baseDelayMs: 1000,
      maxDelayMs: 60000,
      now: () => new Date('2026-02-22T00:00:00.000Z')
    });

    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.deadLettered).toBe(0);
    const sent = await store.listOutbox('store-1', 'SENT');
    expect(sent).toHaveLength(1);
  });

  it('retries then dead-letters when max attempts is reached', async () => {
    const store = new MemoryStore();
    await store.createOrder({
      storeId: 'store-1',
      idempotencyKey: 'runner-2',
      customerName: 'B',
      customerPhone: '+15550000001',
      items: [
        {
          itemId: 'item-burrito',
          itemNameSnapshot: 'Chicken Burrito',
          qty: 1,
          basePriceCents: 1299,
          modifiersSnapshotJson: [],
          lineTotalCents: 1299
        }
      ],
      totalCents: 1299
    });

    // mutate only event type so publisher can deterministically fail this event
    const pending = await store.listOutbox('store-1', 'PENDING');
    const first = pending[0];
    if (!first) {
      throw new Error('expected pending event');
    }
    first.eventType = 'ForceFail';

    const publisher = new TestPublisher(new Set(['ForceFail']));
    const fixedNow = () => new Date('2026-02-22T00:00:00.000Z');

    const firstRun = await processOutboxBatch(store, publisher, {
      batchLimit: 10,
      maxAttempts: 2,
      baseDelayMs: 1000,
      maxDelayMs: 60000,
      now: fixedNow
    });

    expect(firstRun.failed).toBe(1);
    expect(firstRun.deadLettered).toBe(0);

    // make event due immediately for second attempt
    const failed = await store.listOutbox('store-1', 'FAILED');
    expect(failed).toHaveLength(1);
    failed[0]!.nextAttemptAt = '2026-02-21T23:59:59.000Z';

    const secondRun = await processOutboxBatch(store, publisher, {
      batchLimit: 10,
      maxAttempts: 2,
      baseDelayMs: 1000,
      maxDelayMs: 60000,
      now: fixedNow
    });

    expect(secondRun.deadLettered).toBe(1);
    const dead = await store.listOutbox('store-1', 'DEAD_LETTER');
    expect(dead).toHaveLength(1);
  });
});
