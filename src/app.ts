import express from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { OrderService } from './orderService.js';
import type { OrderItemInput, OrderStatus, StoreMode } from './types.js';
import { safeLog } from './logger.js';
import { createRepository } from './store/factory.js';
import { asyncRoute } from './http/asyncRoute.js';
import { errorMiddleware } from './http/errorMiddleware.js';
import { AuthService } from './auth/service.js';
import { authenticateRequest, requireRole } from './auth/middleware.js';
import { validateRuntimeSecurityConfig } from './auth/config.js';
import type { RealtimeFanout } from './realtime/gateway.js';

const statusSchema = z.enum(['NEW', 'ACCEPTED', 'IN_PROGRESS', 'READY', 'COMPLETED', 'REJECTED', 'CANCELED']);
const modeSchema = z.enum(['OPEN', 'BUSY', 'CLOSED']);
const rejectReasonSchema = z.enum(['OUT_OF_STOCK', 'KITCHEN_OVERLOADED', 'STORE_CLOSING', 'UNABLE_TO_FULFILL']);

const createOrderSchema = z.object({
  store_id: z.string(),
  customer_name: z.string().min(1),
  customer_phone: z.string().min(4),
  items: z
    .array(
      z.object({
        item_id: z.string(),
        item_name_snapshot: z.string(),
        qty: z.number().int().positive(),
        base_price_cents: z.number().int().nonnegative(),
        modifiers_snapshot_json: z.array(z.record(z.union([z.string(), z.number()]))),
        special_instructions: z.string().optional(),
        line_total_cents: z.number().int().nonnegative()
      })
    )
    .min(1),
  total_cents: z.number().int().nonnegative(),
  notes: z.string().optional(),
  call_id: z.string().optional()
});

const patchOrderSchema = z
  .object({
    status: statusSchema,
    reject_reason: rejectReasonSchema.optional(),
    note: z.string().min(1).max(300).optional(),
    promised_time: z.string().datetime({ offset: true }).optional()
  })
  .superRefine((data, ctx) => {
    if (data.status === 'REJECTED' && !data.reject_reason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'reject_reason is required when status is REJECTED',
        path: ['reject_reason']
      });
    }
  });

interface CreateAppOptions {
  realtimeGateway?: RealtimeFanout;
}

interface LimiterOptions {
  keyPrefix: string;
  windowMs: number;
  max: number;
}

function envFlagEnabled(name: string, defaultValue = true): boolean {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  return raw.toLowerCase() !== 'false';
}

function isOrderIntakeEnabled(): boolean {
  return envFlagEnabled('ORDER_INTAKE_ENABLED', true);
}

function readLimit(name: string, fallback: number): number {
  const parsed = Number(process.env[name] ?? fallback);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function createRateLimiter(options: LimiterOptions): express.RequestHandler {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return (req, res, next) => {
    const key = `${options.keyPrefix}:${req.ip}`;
    const now = Date.now();
    const current = buckets.get(key);
    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    if (current.count >= options.max) {
      const retryAfter = Math.ceil((current.resetAt - now) / 1000);
      res.setHeader('retry-after', String(Math.max(retryAfter, 1)));
      safeLog('warn', 'rate limit exceeded', {
        request_id: req.requestId,
        path: req.path,
        method: req.method,
        limiter: options.keyPrefix,
        ip: req.ip
      });
      res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'too many requests' } });
      return;
    }

    current.count += 1;
    next();
  };
}

export function createApp(options: CreateAppOptions = {}) {
  validateRuntimeSecurityConfig();

  const app = express();
  const { realtimeGateway } = options;
  const { repository: db, backend } = createRepository();
  const orderService = new OrderService(db);
  const authService = new AuthService(db);

  const loginLimiter = createRateLimiter({
    keyPrefix: 'auth_login',
    windowMs: readLimit('RATE_LIMIT_WINDOW_MS', 5 * 60 * 1000),
    max: readLimit('RATE_LIMIT_LOGIN_MAX', 20)
  });
  const createOrderLimiter = createRateLimiter({
    keyPrefix: 'order_create',
    windowMs: readLimit('RATE_LIMIT_WINDOW_MS', 5 * 60 * 1000),
    max: readLimit('RATE_LIMIT_ORDER_CREATE_MAX', 60)
  });

  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as express.Request).rawBody = buf.toString('utf8');
      }
    })
  );

  app.use((req, res, next) => {
    const requestId = req.header('x-request-id') ?? randomUUID();
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    next();
  });

  app.use(authenticateRequest(authService));

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'call-agent',
      backend,
      realtime_clients: realtimeGateway?.connectedCount() ?? 0,
      order_intake_enabled: isOrderIntakeEnabled()
    });
  });

  app.post('/api/auth/login', loginLimiter, asyncRoute(async (req, res) => {
    const parsed = z
      .object({
        store_id: z.string().min(1),
        email: z.string().email(),
        password: z.string().min(1)
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const loggedIn = await authService.login(parsed.data.store_id, parsed.data.email, parsed.data.password);
    if (!loggedIn) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'invalid credentials' } });
    }

    res.json({ token: loggedIn.token, user: { id: loggedIn.user.userId, role: loggedIn.user.role, store_id: loggedIn.user.storeId, email: loggedIn.user.email } });
  }));

  app.get('/api/auth/me', asyncRoute(async (req, res) => {
    if (!req.auth) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'missing bearer token' } });
    }
    res.json({ id: req.auth.userId, role: req.auth.role, store_id: req.auth.storeId, email: req.auth.email });
  }));

  app.get('/api/stores/:storeId', requireRole('STAFF'), asyncRoute(async (req, res) => {
    const storeId = z.string().parse(req.params.storeId);
    if (!allowStoreScope(req.auth?.storeId, storeId, res)) return;

    const store = await db.getStoreById(storeId);
    if (!store) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'store not found' } });
    }

    res.json({
      id: store.id,
      name: store.name,
      timezone: store.timezone,
      public_phone: store.publicPhone,
      mode: store.mode,
      default_prep_mins: store.defaultPrepMins
    });
  }));

  app.get('/api/stores/:storeId/menu', requireRole('STAFF'), asyncRoute(async (req, res) => {
    const storeId = z.string().parse(req.params.storeId);
    if (!allowStoreScope(req.auth?.storeId, storeId, res)) return;
    res.json({ items: await db.getMenu(storeId) });
  }));

  app.patch('/api/menu/items/:itemId/availability', requireRole('MANAGER'), asyncRoute(async (req, res) => {
    const body = z.object({ is_available: z.boolean(), note: z.string().max(160).optional() }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten() });
    const itemId = z.string().parse(req.params.itemId);
    const item = await db.setItemAvailability(itemId, body.data.is_available);
    if (!item) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'item not found' } });
    res.json({ id: item.id, is_available: item.isAvailable });
  }));

  app.patch('/api/stores/:storeId/mode', requireRole('MANAGER'), asyncRoute(async (req, res) => {
    const body = z.object({ mode: modeSchema, reason: z.string().min(1).max(160).optional() }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten() });
    const storeId = z.string().parse(req.params.storeId);
    if (!allowStoreScope(req.auth?.storeId, storeId, res)) return;
    const mode = await db.setStoreMode(storeId, body.data.mode as StoreMode);
    if (!mode) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'store not found' } });
    res.json({ mode });
  }));

  app.post('/api/orders', createOrderLimiter, asyncRoute(async (req, res) => {
    if (!isOrderIntakeEnabled()) {
      return res.status(503).json({ error: { code: 'ORDER_INTAKE_DISABLED', message: 'order intake disabled' } });
    }

    const idempotencyKey = req.header('Idempotency-Key');
    if (!idempotencyKey) return res.status(400).json({ error: { code: 'MISSING_IDEMPOTENCY_KEY' } });
    const body = createOrderSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten() });

    const command = {
      idempotencyKey,
      storeId: body.data.store_id,
      customerName: body.data.customer_name,
      customerPhone: body.data.customer_phone,
      items: body.data.items.map((it) => {
        const built = {
          itemId: it.item_id,
          itemNameSnapshot: it.item_name_snapshot,
          qty: it.qty,
          basePriceCents: it.base_price_cents,
          modifiersSnapshotJson: it.modifiers_snapshot_json,
          lineTotalCents: it.line_total_cents
        };
        if (it.special_instructions) {
          return { ...built, specialInstructions: it.special_instructions };
        }
        return built;
      }),
      totalCents: body.data.total_cents
    };
    if (body.data.notes) {
      Object.assign(command, { notes: body.data.notes });
    }
    if (body.data.call_id) {
      Object.assign(command, { callId: body.data.call_id });
    }

    const order = await orderService.createOrder(command);

    safeLog('info', 'order created', {
      request_id: req.requestId,
      order_id: order.id,
      store_id: order.storeId,
      metric: 'orders_created_total',
      metric_value: 1
    });
    res.status(201).json({ id: order.id, order_number: order.orderNumber, status: order.status, created_at: order.createdAt });
  }));

  app.get('/api/orders', requireRole('STAFF'), asyncRoute(async (req, res) => {
    const storeId = z.string().parse(req.query.store_id);
    if (!allowStoreScope(req.auth?.storeId, storeId, res)) return;

    const statuses =
      typeof req.query.status === 'string'
        ? req.query.status
            .split(',')
            .map((s) => statusSchema.safeParse(s.trim()))
            .filter((result): result is { success: true; data: OrderStatus } => result.success)
            .map((result) => result.data)
        : undefined;
    const orders = await db.listOrders(storeId, statuses);
    res.json({ orders, next_cursor: null });
  }));

  app.get('/api/orders/:orderId', requireRole('STAFF'), asyncRoute(async (req, res) => {
    const orderId = z.string().parse(req.params.orderId);
    const order = await db.getOrderById(orderId);
    if (!order) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'order not found' } });
    }
    if (!allowStoreScope(req.auth?.storeId, order.storeId, res)) return;

    const events = await db.getEventsForOrder(order.id);
    res.json({ order, events });
  }));

  app.patch('/api/orders/:orderId', requireRole('STAFF'), asyncRoute(async (req, res) => {
    const body = patchOrderSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten() });
    const orderId = z.string().parse(req.params.orderId);
    const existing = await db.getOrderById(orderId);
    if (!existing) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'order not found' } });
    }
    if (!allowStoreScope(req.auth?.storeId, existing.storeId, res)) return;
    const actorId = req.auth?.userId ?? req.header('x-user-id') ?? 'staff';
    const updateInput = {
      ...(body.data.reject_reason ? { rejectReason: body.data.reject_reason } : {}),
      ...(body.data.note ? { note: body.data.note } : {}),
      ...(body.data.promised_time ? { promisedTime: body.data.promised_time } : {})
    };
    const order = await orderService.updateStatus(orderId, body.data.status as OrderStatus, actorId, updateInput);
    res.json({ id: order.id, status: order.status });
  }));

  app.post('/api/orders/:orderId/ack', requireRole('STAFF'), asyncRoute(async (req, res) => {
    const body = z.object({ client_id: z.string().min(1) }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten() });
    const orderId = z.string().parse(req.params.orderId);
    const existing = await db.getOrderById(orderId);
    if (!existing) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'order not found' } });
    }
    if (!allowStoreScope(req.auth?.storeId, existing.storeId, res)) return;
    await orderService.ackOrder(orderId, body.data.client_id);
    res.json({ acked: true });
  }));

  app.get('/api/stores/:storeId/events', requireRole('STAFF'), asyncRoute(async (req, res) => {
    const since = Number(req.query.since_id ?? 0);
    const storeId = z.string().parse(req.params.storeId);
    if (!allowStoreScope(req.auth?.storeId, storeId, res)) return;
    const events = await db.getEventsSince(storeId, Number.isNaN(since) ? 0 : since);
    const next = events.length ? events[events.length - 1]?.id : since;
    res.json({ events, next_since_id: next });
  }));

  app.get('/api/internal/outbox', asyncRoute(async (req, res) => {
    if (!allowServiceToken(req, res, process.env.INTERNAL_API_KEY, 'x-internal-api-key')) return;
    const parsed = z
      .object({
        store_id: z.string().optional(),
        status: z.enum(['PENDING', 'SENT', 'FAILED', 'DEAD_LETTER']).optional()
      })
      .safeParse(req.query);

    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const events = await db.listOutbox(parsed.data.store_id, parsed.data.status);
    res.json({ events });
  }));

  app.post('/api/internal/outbox/publish', asyncRoute(async (req, res) => {
    if (!allowServiceToken(req, res, process.env.INTERNAL_API_KEY, 'x-internal-api-key')) return;
    const parsed = z
      .object({
        store_id: z.string().optional(),
        limit: z.number().int().positive().max(1000).optional()
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const result = await db.publishOutbox(parsed.data.store_id, parsed.data.limit ?? 100);
    res.json(result);
  }));

  app.post('/api/internal/outbox/replay', asyncRoute(async (req, res) => {
    if (!allowServiceToken(req, res, process.env.INTERNAL_API_KEY, 'x-internal-api-key')) return;
    const parsed = z
      .object({
        store_id: z.string().optional(),
        limit: z.number().int().positive().max(1000).optional()
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const replayed = await db.replayDeadLetters(parsed.data.store_id, parsed.data.limit ?? 100);
    res.json({ replayed_count: replayed.length, events: replayed });
  }));

  app.post('/api/internal/realtime/publish', asyncRoute(async (req, res) => {
    if (!allowServiceToken(req, res, process.env.INTERNAL_API_KEY, 'x-internal-api-key')) return;
    if (!realtimeGateway) {
      return res.status(503).json({ error: { code: 'REALTIME_DISABLED', message: 'realtime gateway not configured' } });
    }

    const parsed = z
      .object({
        kind: z.literal('outbox_publish'),
        event_id: z.number().int().positive(),
        store_id: z.string().min(1),
        event_type: z.string().min(1),
        aggregate_id: z.string().min(1),
        aggregate_type: z.string().min(1),
        attempts: z.number().int().nonnegative(),
        created_at: z.string().min(1),
        payload: z.record(z.unknown())
      })
      .safeParse(req.body);

    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const delivered = realtimeGateway.publish(parsed.data);
    safeLog('info', 'realtime publish delivered', {
      request_id: req.requestId,
      store_id: parsed.data.store_id,
      metric: 'ws_connected_clients',
      metric_value: realtimeGateway.connectedCount(parsed.data.store_id),
      delivered
    });
    res.json({ delivered });
  }));

  // --- Internal endpoints for call worker ---

  app.get('/api/internal/stores/:storeId', asyncRoute(async (req, res) => {
    if (!allowServiceToken(req, res, process.env.INTERNAL_API_KEY, 'x-internal-api-key')) return;
    const storeId = z.string().parse(req.params.storeId);
    const store = await db.getStoreById(storeId);
    if (!store) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'store not found' } });
    res.json({
      id: store.id,
      name: store.name,
      timezone: store.timezone,
      public_phone: store.publicPhone,
      mode: store.mode,
      default_prep_mins: store.defaultPrepMins
    });
  }));

  app.get('/api/internal/stores/:storeId/menu', asyncRoute(async (req, res) => {
    if (!allowServiceToken(req, res, process.env.INTERNAL_API_KEY, 'x-internal-api-key')) return;
    const storeId = z.string().parse(req.params.storeId);
    const items = await db.getMenu(storeId);
    const query = typeof req.query.q === 'string' ? req.query.q.toLowerCase() : '';
    const filtered = query
      ? items.filter((item) => item.name.toLowerCase().includes(query))
      : items;
    res.json({
      items: filtered.map((item) => ({
        id: item.id,
        name: item.name,
        price_cents: item.basePriceCents,
        is_available: item.isAvailable
      }))
    });
  }));

  app.post('/api/internal/orders', asyncRoute(async (req, res) => {
    if (!allowServiceToken(req, res, process.env.INTERNAL_API_KEY, 'x-internal-api-key')) return;
    if (!isOrderIntakeEnabled()) {
      return res.status(503).json({ error: { code: 'ORDER_INTAKE_DISABLED', message: 'order intake disabled' } });
    }
    const parsed = z.object({
      store_id: z.string().min(1),
      call_id: z.string().optional(),
      customer_name: z.string().min(1),
      customer_phone: z.string().min(4),
      items: z.array(z.object({
        item_id: z.string().min(1),
        qty: z.number().int().positive()
      })).min(1)
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    // Hydrate items from menu
    const menuItems = await db.getMenu(parsed.data.store_id);
    const menuMap = new Map(menuItems.map((m) => [m.id, m]));
    const hydratedItems: OrderItemInput[] = [];
    for (const item of parsed.data.items) {
      const menuItem = menuMap.get(item.item_id);
      if (!menuItem) return res.status(400).json({ error: { code: 'ITEM_NOT_FOUND', message: `menu item ${item.item_id} not found` } });
      if (!menuItem.isAvailable) return res.status(400).json({ error: { code: 'ITEM_UNAVAILABLE', message: `${menuItem.name} is currently unavailable` } });
      hydratedItems.push({
        itemId: menuItem.id,
        itemNameSnapshot: menuItem.name,
        qty: item.qty,
        basePriceCents: menuItem.basePriceCents,
        modifiersSnapshotJson: [],
        lineTotalCents: menuItem.basePriceCents * item.qty
      });
    }
    const totalCents = hydratedItems.reduce((sum, i) => sum + i.lineTotalCents, 0);

    const order = await orderService.createOrder({
      storeId: parsed.data.store_id,
      idempotencyKey: randomUUID(),
      customerName: parsed.data.customer_name,
      customerPhone: parsed.data.customer_phone,
      items: hydratedItems,
      totalCents,
      ...(parsed.data.call_id ? { callId: parsed.data.call_id } : {})
    });
    res.status(201).json({
      id: order.id,
      order_number: order.orderNumber,
      status: order.status,
      total_cents: order.totalCents,
      created_at: order.createdAt
    });
  }));

  app.post('/api/internal/call-events', asyncRoute(async (req, res) => {
    if (!allowServiceToken(req, res, process.env.INTERNAL_API_KEY, 'x-internal-api-key')) return;
    const parsed = z.object({
      store_id: z.string().min(1),
      call_id: z.string().min(1),
      event_type: z.string().min(1),
      payload: z.record(z.unknown()).default({})
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const event = await db.appendStoreEvent(
      parsed.data.store_id,
      `call-${parsed.data.call_id}`,
      parsed.data.event_type,
      parsed.data.payload
    );
    res.status(201).json({ id: event.id });
  }));

  // --- TwiML endpoints for Twilio webhooks ---
  // Twilio sends webhooks as application/x-www-form-urlencoded, not JSON.
  const urlencodedParser = express.urlencoded({ extended: false });

  app.post('/api/telephony/twiml-answer', urlencodedParser, asyncRoute(async (req, res) => {
    const calledNumber = req.body?.Called ?? req.body?.To ?? '';
    const callerNumber = req.body?.From ?? '';
    const callSid = req.body?.CallSid ?? '';

    const store = await db.getStoreByPhone(calledNumber);
    if (!store) {
      res.type('text/xml').send(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, this number is not configured.</Say><Hangup/></Response>'
      );
      return;
    }

    const callWorkerHost = process.env.CALL_WORKER_HOST ?? `localhost:${process.env.PORT ?? 3000}`;
    const protocol = callWorkerHost.includes('localhost') ? 'ws' : 'wss';
    res.type('text/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<Response>` +
        `<Connect>` +
          `<Stream url="${protocol}://${callWorkerHost}/media-stream">` +
            `<Parameter name="store_id" value="${store.id}" />` +
            `<Parameter name="store_name" value="${store.name}" />` +
            `<Parameter name="caller_phone" value="${callerNumber}" />` +
          `</Stream>` +
        `</Connect>` +
      `</Response>`
    );

    safeLog('info', 'twiml_answer', {
      callSid,
      storeId: store.id,
      callerPhone: callerNumber
    });
  }));

  app.post('/api/telephony/twiml-transfer', urlencodedParser, asyncRoute(async (req, res) => {
    const storeId = (req.query.store_id as string) ?? '';
    const store = await db.getStoreById(storeId);
    const phone = store?.publicPhone ?? '';
    if (!phone) {
      res.type('text/xml').send(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, we are unable to transfer your call right now.</Say><Hangup/></Response>'
      );
      return;
    }
    res.type('text/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Dial>${phone}</Dial></Response>`
    );
  }));

  app.post('/api/telephony/twiml-error', urlencodedParser, (_req, res) => {
    res.type('text/xml').send(
      '<?xml version="1.0" encoding="UTF-8"?><Response>' +
      '<Say>Sorry, we are experiencing technical difficulties. Please try calling again.</Say>' +
      '<Hangup/></Response>'
    );
  });


  app.use(errorMiddleware);

  return { app, db, orderService, authService };
}

function allowStoreScope(authStoreId: string | undefined, targetStoreId: string, res: express.Response): boolean {
  if (!authStoreId) {
    return true;
  }

  if (authStoreId !== targetStoreId) {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'store scope mismatch' } });
    return false;
  }

  return true;
}

function allowServiceToken(
  req: express.Request,
  res: express.Response,
  configuredToken: string | undefined,
  headerName: string
): boolean {
  if (!configuredToken) {
    return true;
  }

  const provided = req.header(headerName);
  if (provided !== configuredToken) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'invalid service token' } });
    return false;
  }

  return true;
}

