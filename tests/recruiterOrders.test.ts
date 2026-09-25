import request from 'supertest';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const env = { ...process.env };
beforeEach(() => {
  process.env = { ...env, NODE_ENV: 'test', INTERNAL_API_KEY: 'test-internal' };
});
afterEach(() => {
  process.env = { ...env };
});

it('retries the same voice call without creating a duplicate order or event', async () => {
  const { app, db } = createApp();
  const body = {
    store_id: 'store-1',
    call_id: 'CA-retry',
    customer_name: 'Casey',
    customer_phone: '+15555550100',
    items: [{ item_id: 'item-burrito', qty: 2 }]
  };
  const first = await request(app)
    .post('/api/internal/orders')
    .set('x-internal-api-key', 'test-internal')
    .send(body)
    .expect(201);
  const retry = await request(app)
    .post('/api/internal/orders')
    .set('x-internal-api-key', 'test-internal')
    .send(body)
    .expect(201);
  expect(retry.body.id).toBe(first.body.id);
  expect(retry.body.total_cents).toBe(2598);
  expect(await db.listOrders('store-1')).toHaveLength(1);
  expect(await db.getEventsForOrder(first.body.id)).toHaveLength(1);
});

it('rejects unavailable items without creating an order', async () => {
  const { app, db } = createApp();
  await db.setItemAvailability('item-burrito', false);
  const res = await request(app)
    .post('/api/internal/orders')
    .set('x-internal-api-key', 'test-internal')
    .send({
      store_id: 'store-1',
      call_id: 'CA-no-stock',
      customer_name: 'Casey',
      customer_phone: '+15555550100',
      items: [{ item_id: 'item-burrito', qty: 1 }]
    });
  expect(res.status).toBe(400);
  expect(res.body.error.code).toBe('ITEM_UNAVAILABLE');
  expect(await db.listOrders('store-1')).toHaveLength(0);
});

it('returns an accepted voice order even if availability changes before a retry', async () => {
  const { app, db } = createApp();
  const body = {
    store_id: 'store-1',
    call_id: 'CA-stock-retry',
    customer_name: 'Casey',
    customer_phone: '+15555550100',
    items: [{ item_id: 'item-burrito', qty: 1 }]
  };
  const first = await request(app)
    .post('/api/internal/orders')
    .set('x-internal-api-key', 'test-internal')
    .send(body)
    .expect(201);
  await db.setItemAvailability('item-burrito', false);
  const retry = await request(app)
    .post('/api/internal/orders')
    .set('x-internal-api-key', 'test-internal')
    .send(body)
    .expect(201);
  expect(retry.body.id).toBe(first.body.id);
  await request(app)
    .post('/api/internal/orders')
    .set('x-internal-api-key', 'test-internal')
    .send({ ...body, call_id: 'CA-new-call' })
    .expect(400);
});
