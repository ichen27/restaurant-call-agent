import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const envBackup = { ...process.env };

describe('internal and telephony security', () => {
  beforeEach(() => {
    process.env = { ...envBackup };
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('enforces INTERNAL_API_KEY on internal outbox endpoints when configured', async () => {
    process.env.INTERNAL_API_KEY = 'internal-secret';
    const { app } = createApp();

    await request(app).get('/api/internal/outbox').expect(401);
    await request(app).post('/api/internal/outbox/replay').send({}).expect(401);

    const authorized = await request(app).get('/api/internal/outbox').set('x-internal-api-key', 'internal-secret').expect(200);
    expect(Array.isArray(authorized.body.events)).toBe(true);
    const replay = await request(app)
      .post('/api/internal/outbox/replay')
      .set('x-internal-api-key', 'internal-secret')
      .send({ limit: 10 })
      .expect(200);
    expect(typeof replay.body.replayed_count).toBe('number');
  });

  it('fails fast in non-local runtime when required secrets are missing', async () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTH_REQUIRED = 'true';
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.TELEPHONY_WEBHOOK_TOKEN;
    delete process.env.TELEPHONY_WEBHOOK_SECRET;

    expect(() => createApp()).toThrow(/JWT_SECRET is required/i);
  });
});
