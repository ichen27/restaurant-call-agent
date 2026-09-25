import type { CallSession, MenuItem, Order, OrderEvent, OrderStatus, OutboxEvent, OutboxStatus, Store, StoreMode } from '../types.js';
import type { AppRepository, CreateOrderInput, OutboxPublishResult, UpdateOrderStatusInput } from './repository.js';
import { configuredUsers } from '../auth/config.js';
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

export class MemoryStore implements AppRepository {
  private orderSeq = 1000;
  private eventSeq = 1;
  private outboxSeq = 1;

  readonly stores = new Map<string, Store>([
    [
      'store-1',
      {
        id: 'store-1',
        name: 'Downtown',
        timezone: 'America/New_York',
        publicPhone: '+15551231234',
        mode: 'OPEN',
        defaultPrepMins: 20
      }
    ]
  ]);

  readonly menuItems = new Map<string, MenuItem>([
    ['item-burrito', { id: 'item-burrito', storeId: 'store-1', name: 'Chicken Burrito', basePriceCents: 1299, isAvailable: true }],
    ['item-bowl', { id: 'item-bowl', storeId: 'store-1', name: 'Veggie Bowl', basePriceCents: 1199, isAvailable: true }]
  ]);

  readonly orders = new Map<string, Order>();
  readonly events: OrderEvent[] = [];
  readonly outboxEvents: OutboxEvent[] = [];
  readonly idempotency = new Map<string, string>();
  private readonly callSessions = new Map<string, CallSession>();
  private readonly authUsers = new Map<string, AuthCredentialRecord>(
    configuredUsers().map((user) => [`${user.storeId}:${user.email.toLowerCase()}`, user])
  );

  async getStoreById(storeId: string): Promise<Store | undefined> {
    return this.stores.get(storeId);
  }

  async getMenu(storeId: string): Promise<MenuItem[]> {
    return [...this.menuItems.values()].filter((item) => item.storeId === storeId);
  }

  async setItemAvailability(itemId: string, isAvailable: boolean): Promise<MenuItem | undefined> {
    const item = this.menuItems.get(itemId);
    if (!item) return undefined;
    item.isAvailable = isAvailable;
    return item;
  }

  async setStoreMode(storeId: string, mode: StoreMode): Promise<StoreMode | undefined> {
    const store = this.stores.get(storeId);
    if (!store) return undefined;
    store.mode = mode;
    return store.mode;
  }

  async getStoreMode(storeId: string): Promise<StoreMode> {
    return this.stores.get(storeId)?.mode ?? 'CLOSED';
  }

  async getStoreByPhone(_phone: string): Promise<Store | undefined> {
    return undefined;
  }

  async getOrderByIdempotencyKey(storeId: string, key: string): Promise<Order | undefined> {
    const id = this.idempotency.get(`${storeId}:${key}`);
    return id ? this.orders.get(id) : undefined;
  }

  async createOrder(input: CreateOrderInput): Promise<Order> {
    const existingOrderId = this.idempotency.get(`${input.storeId}:${input.idempotencyKey}`);
    if (existingOrderId) {
      const existing = this.orders.get(existingOrderId);
      if (!existing) throw new Error('idempotency key points to missing order');
      return existing;
    }

    const now = new Date().toISOString();
    const orderId = `order-${this.orderSeq}`;
    const order: Order = {
      id: orderId,
      orderNumber: this.orderSeq,
      storeId: input.storeId,
      status: 'NEW',
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      items: input.items,
      totalCents: input.totalCents,
      createdAt: now,
      updatedAt: now,
      ackedClientIds: []
    };
    if (input.notes) {
      order.notes = input.notes;
    }
    if (input.callId) {
      order.callId = input.callId;
    }

    this.orderSeq += 1;
    this.orders.set(orderId, order);
    this.idempotency.set(`${input.storeId}:${input.idempotencyKey}`, orderId);
    this.appendEvent(order.storeId, order.id, 'OrderCreated', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status
    });

    return order;
  }

  async listOrders(storeId: string, statuses?: OrderStatus[]): Promise<Order[]> {
    return [...this.orders.values()].filter((order) => {
      const inStore = order.storeId === storeId;
      const inStatus = !statuses || statuses.includes(order.status);
      return inStore && inStatus;
    });
  }

  async getOrderById(orderId: string): Promise<Order | undefined> {
    return this.orders.get(orderId);
  }

  async getEventsForOrder(orderId: string): Promise<OrderEvent[]> {
    return this.events.filter((event) => event.orderId === orderId);
  }

  async updateOrderStatus(orderId: string, nextStatus: OrderStatus, actorId: string, input?: UpdateOrderStatusInput): Promise<Order> {
    const order = this.orders.get(orderId);
    if (!order) throw new Error('order not found');
    const allowed = STATUS_TRANSITIONS[order.status];
    if (!allowed.includes(nextStatus)) {
      throw new Error(`invalid transition: ${order.status} -> ${nextStatus}`);
    }
    if (nextStatus === 'REJECTED' && !input?.rejectReason) {
      throw new Error('reject reason required');
    }
    order.status = nextStatus;
    order.updatedAt = new Date().toISOString();
    if (input?.note) {
      order.notes = input.note;
    }
    if (input?.promisedTime) {
      order.promisedTime = input.promisedTime;
    }
    if (input?.rejectReason) {
      order.rejectReason = input.rejectReason;
    }
    this.appendEvent(order.storeId, order.id, 'OrderStatusChanged', {
      actorId,
      status: nextStatus,
      ...(input?.rejectReason ? { rejectReason: input.rejectReason } : {}),
      ...(input?.note ? { note: input.note } : {}),
      ...(input?.promisedTime ? { promisedTime: input.promisedTime } : {})
    });
    return order;
  }

  async ackOrder(orderId: string, clientId: string): Promise<boolean> {
    const order = this.orders.get(orderId);
    if (!order) throw new Error('order not found');
    if (!order.ackedClientIds.includes(clientId)) {
      order.ackedClientIds.push(clientId);
      this.appendEvent(order.storeId, order.id, 'OrderAcked', { clientId });
    }
    return true;
  }

  async getEventsSince(storeId: string, sinceId: number): Promise<OrderEvent[]> {
    return this.events.filter((event) => event.storeId === storeId && event.id > sinceId);
  }

  async appendStoreEvent(storeId: string, aggregateId: string, eventType: string, payload: Record<string, unknown>): Promise<OrderEvent> {
    return this.appendEvent(storeId, aggregateId, eventType, payload);
  }

  async listOutbox(storeId?: string, status?: OutboxStatus): Promise<OutboxEvent[]> {
    return this.outboxEvents.filter((event) => {
      const storeMatch = !storeId || event.storeId === storeId;
      const statusMatch = !status || event.status === status;
      return storeMatch && statusMatch;
    });
  }

  async listOutboxDue(limit: number, storeId?: string): Promise<OutboxEvent[]> {
    const now = Date.now();
    return this.outboxEvents
      .filter((event) => {
        const storeMatch = !storeId || event.storeId === storeId;
        const statusMatch = event.status === 'PENDING' || event.status === 'FAILED';
        const due = new Date(event.nextAttemptAt).getTime() <= now;
        return storeMatch && statusMatch && due;
      })
      .sort((a, b) => a.id - b.id)
      .slice(0, limit);
  }

  async publishOutbox(storeId?: string, limit = 100): Promise<OutboxPublishResult> {
    const selected = this.outboxEvents
      .filter((event) => event.status === 'PENDING' && (!storeId || event.storeId === storeId))
      .slice(0, limit);

    const now = new Date().toISOString();
    for (const event of selected) {
      event.status = 'SENT';
      event.attempts += 1;
      event.sentAt = now;
      event.nextAttemptAt = now;
    }

    return { publishedCount: selected.length, events: selected };
  }

  async markOutboxSent(eventId: number): Promise<OutboxEvent | undefined> {
    const event = this.outboxEvents.find((entry) => entry.id === eventId);
    if (!event) return undefined;
    event.status = 'SENT';
    event.attempts += 1;
    const now = new Date().toISOString();
    event.sentAt = now;
    event.nextAttemptAt = now;
    return event;
  }

  async markOutboxFailed(eventId: number, nextAttemptAt: string): Promise<OutboxEvent | undefined> {
    const event = this.outboxEvents.find((entry) => entry.id === eventId);
    if (!event) return undefined;
    event.status = 'FAILED';
    event.attempts += 1;
    event.nextAttemptAt = nextAttemptAt;
    delete event.sentAt;
    return event;
  }

  async markOutboxDeadLetter(eventId: number): Promise<OutboxEvent | undefined> {
    const event = this.outboxEvents.find((entry) => entry.id === eventId);
    if (!event) return undefined;
    event.status = 'DEAD_LETTER';
    return event;
  }

  async replayDeadLetters(storeId?: string, limit = 100): Promise<OutboxEvent[]> {
    const selected = this.outboxEvents
      .filter((event) => event.status === 'DEAD_LETTER' && (!storeId || event.storeId === storeId))
      .slice(0, limit);
    const now = new Date().toISOString();
    for (const event of selected) {
      event.status = 'FAILED';
      event.nextAttemptAt = now;
    }
    return selected;
  }

  async getCallSession(callId: string): Promise<CallSession | undefined> {
    return this.callSessions.get(callId);
  }

  async getAuthUserByEmail(storeId: string, email: string): Promise<AuthCredentialRecord | undefined> {
    return this.authUsers.get(`${storeId}:${email.toLowerCase()}`);
  }

  async setCallSession(session: CallSession): Promise<void> {
    this.callSessions.set(session.callId, session);
  }

  private appendEvent(storeId: string, orderId: string, eventType: string, payload: Record<string, unknown>): OrderEvent {
    const event: OrderEvent = {
      id: this.eventSeq,
      storeId,
      orderId,
      eventType,
      payload,
      createdAt: new Date().toISOString()
    };

    this.events.push(event);
    this.outboxEvents.push({
      id: this.outboxSeq,
      storeId,
      aggregateType: 'ORDER',
      aggregateId: orderId,
      eventType,
      payload,
      status: 'PENDING',
      attempts: 0,
      createdAt: event.createdAt,
      nextAttemptAt: event.createdAt
    });

    this.eventSeq += 1;
    this.outboxSeq += 1;
    return event;
  }
}
