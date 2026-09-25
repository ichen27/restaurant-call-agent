import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import type { CallSession, MenuItem, Order, OrderEvent, OrderItemInput, OrderStatus, OutboxEvent, OutboxStatus, Store, StoreMode } from '../types.js';
import type { AppRepository, CreateOrderInput, OutboxPublishResult, UpdateOrderStatusInput } from './repository.js';
import type { AuthCredentialRecord } from '../auth/types.js';

const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  NEW: ['ACCEPTED', 'REJECTED', 'CANCELED'],
  ACCEPTED: ['IN_PROGRESS', 'CANCELED'],
  IN_PROGRESS: ['READY', 'CANCELED'],
  READY: ['COMPLETED', 'CANCELED'],
  COMPLETED: [],
  REJECTED: [],
  CANCELED: []
};

interface OrderRow extends QueryResultRow {
  id: string;
  order_number: number;
  store_id: string;
  status: OrderStatus;
  customer_name: string;
  customer_phone: string;
  total_cents: number;
  notes: string | null;
  promised_time: string | null;
  reject_reason: string | null;
  call_id: string | null;
  created_at: string;
  updated_at: string;
}

interface StoreRow extends QueryResultRow {
  id: string;
  name: string;
  timezone: string;
  public_phone: string;
  mode: StoreMode;
  default_prep_mins: number;
}

interface OrderItemRow extends QueryResultRow {
  item_id: string;
  item_name_snapshot: string;
  qty: number;
  base_price_cents: number;
  modifiers_snapshot_json: Array<Record<string, string | number>>;
  special_instructions: string | null;
  line_total_cents: number;
}

interface StaffUserRow extends QueryResultRow {
  id: string;
  store_id: string;
  email: string;
  role: 'STAFF' | 'MANAGER';
  password_hash: string;
  is_active: boolean;
}

export class PostgresStore implements AppRepository {
  constructor(private readonly pool: Pool) {}

  asyncHealthCheck(): Promise<unknown> {
    return this.pool.query('SELECT 1');
  }

  async getStoreById(storeId: string): Promise<Store | undefined> {
    const result = await this.pool.query<StoreRow>(
      `SELECT id, name, timezone, public_phone, mode, default_prep_mins
       FROM stores
       WHERE id = $1`,
      [storeId]
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      id: row.id,
      name: row.name,
      timezone: row.timezone,
      publicPhone: row.public_phone,
      mode: row.mode,
      defaultPrepMins: row.default_prep_mins
    };
  }

  async getMenu(storeId: string): Promise<MenuItem[]> {
    const result = await this.pool.query(
      `SELECT id, store_id, name, base_price_cents, is_available
       FROM menu_items
       WHERE store_id = $1`,
      [storeId]
    );
    return result.rows.map((row) => ({
      id: String(row.id),
      storeId: String(row.store_id),
      name: String(row.name),
      basePriceCents: Number(row.base_price_cents),
      isAvailable: Boolean(row.is_available)
    }));
  }

  async setItemAvailability(itemId: string, isAvailable: boolean): Promise<MenuItem | undefined> {
    const result = await this.pool.query(
      `UPDATE menu_items
       SET is_available = $1
       WHERE id = $2
       RETURNING id, store_id, name, base_price_cents, is_available`,
      [isAvailable, itemId]
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      id: String(row.id),
      storeId: String(row.store_id),
      name: String(row.name),
      basePriceCents: Number(row.base_price_cents),
      isAvailable: Boolean(row.is_available)
    };
  }

  async setStoreMode(storeId: string, mode: StoreMode): Promise<StoreMode | undefined> {
    const result = await this.pool.query('UPDATE stores SET mode = $1 WHERE id = $2 RETURNING mode', [mode, storeId]);
    const row = result.rows[0];
    return row ? (row.mode as StoreMode) : undefined;
  }

  async getStoreMode(storeId: string): Promise<StoreMode> {
    const result = await this.pool.query('SELECT mode FROM stores WHERE id = $1', [storeId]);
    const row = result.rows[0];
    return row ? (row.mode as StoreMode) : 'CLOSED';
  }

  async getStoreByPhone(phone: string): Promise<Store | undefined> {
    const result = await this.pool.query<StoreRow>(
      `SELECT s.id, s.name, s.timezone, s.public_phone, s.mode, s.default_prep_mins
       FROM stores s
       JOIN phone_numbers pn ON pn.store_id = s.id
       WHERE pn.phone_number = $1`,
      [phone]
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      id: row.id,
      name: row.name,
      timezone: row.timezone,
      publicPhone: row.public_phone,
      mode: row.mode as StoreMode,
      defaultPrepMins: row.default_prep_mins
    };
  }

  async getOrderByIdempotencyKey(storeId: string, key: string): Promise<Order | undefined> {
    const result = await this.pool.query<{ order_id: string }>(
      'SELECT order_id FROM idempotency_keys WHERE store_id = $1 AND key = $2', [storeId, key]
    );
    return result.rows[0] ? this.getOrderByIdAsync(result.rows[0].order_id) : undefined;
  }

  createOrder(input: CreateOrderInput): Promise<Order> {
    return this.createOrderAsync(input);
  }

  async listOrders(storeId: string, statuses?: OrderStatus[]): Promise<Order[]> {
    const values: unknown[] = [storeId];
    let where = 'WHERE store_id = $1';
    if (statuses && statuses.length > 0) {
      values.push(statuses);
      where += ` AND status = ANY($${values.length}::text[])`;
    }

    const result = await this.pool.query<OrderRow>(`SELECT * FROM orders ${where} ORDER BY order_number DESC`, values);
    const orders: Order[] = [];
    for (const row of result.rows) {
      const items = await this.getOrderItemsAsync(row.id);
      const events = await this.getEventsForOrderAsync(row.id);
      const ackedClientIds = events
        .filter((event) => event.eventType === 'OrderAcked')
        .map((event) => event.payload.clientId)
        .filter((value): value is string => typeof value === 'string');
      orders.push(this.toOrder(row, items, ackedClientIds));
    }
    return orders;
  }

  getOrderById(orderId: string): Promise<Order | undefined> {
    return this.getOrderByIdAsync(orderId);
  }

  getEventsForOrder(orderId: string): Promise<OrderEvent[]> {
    return this.getEventsForOrderAsync(orderId);
  }

  updateOrderStatus(orderId: string, nextStatus: OrderStatus, actorId: string, input?: UpdateOrderStatusInput): Promise<Order> {
    return this.updateOrderStatusAsync(orderId, nextStatus, actorId, input);
  }

  ackOrder(orderId: string, clientId: string): Promise<boolean> {
    return this.ackOrderAsync(orderId, clientId);
  }

  getEventsSince(storeId: string, sinceId: number): Promise<OrderEvent[]> {
    return this.getEventsSinceAsync(storeId, sinceId);
  }

  appendStoreEvent(storeId: string, aggregateId: string, eventType: string, payload: Record<string, unknown>): Promise<OrderEvent> {
    return this.appendStoreEventAsync(storeId, aggregateId, eventType, payload);
  }

  listOutbox(storeId?: string, status?: OutboxStatus): Promise<OutboxEvent[]> {
    return this.listOutboxAsync(storeId, status);
  }

  listOutboxDue(limit: number, storeId?: string): Promise<OutboxEvent[]> {
    return this.listOutboxDueAsync(limit, storeId);
  }

  publishOutbox(storeId?: string, limit?: number): Promise<OutboxPublishResult> {
    return this.publishOutboxAsync(storeId, limit);
  }

  async markOutboxSent(eventId: number): Promise<OutboxEvent | undefined> {
    const result = await this.pool.query(
      `UPDATE outbox_events
       SET status = 'SENT', attempts = attempts + 1, next_attempt_at = now(), sent_at = now()
       WHERE id = $1
       RETURNING id, store_id, aggregate_id, event_type, payload_json, status, attempts, created_at, next_attempt_at, sent_at`,
      [eventId]
    );
    const row = result.rows[0];
    if (!row) return undefined;
    const event: OutboxEvent = {
      id: Number(row.id),
      storeId: String(row.store_id),
      aggregateType: 'ORDER',
      aggregateId: String(row.aggregate_id),
      eventType: String(row.event_type),
      payload: row.payload_json as Record<string, unknown>,
      status: row.status as OutboxStatus,
      attempts: Number(row.attempts),
      createdAt: String(row.created_at),
      nextAttemptAt: String(row.next_attempt_at)
    };
    if (row.sent_at) {
      event.sentAt = String(row.sent_at);
    }
    return event;
  }

  async markOutboxFailed(eventId: number, nextAttemptAt: string): Promise<OutboxEvent | undefined> {
    const result = await this.pool.query(
      `UPDATE outbox_events
       SET status = 'FAILED', attempts = attempts + 1, next_attempt_at = $2, sent_at = NULL
       WHERE id = $1
       RETURNING id, store_id, aggregate_id, event_type, payload_json, status, attempts, created_at, next_attempt_at, sent_at`,
      [eventId, nextAttemptAt]
    );
    const row = result.rows[0];
    if (!row) return undefined;
    const event: OutboxEvent = {
      id: Number(row.id),
      storeId: String(row.store_id),
      aggregateType: 'ORDER',
      aggregateId: String(row.aggregate_id),
      eventType: String(row.event_type),
      payload: row.payload_json as Record<string, unknown>,
      status: row.status as OutboxStatus,
      attempts: Number(row.attempts),
      createdAt: String(row.created_at),
      nextAttemptAt: String(row.next_attempt_at)
    };
    if (row.sent_at) {
      event.sentAt = String(row.sent_at);
    }
    return event;
  }

  async markOutboxDeadLetter(eventId: number): Promise<OutboxEvent | undefined> {
    const result = await this.pool.query(
      `UPDATE outbox_events
       SET status = 'DEAD_LETTER'
       WHERE id = $1
       RETURNING id, store_id, aggregate_id, event_type, payload_json, status, attempts, created_at, next_attempt_at, sent_at`,
      [eventId]
    );
    const row = result.rows[0];
    if (!row) return undefined;
    const event: OutboxEvent = {
      id: Number(row.id),
      storeId: String(row.store_id),
      aggregateType: 'ORDER',
      aggregateId: String(row.aggregate_id),
      eventType: String(row.event_type),
      payload: row.payload_json as Record<string, unknown>,
      status: row.status as OutboxStatus,
      attempts: Number(row.attempts),
      createdAt: String(row.created_at),
      nextAttemptAt: String(row.next_attempt_at)
    };
    if (row.sent_at) {
      event.sentAt = String(row.sent_at);
    }
    return event;
  }

  async replayDeadLetters(storeId?: string, limit = 100): Promise<OutboxEvent[]> {
    const values: unknown[] = [limit];
    let whereSql = "WHERE status = 'DEAD_LETTER'";
    if (storeId) {
      values.push(storeId);
      whereSql += ` AND store_id = $${values.length}`;
    }

    const selected = await this.pool.query(
      `SELECT id
       FROM outbox_events
       ${whereSql}
       ORDER BY id ASC
       LIMIT $1`,
      values
    );
    if (selected.rows.length === 0) {
      return [];
    }
    const ids = selected.rows.map((row) => Number(row.id));
    const updated = await this.pool.query(
      `UPDATE outbox_events
       SET status = 'FAILED', next_attempt_at = now()
       WHERE id = ANY($1::bigint[])
       RETURNING id, store_id, aggregate_type, aggregate_id, event_type, payload_json, status, attempts, created_at, next_attempt_at, sent_at`,
      [ids]
    );
    return updated.rows.map((row) => {
      const event: OutboxEvent = {
        id: Number(row.id),
        storeId: String(row.store_id),
        aggregateType: 'ORDER',
        aggregateId: String(row.aggregate_id),
        eventType: String(row.event_type),
        payload: row.payload_json as Record<string, unknown>,
        status: row.status as OutboxStatus,
        attempts: Number(row.attempts),
        createdAt: String(row.created_at),
        nextAttemptAt: String(row.next_attempt_at)
      };
      if (row.sent_at) {
        event.sentAt = String(row.sent_at);
      }
      return event;
    });
  }

  getCallSession(callId: string): Promise<CallSession | undefined> {
    return this.getCallSessionAsync(callId);
  }

  async getAuthUserByEmail(storeId: string, email: string): Promise<AuthCredentialRecord | undefined> {
    const result = await this.pool.query<StaffUserRow>(
      `SELECT id, store_id, email, role, password_hash, is_active
       FROM staff_users
       WHERE store_id = $1 AND lower(email) = lower($2)`,
      [storeId, email]
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      userId: row.id,
      storeId: row.store_id,
      email: row.email,
      role: row.role,
      passwordHash: row.password_hash,
      active: row.is_active
    };
  }

  setCallSession(session: CallSession): Promise<void> {
    return this.upsertCallSessionAsync(session);
  }

  async createOrderAsync(input: CreateOrderInput): Promise<Order> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const idem = await client.query<{ order_id: string }>(
        'SELECT order_id FROM idempotency_keys WHERE store_id = $1 AND key = $2',
        [input.storeId, input.idempotencyKey]
      );

      if (idem.rows[0]?.order_id) {
        const existing = await this.getOrderByIdAsync(idem.rows[0].order_id, client);
        if (!existing) {
          throw new Error('idempotency key points to missing order');
        }
        await client.query('COMMIT');
        return existing;
      }

      const orderId = randomUUID();
      const created = await client.query<OrderRow>(
        `INSERT INTO orders (id, store_id, status, customer_name, customer_phone, total_cents, notes, call_id)
         VALUES ($1, $2, 'NEW', $3, $4, $5, $6, $7)
         RETURNING *`,
        [orderId, input.storeId, input.customerName, input.customerPhone, input.totalCents, input.notes ?? null, input.callId ?? null]
      );

      const orderRow = created.rows[0];
      if (!orderRow) {
        throw new Error('order insert failed');
      }

      for (const item of input.items) {
        await client.query(
          `INSERT INTO order_items (order_id, item_id, item_name_snapshot, qty, base_price_cents, modifiers_snapshot_json, special_instructions, line_total_cents)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
          [
            orderRow.id,
            item.itemId,
            item.itemNameSnapshot,
            item.qty,
            item.basePriceCents,
            JSON.stringify(item.modifiersSnapshotJson),
            item.specialInstructions ?? null,
            item.lineTotalCents
          ]
        );
      }

      await client.query('INSERT INTO idempotency_keys (store_id, key, order_id) VALUES ($1, $2, $3)', [
        input.storeId,
        input.idempotencyKey,
        orderRow.id
      ]);

      await this.appendEventAsync(client, orderRow.store_id, orderRow.id, 'OrderCreated', {
        orderId: orderRow.id,
        orderNumber: orderRow.order_number,
        status: orderRow.status
      });

      await client.query('COMMIT');
      const items = await this.getOrderItemsAsync(orderRow.id);
      return this.toOrder(orderRow, items, []);
    } catch (error) {
      await client.query('ROLLBACK');
      // A concurrent request may have committed this key while our insert waited.
      if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
        const winner = await client.query<{ order_id: string }>(
          'SELECT order_id FROM idempotency_keys WHERE store_id = $1 AND key = $2',
          [input.storeId, input.idempotencyKey]
        );
        if (winner.rows[0]) {
          const existing = await this.getOrderByIdAsync(winner.rows[0].order_id, client);
          if (existing) return existing;
        }
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async getOrderByIdAsync(orderId: string, txClient?: PoolClient): Promise<Order | undefined> {
    const client = txClient ?? (await this.pool.connect());
    try {
      const orderRes = await client.query<OrderRow>('SELECT * FROM orders WHERE id = $1', [orderId]);
      const row = orderRes.rows[0];
      if (!row) return undefined;
      const [items, events] = await Promise.all([this.getOrderItemsAsync(orderId), this.getEventsForOrderAsync(orderId)]);
      const ackedClientIds = events
        .filter((event) => event.eventType === 'OrderAcked')
        .map((event) => event.payload.clientId)
        .filter((value): value is string => typeof value === 'string');
      return this.toOrder(row, items, ackedClientIds);
    } finally {
      if (!txClient) {
        client.release();
      }
    }
  }

  async listOutboxAsync(storeId?: string, status?: OutboxStatus): Promise<OutboxEvent[]> {
    const values: unknown[] = [];
    const where: string[] = [];

    if (storeId) {
      values.push(storeId);
      where.push(`store_id = $${values.length}`);
    }
    if (status) {
      values.push(status);
      where.push(`status = $${values.length}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const result = await this.pool.query(
      `SELECT id, store_id, aggregate_type, aggregate_id, event_type, payload_json, status, attempts, created_at, next_attempt_at, sent_at
       FROM outbox_events ${whereSql} ORDER BY id ASC`,
      values
    );

    return result.rows.map((row) => {
      const event: OutboxEvent = {
        id: Number(row.id),
        storeId: String(row.store_id),
        aggregateType: 'ORDER',
        aggregateId: String(row.aggregate_id),
        eventType: String(row.event_type),
        payload: row.payload_json as Record<string, unknown>,
        status: row.status as OutboxStatus,
        attempts: Number(row.attempts),
        createdAt: String(row.created_at),
        nextAttemptAt: String(row.next_attempt_at)
      };
      if (row.sent_at) {
        event.sentAt = String(row.sent_at);
      }
      return event;
    });
  }

  async listOutboxDueAsync(limit: number, storeId?: string): Promise<OutboxEvent[]> {
    const values: unknown[] = [limit];
    let whereSql = "WHERE status IN ('PENDING', 'FAILED') AND next_attempt_at <= now()";
    if (storeId) {
      values.push(storeId);
      whereSql += ` AND store_id = $${values.length}`;
    }

    const result = await this.pool.query(
      `SELECT id, store_id, aggregate_type, aggregate_id, event_type, payload_json, status, attempts, created_at, next_attempt_at, sent_at
       FROM outbox_events
       ${whereSql}
       ORDER BY id ASC
       LIMIT $1`,
      values
    );

    return result.rows.map((row) => {
      const event: OutboxEvent = {
        id: Number(row.id),
        storeId: String(row.store_id),
        aggregateType: 'ORDER',
        aggregateId: String(row.aggregate_id),
        eventType: String(row.event_type),
        payload: row.payload_json as Record<string, unknown>,
        status: row.status as OutboxStatus,
        attempts: Number(row.attempts),
        createdAt: String(row.created_at),
        nextAttemptAt: String(row.next_attempt_at)
      };
      if (row.sent_at) {
        event.sentAt = String(row.sent_at);
      }
      return event;
    });
  }

  async publishOutboxAsync(storeId?: string, limit = 100): Promise<OutboxPublishResult> {
    const values: unknown[] = ['PENDING'];
    let whereSql = 'WHERE status = $1';
    if (storeId) {
      values.push(storeId);
      whereSql += ` AND store_id = $${values.length}`;
    }
    values.push(limit);

    const selected = await this.pool.query(
      `SELECT id FROM outbox_events ${whereSql} ORDER BY id ASC LIMIT $${values.length}`,
      values
    );

    if (selected.rows.length === 0) {
      return { publishedCount: 0, events: [] };
    }

    const ids = selected.rows.map((row) => Number(row.id));
    const updated = await this.pool.query(
      `UPDATE outbox_events
       SET status = 'SENT', attempts = attempts + 1, next_attempt_at = now(), sent_at = now()
       WHERE id = ANY($1::bigint[])
       RETURNING id, store_id, aggregate_id, event_type, payload_json, status, attempts, created_at, next_attempt_at, sent_at`,
      [ids]
    );

    const events: OutboxEvent[] = updated.rows.map((row) => {
      const event: OutboxEvent = {
        id: Number(row.id),
        storeId: String(row.store_id),
        aggregateType: 'ORDER',
        aggregateId: String(row.aggregate_id),
        eventType: String(row.event_type),
        payload: row.payload_json as Record<string, unknown>,
        status: row.status as OutboxStatus,
        attempts: Number(row.attempts),
        createdAt: String(row.created_at),
        nextAttemptAt: String(row.next_attempt_at)
      };
      if (row.sent_at) {
        event.sentAt = String(row.sent_at);
      }
      return event;
    });

    return { publishedCount: events.length, events };
  }

  async updateOrderStatusAsync(
    orderId: string,
    nextStatus: OrderStatus,
    actorId: string,
    input?: UpdateOrderStatusInput
  ): Promise<Order> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const currentRes = await client.query<OrderRow>('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
      const current = currentRes.rows[0];
      if (!current) {
        throw new Error('order not found');
      }
      const allowed = STATUS_TRANSITIONS[current.status];
      if (!allowed.includes(nextStatus)) {
        throw new Error(`invalid transition: ${current.status} -> ${nextStatus}`);
      }
      if (nextStatus === 'REJECTED' && !input?.rejectReason) {
        throw new Error('reject reason required');
      }

      const updatedRes = await client.query<OrderRow>(
        `UPDATE orders
         SET status = $1,
             notes = COALESCE($2, notes),
             promised_time = COALESCE($3, promised_time),
             reject_reason = COALESCE($4, reject_reason),
             updated_at = now()
         WHERE id = $5
         RETURNING *`,
        [nextStatus, input?.note ?? null, input?.promisedTime ?? null, input?.rejectReason ?? null, orderId]
      );
      const updated = updatedRes.rows[0];
      if (!updated) {
        throw new Error('order update failed');
      }

      await this.appendEventAsync(client, updated.store_id, updated.id, 'OrderStatusChanged', {
        actorId,
        status: nextStatus,
        ...(input?.rejectReason ? { rejectReason: input.rejectReason } : {}),
        ...(input?.note ? { note: input.note } : {}),
        ...(input?.promisedTime ? { promisedTime: input.promisedTime } : {})
      });
      await client.query('COMMIT');

      const [items, events] = await Promise.all([this.getOrderItemsAsync(orderId), this.getEventsForOrderAsync(orderId)]);
      const ackedClientIds = events
        .filter((event) => event.eventType === 'OrderAcked')
        .map((event) => event.payload.clientId)
        .filter((value): value is string => typeof value === 'string');
      return this.toOrder(updated, items, ackedClientIds);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async ackOrderAsync(orderId: string, clientId: string): Promise<boolean> {
    const existing = await this.pool.query<{ id: number }>(
      `SELECT id
       FROM order_events
       WHERE order_id = $1 AND event_type = 'OrderAcked' AND payload_json->>'clientId' = $2
       LIMIT 1`,
      [orderId, clientId]
    );
    if (existing.rows[0]) return true;

    const order = await this.pool.query<{ id: string; store_id: string }>('SELECT id, store_id FROM orders WHERE id = $1', [orderId]);
    const row = order.rows[0];
    if (!row) throw new Error('order not found');

    const client = await this.pool.connect();
    try {
      await this.appendEventAsync(client, row.store_id, row.id, 'OrderAcked', { clientId });
    } finally {
      client.release();
    }
    return true;
  }

  async getEventsSinceAsync(storeId: string, sinceId: number): Promise<OrderEvent[]> {
    const result = await this.pool.query(
      `SELECT id, store_id, order_id, event_type, payload_json, created_at
       FROM order_events
       WHERE store_id = $1 AND id > $2
       ORDER BY id ASC`,
      [storeId, sinceId]
    );
    return result.rows.map((row) => ({
      id: Number(row.id),
      storeId: String(row.store_id),
      orderId: String(row.order_id),
      eventType: String(row.event_type),
      payload: row.payload_json as Record<string, unknown>,
      createdAt: String(row.created_at)
    }));
  }

  async getEventsForOrderAsync(orderId: string): Promise<OrderEvent[]> {
    const result = await this.pool.query(
      `SELECT id, store_id, order_id, event_type, payload_json, created_at
       FROM order_events
       WHERE order_id = $1
       ORDER BY id ASC`,
      [orderId]
    );
    return result.rows.map((row) => ({
      id: Number(row.id),
      storeId: String(row.store_id),
      orderId: String(row.order_id),
      eventType: String(row.event_type),
      payload: row.payload_json as Record<string, unknown>,
      createdAt: String(row.created_at)
    }));
  }

  async upsertCallSessionAsync(session: CallSession): Promise<void> {
    await this.pool.query(
      `INSERT INTO call_sessions (call_id, store_id, state, caller_phone, customer_name, draft_items_json, pending_clarification_json, clarification_attempts, created_order_id, handoff, ended_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10, $11)
       ON CONFLICT (call_id) DO UPDATE SET
         store_id = EXCLUDED.store_id,
         state = EXCLUDED.state,
         caller_phone = EXCLUDED.caller_phone,
         customer_name = EXCLUDED.customer_name,
         draft_items_json = EXCLUDED.draft_items_json,
         pending_clarification_json = EXCLUDED.pending_clarification_json,
         clarification_attempts = EXCLUDED.clarification_attempts,
         created_order_id = EXCLUDED.created_order_id,
         handoff = EXCLUDED.handoff,
         ended_at = EXCLUDED.ended_at`,
      [
        session.callId,
        session.storeId,
        session.state,
        session.callerPhone,
        session.customerName ?? null,
        JSON.stringify(session.draftItems),
        session.pendingClarification ? JSON.stringify(session.pendingClarification) : null,
        session.clarificationAttempts ?? 0,
        session.createdOrderId ?? null,
        session.handoff,
        session.endedAt ?? null
      ]
    );
  }

  async getCallSessionAsync(callId: string): Promise<CallSession | undefined> {
    const result = await this.pool.query(
      `SELECT call_id, store_id, state, caller_phone, customer_name, draft_items_json, pending_clarification_json, clarification_attempts, created_order_id, handoff, ended_at
       FROM call_sessions WHERE call_id = $1`,
      [callId]
    );
    const row = result.rows[0];
    if (!row) return undefined;

    const session: CallSession = {
      callId: String(row.call_id),
      storeId: String(row.store_id),
      state: String(row.state),
      callerPhone: String(row.caller_phone),
      draftItems: (row.draft_items_json as Array<{ itemId: string; itemName: string; qty: number }>) ?? [],
      handoff: Boolean(row.handoff),
      ...(row.customer_name ? { customerName: String(row.customer_name) } : {}),
      ...(row.pending_clarification_json ? { pendingClarification: row.pending_clarification_json as string[] } : {}),
      ...(typeof row.clarification_attempts === 'number' ? { clarificationAttempts: Number(row.clarification_attempts) } : {}),
      ...(row.created_order_id ? { createdOrderId: String(row.created_order_id) } : {}),
      ...(row.ended_at ? { endedAt: String(row.ended_at) } : {})
    };
    return session;
  }

  private async getOrderItemsAsync(orderId: string): Promise<OrderItemInput[]> {
    const result = await this.pool.query<OrderItemRow>(
      `SELECT item_id, item_name_snapshot, qty, base_price_cents, modifiers_snapshot_json, special_instructions, line_total_cents
       FROM order_items
       WHERE order_id = $1
       ORDER BY id ASC`,
      [orderId]
    );

    return result.rows.map((row) => ({
      itemId: row.item_id,
      itemNameSnapshot: row.item_name_snapshot,
      qty: row.qty,
      basePriceCents: row.base_price_cents,
      modifiersSnapshotJson: row.modifiers_snapshot_json,
      lineTotalCents: row.line_total_cents,
      ...(row.special_instructions ? { specialInstructions: row.special_instructions } : {})
    }));
  }

  private toOrder(row: OrderRow, items: OrderItemInput[], ackedClientIds: string[]): Order {
    const order: Order = {
      id: row.id,
      orderNumber: row.order_number,
      storeId: row.store_id,
      status: row.status,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      items,
      totalCents: row.total_cents,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ackedClientIds
    };
    if (row.notes) {
      order.notes = row.notes;
    }
    if (row.promised_time) {
      order.promisedTime = row.promised_time;
    }
    if (row.reject_reason) {
      order.rejectReason = row.reject_reason;
    }
    if (row.call_id) {
      order.callId = row.call_id;
    }
    return order;
  }

  private async appendStoreEventAsync(
    storeId: string,
    aggregateId: string,
    eventType: string,
    payload: Record<string, unknown>
  ): Promise<OrderEvent> {
    const result = await this.pool.query(
      `INSERT INTO order_events (store_id, order_id, event_type, payload_json)
       VALUES ($1, $2, $3, $4::jsonb)
       RETURNING id, store_id, order_id, event_type, payload_json, created_at`,
      [storeId, aggregateId, eventType, JSON.stringify(payload)]
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error('event insert failed');
    }

    await this.pool.query(
      `INSERT INTO outbox_events (store_id, aggregate_type, aggregate_id, event_type, payload_json, status, attempts, next_attempt_at)
       VALUES ($1, 'ORDER', $2, $3, $4::jsonb, 'PENDING', 0, now())`,
      [storeId, aggregateId, eventType, JSON.stringify(payload)]
    );

    return {
      id: Number(row.id),
      storeId: String(row.store_id),
      orderId: String(row.order_id),
      eventType: String(row.event_type),
      payload: row.payload_json as Record<string, unknown>,
      createdAt: String(row.created_at)
    };
  }

  private async appendEventAsync(client: PoolClient, storeId: string, orderId: string, eventType: string, payload: Record<string, unknown>): Promise<void> {
    await client.query(
      `INSERT INTO order_events (store_id, order_id, event_type, payload_json)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [storeId, orderId, eventType, JSON.stringify(payload)]
    );

    await client.query(
      `INSERT INTO outbox_events (store_id, aggregate_type, aggregate_id, event_type, payload_json, status, attempts, next_attempt_at)
       VALUES ($1, 'ORDER', $2, $3, $4::jsonb, 'PENDING', 0, now())`,
      [storeId, orderId, eventType, JSON.stringify(payload)]
    );
  }
}
