import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/store/memory.js';
import type { OrderItemInput } from '../src/types.js';

const BURRITO_ITEM: OrderItemInput = {
  itemId: 'item-burrito',
  itemNameSnapshot: 'Chicken Burrito',
  qty: 1,
  basePriceCents: 1299,
  modifiersSnapshotJson: [],
  lineTotalCents: 1299
};

function makeOrderInput(overrides: Partial<{ storeId: string; idempotencyKey: string; customerName: string }> = {}) {
  return {
    storeId: overrides.storeId ?? 'store-1',
    idempotencyKey: overrides.idempotencyKey ?? `key-${Math.random()}`,
    customerName: overrides.customerName ?? 'Test Customer',
    customerPhone: '+15550000000',
    items: [BURRITO_ITEM],
    totalCents: 1299
  };
}

describe('MemoryStore', () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  // --- Store ---
  describe('getStoreById', () => {
    it('returns seeded store', async () => {
      const s = await store.getStoreById('store-1');
      expect(s).toBeDefined();
      expect(s!.name).toBe('Downtown');
    });

    it('returns undefined for unknown store', async () => {
      expect(await store.getStoreById('store-999')).toBeUndefined();
    });
  });

  // --- Menu ---
  describe('getMenu', () => {
    it('returns menu items for seeded store', async () => {
      const menu = await store.getMenu('store-1');
      expect(menu.length).toBe(2);
    });

    it('returns empty for unknown store', async () => {
      expect(await store.getMenu('store-999')).toEqual([]);
    });
  });

  describe('setItemAvailability', () => {
    it('toggles item to unavailable', async () => {
      const item = await store.setItemAvailability('item-burrito', false);
      expect(item!.isAvailable).toBe(false);
    });

    it('toggles item back to available', async () => {
      await store.setItemAvailability('item-burrito', false);
      const item = await store.setItemAvailability('item-burrito', true);
      expect(item!.isAvailable).toBe(true);
    });

    it('returns undefined for unknown item', async () => {
      expect(await store.setItemAvailability('fake-id', true)).toBeUndefined();
    });
  });

  describe('setStoreMode', () => {
    it('sets store mode to BUSY', async () => {
      expect(await store.setStoreMode('store-1', 'BUSY')).toBe('BUSY');
    });

    it('sets store mode to CLOSED', async () => {
      expect(await store.setStoreMode('store-1', 'CLOSED')).toBe('CLOSED');
    });

    it('returns undefined for unknown store', async () => {
      expect(await store.setStoreMode('fake', 'OPEN')).toBeUndefined();
    });
  });

  // --- Orders ---
  describe('createOrder', () => {
    it('creates order with correct fields', async () => {
      const order = await store.createOrder(makeOrderInput({ idempotencyKey: 'co-1' }));
      expect(order.status).toBe('NEW');
      expect(order.orderNumber).toBeGreaterThanOrEqual(1000);
      expect(order.storeId).toBe('store-1');
    });

    it('returns same order for duplicate idempotencyKey', async () => {
      const input = makeOrderInput({ idempotencyKey: 'dup-1' });
      const first = await store.createOrder(input);
      const second = await store.createOrder(input);
      expect(first.id).toBe(second.id);
    });

    it('auto-increments order numbers', async () => {
      const a = await store.createOrder(makeOrderInput({ idempotencyKey: 'inc-1' }));
      const b = await store.createOrder(makeOrderInput({ idempotencyKey: 'inc-2' }));
      expect(b.orderNumber).toBe(a.orderNumber + 1);
    });
  });

  // --- Status transitions ---
  describe('updateOrderStatus', () => {
    it('transitions NEW → ACCEPTED', async () => {
      const order = await store.createOrder(makeOrderInput({ idempotencyKey: 'tr-1' }));
      const updated = await store.updateOrderStatus(order.id, 'ACCEPTED', 'actor');
      expect(updated.status).toBe('ACCEPTED');
    });

    it('transitions ACCEPTED → IN_PROGRESS', async () => {
      const order = await store.createOrder(makeOrderInput({ idempotencyKey: 'tr-2' }));
      await store.updateOrderStatus(order.id, 'ACCEPTED', 'actor');
      const updated = await store.updateOrderStatus(order.id, 'IN_PROGRESS', 'actor');
      expect(updated.status).toBe('IN_PROGRESS');
    });

    it('transitions IN_PROGRESS → READY', async () => {
      const order = await store.createOrder(makeOrderInput({ idempotencyKey: 'tr-3' }));
      await store.updateOrderStatus(order.id, 'ACCEPTED', 'actor');
      await store.updateOrderStatus(order.id, 'IN_PROGRESS', 'actor');
      const updated = await store.updateOrderStatus(order.id, 'READY', 'actor');
      expect(updated.status).toBe('READY');
    });

    it('transitions READY → COMPLETED', async () => {
      const order = await store.createOrder(makeOrderInput({ idempotencyKey: 'tr-4' }));
      await store.updateOrderStatus(order.id, 'ACCEPTED', 'actor');
      await store.updateOrderStatus(order.id, 'IN_PROGRESS', 'actor');
      await store.updateOrderStatus(order.id, 'READY', 'actor');
      const updated = await store.updateOrderStatus(order.id, 'COMPLETED', 'actor');
      expect(updated.status).toBe('COMPLETED');
    });

    it('rejects invalid transition NEW → COMPLETED', async () => {
      const order = await store.createOrder(makeOrderInput({ idempotencyKey: 'tr-5' }));
      await expect(store.updateOrderStatus(order.id, 'COMPLETED', 'actor')).rejects.toThrow('invalid transition');
    });

    it('rejects transition from terminal state COMPLETED → NEW', async () => {
      const order = await store.createOrder(makeOrderInput({ idempotencyKey: 'tr-6' }));
      await store.updateOrderStatus(order.id, 'ACCEPTED', 'actor');
      await store.updateOrderStatus(order.id, 'IN_PROGRESS', 'actor');
      await store.updateOrderStatus(order.id, 'READY', 'actor');
      await store.updateOrderStatus(order.id, 'COMPLETED', 'actor');
      await expect(store.updateOrderStatus(order.id, 'NEW' as never, 'actor')).rejects.toThrow('invalid transition');
    });

    it('REJECTED requires rejectReason', async () => {
      const order = await store.createOrder(makeOrderInput({ idempotencyKey: 'tr-7' }));
      await expect(store.updateOrderStatus(order.id, 'REJECTED', 'actor')).rejects.toThrow('reject reason required');
    });

    it('REJECTED with reason succeeds', async () => {
      const order = await store.createOrder(makeOrderInput({ idempotencyKey: 'tr-8' }));
      const updated = await store.updateOrderStatus(order.id, 'REJECTED', 'actor', { rejectReason: 'out of stock' });
      expect(updated.status).toBe('REJECTED');
      expect(updated.rejectReason).toBe('out of stock');
    });

    it('CANCELED from NEW', async () => {
      const order = await store.createOrder(makeOrderInput({ idempotencyKey: 'c-1' }));
      const updated = await store.updateOrderStatus(order.id, 'CANCELED', 'actor');
      expect(updated.status).toBe('CANCELED');
    });

    it('CANCELED from ACCEPTED', async () => {
      const order = await store.createOrder(makeOrderInput({ idempotencyKey: 'c-2' }));
      await store.updateOrderStatus(order.id, 'ACCEPTED', 'actor');
      const updated = await store.updateOrderStatus(order.id, 'CANCELED', 'actor');
      expect(updated.status).toBe('CANCELED');
    });

    it('CANCELED from IN_PROGRESS', async () => {
      const order = await store.createOrder(makeOrderInput({ idempotencyKey: 'c-3' }));
      await store.updateOrderStatus(order.id, 'ACCEPTED', 'actor');
      await store.updateOrderStatus(order.id, 'IN_PROGRESS', 'actor');
      const updated = await store.updateOrderStatus(order.id, 'CANCELED', 'actor');
      expect(updated.status).toBe('CANCELED');
    });

    it('CANCELED from READY', async () => {
      const order = await store.createOrder(makeOrderInput({ idempotencyKey: 'c-4' }));
      await store.updateOrderStatus(order.id, 'ACCEPTED', 'actor');
      await store.updateOrderStatus(order.id, 'IN_PROGRESS', 'actor');
      await store.updateOrderStatus(order.id, 'READY', 'actor');
      const updated = await store.updateOrderStatus(order.id, 'CANCELED', 'actor');
      expect(updated.status).toBe('CANCELED');
    });
  });

  // --- listOrders ---
  describe('listOrders', () => {
    it('filters by storeId', async () => {
      await store.createOrder(makeOrderInput({ idempotencyKey: 'lo-1' }));
      const orders = await store.listOrders('store-1');
      expect(orders.length).toBeGreaterThanOrEqual(1);
      expect(orders.every((o) => o.storeId === 'store-1')).toBe(true);
    });

    it('filters by status', async () => {
      await store.createOrder(makeOrderInput({ idempotencyKey: 'lo-2' }));
      const orders = await store.listOrders('store-1', ['NEW']);
      expect(orders.every((o) => o.status === 'NEW')).toBe(true);
    });

    it('filters by multiple statuses', async () => {
      const order = await store.createOrder(makeOrderInput({ idempotencyKey: 'lo-3' }));
      await store.updateOrderStatus(order.id, 'ACCEPTED', 'actor');
      await store.createOrder(makeOrderInput({ idempotencyKey: 'lo-4' }));
      const orders = await store.listOrders('store-1', ['NEW', 'ACCEPTED']);
      expect(orders.length).toBeGreaterThanOrEqual(2);
    });
  });

  // --- getOrderById ---
  describe('getOrderById', () => {
    it('returns existing order', async () => {
      const order = await store.createOrder(makeOrderInput({ idempotencyKey: 'go-1' }));
      expect(await store.getOrderById(order.id)).toBeDefined();
    });

    it('returns undefined for non-existent order', async () => {
      expect(await store.getOrderById('fake-id')).toBeUndefined();
    });
  });

  // --- ackOrder ---
  describe('ackOrder', () => {
    it('first ack returns true', async () => {
      const order = await store.createOrder(makeOrderInput({ idempotencyKey: 'ack-1' }));
      const result = await store.ackOrder(order.id, 'client-1');
      expect(result).toBe(true);
    });

    it('duplicate ack still returns true but does not duplicate', async () => {
      const order = await store.createOrder(makeOrderInput({ idempotencyKey: 'ack-2' }));
      await store.ackOrder(order.id, 'client-1');
      const result = await store.ackOrder(order.id, 'client-1');
      expect(result).toBe(true);
      const fetched = await store.getOrderById(order.id);
      expect(fetched!.ackedClientIds.filter((id) => id === 'client-1')).toHaveLength(1);
    });
  });

  // --- Events ---
  describe('getEventsSince', () => {
    it('returns all events since id 0', async () => {
      await store.createOrder(makeOrderInput({ idempotencyKey: 'ev-1' }));
      const events = await store.getEventsSince('store-1', 0);
      expect(events.length).toBeGreaterThanOrEqual(1);
    });

    it('filters events by sinceId', async () => {
      await store.createOrder(makeOrderInput({ idempotencyKey: 'ev-2' }));
      await store.createOrder(makeOrderInput({ idempotencyKey: 'ev-3' }));
      const all = await store.getEventsSince('store-1', 0);
      const after = await store.getEventsSince('store-1', all[0]!.id);
      expect(after.length).toBe(all.length - 1);
    });
  });

  // --- Call sessions ---
  describe('call sessions', () => {
    it('upserts and retrieves call session', async () => {
      const session = {
        callId: 'call-1',
        storeId: 'store-1',
        state: 'GREETING',
        callerPhone: '+15550000000',
        draftItems: [],
        handoff: false
      };
      await store.setCallSession(session);
      const fetched = await store.getCallSession('call-1');
      expect(fetched!.callId).toBe('call-1');
    });

    it('updates existing call session', async () => {
      const session = {
        callId: 'call-2',
        storeId: 'store-1',
        state: 'GREETING',
        callerPhone: '+15550000000',
        draftItems: [],
        handoff: false
      };
      await store.setCallSession(session);
      session.state = 'INTENT';
      await store.setCallSession(session);
      const fetched = await store.getCallSession('call-2');
      expect(fetched!.state).toBe('INTENT');
    });

    it('returns undefined for missing call session', async () => {
      expect(await store.getCallSession('fake-call')).toBeUndefined();
    });
  });

  // --- Auth users ---
  describe('getAuthUserByEmail', () => {
    it('finds user case-insensitively', async () => {
      const user = await store.getAuthUserByEmail('store-1', 'STAFF@STORE.TEST');
      expect(user).toBeDefined();
      expect(user!.email).toBe('staff@store.test');
    });

    it('returns undefined for missing user', async () => {
      expect(await store.getAuthUserByEmail('store-1', 'nobody@test.com')).toBeUndefined();
    });
  });
});
