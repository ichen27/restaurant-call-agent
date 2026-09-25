import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

function buildOrderBody() {
  return {
    store_id: 'store-1',
    customer_name: 'Test User',
    customer_phone: '+15551234567',
    items: [
      {
        item_id: 'item-burrito',
        item_name_snapshot: 'Chicken Burrito',
        qty: 1,
        base_price_cents: 1299,
        modifiers_snapshot_json: [],
        line_total_cents: 1299
      }
    ],
    total_cents: 1299
  };
}

describe('orders API', () => {
  const backupEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...backupEnv };
  });

  it('enforces idempotency key behavior', async () => {
    const { app } = createApp();

    const first = await request(app)
      .post('/api/orders')
      .set('Idempotency-Key', 'same-key')
      .send(buildOrderBody())
      .expect(201);

    const second = await request(app)
      .post('/api/orders')
      .set('Idempotency-Key', 'same-key')
      .send(buildOrderBody())
      .expect(201);

    expect(first.body.id).toBe(second.body.id);
    expect(first.body.order_number).toBe(second.body.order_number);
  });

  it('rejects invalid transition', async () => {
    const { app } = createApp();
    const created = await request(app)
      .post('/api/orders')
      .set('Idempotency-Key', 'status-key')
      .send(buildOrderBody())
      .expect(201);

    await request(app)
      .patch(`/api/orders/${created.body.id}`)
      .send({ status: 'READY' })
      .expect(400);
  });

  it('blocks order creation when ORDER_INTAKE_ENABLED is false', async () => {
    process.env.ORDER_INTAKE_ENABLED = 'false';
    const { app } = createApp();

    await request(app)
      .post('/api/orders')
      .set('Idempotency-Key', 'intake-disabled')
      .send(buildOrderBody())
      .expect(503);
  });

});
