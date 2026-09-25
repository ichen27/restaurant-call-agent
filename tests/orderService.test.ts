import { describe, expect, it, vi } from 'vitest';
import { OrderService } from '../src/orderService.js';
import type { AppRepository } from '../src/store/repository.js';

function mockRepository(): AppRepository {
  return {
    createOrder: vi.fn(async () => ({
      id: 'order-1',
      orderNumber: 1000,
      storeId: 'store-1',
      status: 'NEW' as const,
      customerName: 'Test',
      customerPhone: '+15550000000',
      items: [],
      totalCents: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ackedClientIds: []
    })),
    updateOrderStatus: vi.fn(async () => ({
      id: 'order-1',
      orderNumber: 1000,
      storeId: 'store-1',
      status: 'ACCEPTED' as const,
      customerName: 'Test',
      customerPhone: '+15550000000',
      items: [],
      totalCents: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ackedClientIds: []
    })),
    ackOrder: vi.fn(async () => true)
  } as unknown as AppRepository;
}

describe('OrderService', () => {
  it('createOrder delegates to db.createOrder', async () => {
    const db = mockRepository();
    const svc = new OrderService(db);
    const cmd = {
      storeId: 'store-1',
      idempotencyKey: 'key-1',
      customerName: 'Test',
      customerPhone: '+15550000000',
      items: [],
      totalCents: 0
    };
    await svc.createOrder(cmd);
    expect(db.createOrder).toHaveBeenCalledWith(cmd);
  });

  it('updateStatus delegates to db.updateOrderStatus', async () => {
    const db = mockRepository();
    const svc = new OrderService(db);
    await svc.updateStatus('order-1', 'ACCEPTED', 'actor-1');
    expect(db.updateOrderStatus).toHaveBeenCalledWith('order-1', 'ACCEPTED', 'actor-1', undefined);
  });

  it('ackOrder delegates to db.ackOrder', async () => {
    const db = mockRepository();
    const svc = new OrderService(db);
    await svc.ackOrder('order-1', 'client-1');
    expect(db.ackOrder).toHaveBeenCalledWith('order-1', 'client-1');
  });
});
