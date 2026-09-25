import express from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { DemoSession } from './session.js';
import { asyncRoute } from '../http/asyncRoute.js';

interface Options {
  now?: () => number;
  ttlMs?: number;
  maxSessions?: number;
  maxMutationsPerMinute?: number;
}
export function createDemoApp(options: Options = {}) {
  const app = express();
  const now = options.now ?? Date.now;
  const ttl = options.ttlMs ?? 30 * 60 * 1000;
  const sessions = new Map<string, DemoSession>();
  const mutations = new Map<string, { time: number; count: number }>();
  const listeners = new Map<string, Set<express.Response>>();
  const births = new Map<string, { time: number; count: number }>();
  const sweep = () => {
    for (const [key, session] of sessions)
      if (now() - session.createdAt >= ttl) {
        sessions.delete(key);
        mutations.delete(key);
        for (const response of listeners.get(key) ?? []) response.end();
        listeners.delete(key);
      }
    for (const [key, bucket] of births) if (now() - bucket.time > 60000) births.delete(key);
  };
  const publish = (token: string) => {
    for (const response of listeners.get(token) ?? []) response.write('event: update\ndata: {}\n\n');
  };
  app.disable('x-powered-by');
  app.use(express.json({ limit: '8kb' }));
  app.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.get('/health', (_req, res) =>
    res.json({ ok: true, service: 'restaurant-call-agent-demo', storage: 'isolated-memory' })
  );
  app.post(
    '/api/demo/sessions',
    asyncRoute(async (req, res) => {
      sweep();
      const ip = req.ip ?? 'local';
      const bucket = births.get(ip) ?? { time: now(), count: 0 };
      if (bucket.count >= 20) {
        res.setHeader('Retry-After', '60');
        return res.status(429).json({ error: 'Too many new sessions. Please wait a minute.' });
      }
      if (sessions.size >= (options.maxSessions ?? 200))
        return res.status(503).json({ error: 'Demo is busy. Please try again shortly.' });
      bucket.count++;
      births.set(ip, bucket);
      const token = randomUUID();
      const session = new DemoSession(now());
      sessions.set(token, session);
      await session.seed();
      res.status(201).json({ token, state: await session.snapshot(), expiresInMs: ttl });
    })
  );

  app.use('/api/demo', (req, res, next) => {
    sweep();
    const token =
      req.header('x-demo-session') ??
      (req.path === '/events' && typeof req.query.session === 'string' ? req.query.session : '');
    const session = sessions.get(token);
    if (!session)
      return res.status(401).json({ error: 'Your demo session expired. Start a fresh demo to continue.' });
    if (req.method === 'POST' || req.method === 'PATCH') {
      const previous = mutations.get(token);
      const bucket = previous && now() - previous.time < 60000 ? previous : { time: now(), count: 0 };
      if (bucket.count >= (options.maxMutationsPerMinute ?? 120)) {
        res.setHeader('Retry-After', String(Math.max(1, Math.ceil((60000 - (now() - bucket.time)) / 1000))));
        return res.status(429).json({ error: 'Too many changes. Please wait a moment and try again.' });
      }
      bucket.count++;
      mutations.set(token, bucket);
    }
    res.locals.demo = session;
    res.locals.token = token;
    next();
  });
  app.get('/api/demo/events', (req, res) => {
    const token = String(res.locals.token);
    const clients = listeners.get(token) ?? new Set<express.Response>();
    if (clients.size >= 4) return res.status(429).end();
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    res.write('event: update\ndata: {}\n\n');
    clients.add(res);
    listeners.set(token, clients);
    const timer = setInterval(() => {
      sweep();
      if (!res.writableEnded) res.write(': heartbeat\n\n');
    }, 15000);
    req.on('close', () => {
      clearInterval(timer);
      clients.delete(res);
      if (!clients.size) listeners.delete(token);
    });
  });
  app.get(
    '/api/demo/state',
    asyncRoute(async (_req, res) => res.json(await (res.locals.demo as DemoSession).snapshot()))
  );
  const command = (
    path: string,
    schema: z.ZodType,
    action: (session: DemoSession, input: unknown, token: string) => Promise<unknown>
  ) => {
    app.post(
      path,
      asyncRoute(async (req, res) => {
        const parsed = schema.safeParse(req.body);
        if (!parsed.success)
          return res.status(400).json({ error: 'Please check the request and try again.' });
        try {
          const state = await action(res.locals.demo as DemoSession, parsed.data, String(res.locals.token));
          publish(String(res.locals.token));
          return res.json(state);
        } catch (error) {
          return res
            .status(409)
            .json({ error: error instanceof Error ? error.message : 'Action unavailable.' });
        }
      })
    );
  };
  command(
    '/api/demo/scenario',
    z.object({ scenario: z.enum(['pickup', 'unavailable', 'handoff']) }),
    (session, input) => session.start((input as { scenario: 'pickup' | 'unavailable' | 'handoff' }).scenario)
  );
  command(
    '/api/demo/next',
    z.object({ callId: z.string().uuid(), step: z.number().int().min(0) }),
    (session, input) => session.next((input as { callId: string }).callId, (input as { step: number }).step)
  );
  command('/api/demo/confirm', z.object({ callId: z.string().uuid() }), (session, input) =>
    session.confirm((input as { callId: string }).callId)
  );
  command('/api/demo/reset', z.object({}).optional(), async (_session, _input, token) => {
    const replacement = new DemoSession(now());
    await replacement.seed();
    sessions.set(token, replacement);
    return replacement.snapshot();
  });
  app.patch(
    '/api/demo/orders/:id',
    asyncRoute(async (req, res) => {
      const parsed = z
        .object({ status: z.enum(['ACCEPTED', 'IN_PROGRESS', 'READY', 'COMPLETED', 'REJECTED', 'CANCELED']) })
        .safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid order status.' });
      try {
        const state = await (res.locals.demo as DemoSession).updateOrder(
          String(req.params.id),
          parsed.data.status
        );
        publish(String(res.locals.token));
        return res.json(state);
      } catch {
        return res.status(400).json({ error: 'That order cannot move to this status.' });
      }
    })
  );
  app.patch(
    '/api/demo/menu/:id',
    asyncRoute(async (req, res) => {
      const parsed = z.object({ isAvailable: z.boolean() }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid availability.' });
      const session = res.locals.demo as DemoSession;
      if (!(await session.db.setItemAvailability(String(req.params.id), parsed.data.isAvailable)))
        return res.status(404).json({ error: 'Item not found.' });
      publish(String(res.locals.token));
      return res.json(await session.snapshot());
    })
  );
  app.patch(
    '/api/demo/store',
    asyncRoute(async (req, res) => {
      const parsed = z.object({ mode: z.enum(['OPEN', 'BUSY', 'CLOSED']) }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid store mode.' });
      const session = res.locals.demo as DemoSession;
      await session.db.setStoreMode('store-1', parsed.data.mode);
      publish(String(res.locals.token));
      res.json(await session.snapshot());
    })
  );
  const errors: express.ErrorRequestHandler = (_err, _req, res, _next) =>
    res.status(400).json({ error: 'Invalid request.' });
  app.use(errors);
  return { app };
}
