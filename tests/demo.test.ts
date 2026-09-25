import request from 'supertest';
import { expect, it } from 'vitest';
import { createDemoApp } from '../src/demo/app.js';

it('isolates visitors, requires confirmation, and prevents duplicate orders', async () => {
  const { app } = createDemoApp();
  const a = (await request(app).post('/api/demo/sessions').expect(201)).body;
  const b = (await request(app).post('/api/demo/sessions').expect(201)).body;
  const api = () => request(app);
  const start = (
    await api()
      .post('/api/demo/scenario')
      .set('x-demo-session', a.token)
      .send({ scenario: 'pickup' })
      .expect(200)
  ).body;
  await api()
    .post('/api/demo/confirm')
    .set('x-demo-session', a.token)
    .send({ callId: start.call.id })
    .expect(409);
  let state = start;
  for (let i = 0; i < 6 && state.call.phase === 'talking'; i++) {
    state = (
      await api()
        .post('/api/demo/next')
        .set('x-demo-session', a.token)
        .send({ step: state.call.cursor, callId: state.call.id })
        .expect(200)
    ).body;
  }
  expect(state.call.phase).toBe('confirmation');
  const body = { callId: state.call.id };
  const confirmed = (
    await api().post('/api/demo/confirm').set('x-demo-session', a.token).send(body).expect(200)
  ).body;
  const retry = (await api().post('/api/demo/confirm').set('x-demo-session', a.token).send(body).expect(200))
    .body;
  expect(confirmed.orders).toHaveLength(5);
  expect(retry.orders).toHaveLength(5);
  const order = confirmed.orders.find((o: { callId?: string }) => o.callId === body.callId);
  expect(order.totalCents).toBe(3550);
  expect(order.items.map((i: { qty: number }) => i.qty)).toEqual([2, 1]);
  const other = (await api().get('/api/demo/state').set('x-demo-session', b.token).expect(200)).body;
  expect(other.orders).toHaveLength(4);
  await api()
    .patch('/api/demo/orders/' + order.id)
    .set('x-demo-session', a.token)
    .send({ status: 'READY' })
    .expect(400);
  for (const status of ['ACCEPTED', 'IN_PROGRESS', 'READY', 'COMPLETED']) {
    await api()
      .patch('/api/demo/orders/' + order.id)
      .set('x-demo-session', a.token)
      .send({ status })
      .expect(200);
  }
});

it('hands off without submitting and resets only the current visitor', async () => {
  const { app } = createDemoApp();
  const { token } = (await request(app).post('/api/demo/sessions')).body;
  let state = (
    await request(app).post('/api/demo/scenario').set('x-demo-session', token).send({ scenario: 'handoff' })
  ).body;
  while (state.call.phase === 'talking') {
    state = (
      await request(app)
        .post('/api/demo/next')
        .set('x-demo-session', token)
        .send({ step: state.call.cursor, callId: state.call.id })
    ).body;
  }
  expect(state.call.phase).toBe('handoff');
  expect(state.orders).toHaveLength(4);
  expect(state.events.some((e: { eventType: string }) => e.eventType === 'CallHandoffRequested')).toBe(true);
  await request(app)
    .post('/api/demo/confirm')
    .set('x-demo-session', token)
    .send({ callId: state.call.id })
    .expect(409);
  const reset = await request(app).post('/api/demo/reset').set('x-demo-session', token).expect(200);
  expect(reset.body.call).toBeNull();
  expect(reset.body.orders).toHaveLength(4);
});

it('rejects unknown sessions, invalid input, unavailable orders and expired sessions', async () => {
  let now = 0;
  const { app } = createDemoApp({ now: () => now, ttlMs: 1000 });
  await request(app).get('/api/demo/state').expect(401);
  const { token } = (await request(app).post('/api/demo/sessions')).body;
  await request(app)
    .post('/api/demo/scenario')
    .set('x-demo-session', token)
    .send({ scenario: 'unknown' })
    .expect(400);
  let state = (
    await request(app)
      .post('/api/demo/scenario')
      .set('x-demo-session', token)
      .send({ scenario: 'unavailable' })
  ).body;
  while (state.call.phase === 'talking')
    state = (
      await request(app)
        .post('/api/demo/next')
        .set('x-demo-session', token)
        .send({ step: state.call.cursor, callId: state.call.id })
    ).body;
  expect(state.call.phase).toBe('handoff');
  expect(state.orders).toHaveLength(4);
  now = 1001;
  await request(app).get('/api/demo/state').set('x-demo-session', token).expect(401);
});

it('bounds session capacity without evicting active visitors', async () => {
  const { app } = createDemoApp({ maxSessions: 1 });
  await request(app).post('/api/demo/sessions').expect(201);
  await request(app).post('/api/demo/sessions').expect(503);
});

it('handles concurrent confirmations once and rejects sold-out or closed orders', async () => {
  const { app } = createDemoApp();
  const { token } = (await request(app).post('/api/demo/sessions')).body;
  let state = (
    await request(app).post('/api/demo/scenario').set('x-demo-session', token).send({ scenario: 'pickup' })
  ).body;
  while (state.call.phase === 'talking')
    state = (
      await request(app)
        .post('/api/demo/next')
        .set('x-demo-session', token)
        .send({ step: state.call.cursor, callId: state.call.id })
    ).body;
  await request(app)
    .patch('/api/demo/menu/sesame-chicken')
    .set('x-demo-session', token)
    .send({ isAvailable: false })
    .expect(200);
  await request(app)
    .post('/api/demo/confirm')
    .set('x-demo-session', token)
    .send({ callId: state.call.id })
    .expect(409);
  await request(app)
    .patch('/api/demo/menu/sesame-chicken')
    .set('x-demo-session', token)
    .send({ isAvailable: true })
    .expect(200);
  await request(app)
    .patch('/api/demo/store')
    .set('x-demo-session', token)
    .send({ mode: 'CLOSED' })
    .expect(200);
  await request(app)
    .post('/api/demo/confirm')
    .set('x-demo-session', token)
    .send({ callId: state.call.id })
    .expect(409);
  await request(app).patch('/api/demo/store').set('x-demo-session', token).send({ mode: 'OPEN' }).expect(200);
  await Promise.all(
    [1, 2].map(() =>
      request(app)
        .post('/api/demo/confirm')
        .set('x-demo-session', token)
        .send({ callId: state.call.id })
        .expect(200)
    )
  );
  const final = (await request(app).get('/api/demo/state').set('x-demo-session', token)).body;
  expect(final.orders).toHaveLength(5);
  expect(
    final.call.messages.filter((m: { text: string }) => m.text.startsWith('You’re all set'))
  ).toHaveLength(1);
});

it('treats a repeated conversation step as a retry and validates menu changes', async () => {
  const { app } = createDemoApp();
  const { token } = (await request(app).post('/api/demo/sessions')).body;
  const start = (
    await request(app)
      .post('/api/demo/scenario')
      .set('x-demo-session', token)
      .send({ scenario: 'pickup' })
      .expect(200)
  ).body;
  const first = await request(app)
    .post('/api/demo/next')
    .set('x-demo-session', token)
    .send({ step: 1, callId: start.call.id })
    .expect(200);
  const retry = await request(app)
    .post('/api/demo/next')
    .set('x-demo-session', token)
    .send({ step: 1, callId: start.call.id })
    .expect(200);
  expect(retry.body.call.messages).toEqual(first.body.call.messages);
  await request(app)
    .patch('/api/demo/menu/no-item')
    .set('x-demo-session', token)
    .send({ isAvailable: false })
    .expect(404);
  await request(app)
    .patch('/api/demo/menu/sesame-chicken')
    .set('x-demo-session', token)
    .send({ isAvailable: 'yes' })
    .expect(400);
});

it('rejects delayed steps from an older call after a reset', async () => {
  const { app } = createDemoApp();
  const { token } = (await request(app).post('/api/demo/sessions')).body;
  const start = (
    await request(app).post('/api/demo/scenario').set('x-demo-session', token).send({ scenario: 'pickup' })
  ).body;
  await request(app).post('/api/demo/reset').set('x-demo-session', token).send({}).expect(200);
  const replacement = (
    await request(app).post('/api/demo/scenario').set('x-demo-session', token).send({ scenario: 'pickup' })
  ).body;
  await request(app)
    .post('/api/demo/next')
    .set('x-demo-session', token)
    .send({ callId: start.call.id, step: 1 })
    .expect(409);
  const state = (await request(app).get('/api/demo/state').set('x-demo-session', token)).body;
  expect(state.call.id).toBe(replacement.call.id);
  expect(state.call.cursor).toBe(1);
});

it('bounds scenario history in a long-lived session', async () => {
  const { app } = createDemoApp();
  const { token } = (await request(app).post('/api/demo/sessions')).body;
  for (let i = 0; i < 30; i++) {
    let state = (
      await request(app)
        .post('/api/demo/scenario')
        .set('x-demo-session', token)
        .send({ scenario: 'handoff' })
        .expect(200)
    ).body;
    while (state.call.phase === 'talking')
      state = (
        await request(app)
          .post('/api/demo/next')
          .set('x-demo-session', token)
          .send({ callId: state.call.id, step: state.call.cursor })
          .expect(200)
      ).body;
  }
  await request(app)
    .post('/api/demo/scenario')
    .set('x-demo-session', token)
    .send({ scenario: 'handoff' })
    .expect(409);
});

it('keeps mutation rate limits across a reset', async () => {
  const { app } = createDemoApp({ maxMutationsPerMinute: 2 });
  const { token } = (await request(app).post('/api/demo/sessions')).body;
  for (let i = 0; i < 2; i++)
    await request(app).post('/api/demo/reset').set('x-demo-session', token).send({}).expect(200);
  const limited = await request(app)
    .post('/api/demo/reset')
    .set('x-demo-session', token)
    .send({})
    .expect(429);
  expect(limited.headers['retry-after']).toBeDefined();
  await request(app).get('/api/demo/state').set('x-demo-session', token).expect(200);
});
