import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/auth/password.js';

const databaseUrl = process.env.DATABASE_URL;
const hasDb = Boolean(databaseUrl);
const describeIfDb = hasDb ? describe : describe.skip;
const envBackup = { ...process.env };

describeIfDb('Postgres API integration', () => {
  const pool = new Pool({ connectionString: databaseUrl });

  beforeAll(async () => {
    const migrationsDir = join(fileURLToPath(new URL('.', import.meta.url)), '../migrations');
    const files = readdirSync(migrationsDir)
      .filter((name) => name.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      await pool.query(sql);
    }
  });

  beforeEach(async () => {
    process.env = { ...envBackup };
    process.env.STORE_BACKEND = 'postgres';
    process.env.DATABASE_URL = databaseUrl;
    process.env.AUTH_REQUIRED = 'true';
    process.env.JWT_SECRET = 'postgres-api-test-secret';
    await pool.query('TRUNCATE TABLE idempotency_keys, order_items, order_events, outbox_events, orders, call_sessions RESTART IDENTITY');
    await pool.query("DELETE FROM staff_users WHERE id NOT IN ('staff-1', 'manager-1')");
    await pool.query("DELETE FROM stores WHERE id != 'store-1'");
  });

  afterAll(async () => {
    process.env = { ...envBackup };
    await pool.end();
  });

  it('supports login, idempotent create, and status transitions via HTTP routes', async () => {
    const { app } = createApp();

    const login = await request(app)
      .post('/api/auth/login')
      .send({ store_id: 'store-1', email: 'staff@store.test', password: 'password123' })
      .expect(200);
    const token = String(login.body.token);

    const orderBody = {
      store_id: 'store-1',
      customer_name: 'API Integration',
      customer_phone: '+15550009999',
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

    const first = await request(app).post('/api/orders').set('Idempotency-Key', 'pg-api-idem').send(orderBody).expect(201);
    const second = await request(app).post('/api/orders').set('Idempotency-Key', 'pg-api-idem').send(orderBody).expect(201);
    expect(first.body.id).toBe(second.body.id);

    await request(app)
      .patch(`/api/orders/${first.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'ACCEPTED' })
      .expect(200);

    await request(app)
      .patch(`/api/orders/${first.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'REJECTED', reject_reason: 'OUT_OF_STOCK', note: 'Sold out' })
      .expect(400);

    await request(app)
      .post(`/api/orders/${first.body.id}/ack`)
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: 'tablet-pg-1' })
      .expect(200);

    const events = await request(app)
      .get('/api/stores/store-1/events')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(events.body.events.length).toBeGreaterThanOrEqual(3);

    await request(app).get('/api/stores/store-1').set('Authorization', `Bearer ${token}`).expect(200);
  });

  it('rejects invalid store scope token access', async () => {
    await pool.query(
      "INSERT INTO stores (id, mode, default_prep_mins) VALUES ('store-2', 'OPEN', 20) ON CONFLICT (id) DO NOTHING"
    );
    const hash = hashPassword('password123', 'fixedsalt');
    await pool.query(
      `INSERT INTO staff_users (id, store_id, email, role, password_hash, is_active)
       VALUES ($1, $2, $3, $4, $5, TRUE), ($6, $7, $8, $9, $10, TRUE)`,
      ['manager-a', 'store-1', 'manager-a@store.test', 'MANAGER', hash,
       'manager-b', 'store-2', 'manager-b@store.test', 'MANAGER', hash]
    );

    const { app } = createApp();
    const login = await request(app)
      .post('/api/auth/login')
      .send({ store_id: 'store-2', email: 'manager-b@store.test', password: 'password123' })
      .expect(200);
    const token = String(login.body.token);

    await request(app).get('/api/stores/store-1/events').set('Authorization', `Bearer ${token}`).expect(403);
  });
  it('replays accepted voice orders after availability changes and concurrent submission', async () => {
    process.env.INTERNAL_API_KEY = 'pg-internal-test';
    const { app, db } = createApp();
    await db.setItemAvailability('item-burrito', true);
    const body = { store_id: 'store-1', call_id: 'CA-pg-retry', customer_name: 'Casey',
      customer_phone: '+15555550100', items: [{ item_id: 'item-burrito', qty: 1 }] };
    const send = () => request(app).post('/api/internal/orders').set('x-internal-api-key', 'pg-internal-test').send(body);
    const responses = await Promise.all([send(), send()]);
    expect(responses.map((r) => r.status)).toEqual([201, 201]);
    expect(responses[0]!.body.id).toBe(responses[1]!.body.id);
    await db.setItemAvailability('item-burrito', false);
    try {
      const retry = await send().expect(201);
      expect(retry.body.id).toBe(responses[0]!.body.id);
      expect(await db.listOrders('store-1')).toHaveLength(1);
    } finally { await db.setItemAvailability('item-burrito', true); }
  });

});
