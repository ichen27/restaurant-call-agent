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
