import type { CallSession, MenuItem, Order, OrderEvent, OrderItemInput, OrderStatus, OutboxEvent, OutboxStatus, Store, StoreMode } from '../types.js';
import type { AuthCredentialRecord } from '../auth/types.js';

export interface CreateOrderInput {
  storeId: string;
  customerName: string;
  customerPhone: string;
  items: OrderItemInput[];
  totalCents: number;
  notes?: string;
  callId?: string;
  idempotencyKey: string;
}

export interface OutboxPublishResult {
  publishedCount: number;
  events: OutboxEvent[];
}

export interface UpdateOrderStatusInput {
  rejectReason?: string;
  note?: string;
  promisedTime?: string;
}

export interface AppRepository {
  getStoreById(storeId: string): Promise<Store | undefined>;
  getMenu(storeId: string): Promise<MenuItem[]>;
  setItemAvailability(itemId: string, isAvailable: boolean): Promise<MenuItem | undefined>;
  setStoreMode(storeId: string, mode: StoreMode): Promise<StoreMode | undefined>;
  getStoreMode(storeId: string): Promise<StoreMode>;
  getStoreByPhone(phone: string): Promise<Store | undefined>;

  getOrderByIdempotencyKey(storeId: string, key: string): Promise<Order | undefined>;
  createOrder(input: CreateOrderInput): Promise<Order>;
  listOrders(storeId: string, statuses?: OrderStatus[]): Promise<Order[]>;
  getOrderById(orderId: string): Promise<Order | undefined>;
  getEventsForOrder(orderId: string): Promise<OrderEvent[]>;
  updateOrderStatus(orderId: string, nextStatus: OrderStatus, actorId: string, input?: UpdateOrderStatusInput): Promise<Order>;
  ackOrder(orderId: string, clientId: string): Promise<boolean>;
  getEventsSince(storeId: string, sinceId: number): Promise<OrderEvent[]>;
  appendStoreEvent(storeId: string, aggregateId: string, eventType: string, payload: Record<string, unknown>): Promise<OrderEvent>;

  listOutbox(storeId?: string, status?: OutboxStatus): Promise<OutboxEvent[]>;
  listOutboxDue(limit: number, storeId?: string): Promise<OutboxEvent[]>;
  publishOutbox(storeId?: string, limit?: number): Promise<OutboxPublishResult>;
  markOutboxSent(eventId: number): Promise<OutboxEvent | undefined>;
  markOutboxFailed(eventId: number, nextAttemptAt: string): Promise<OutboxEvent | undefined>;
  markOutboxDeadLetter(eventId: number): Promise<OutboxEvent | undefined>;
  replayDeadLetters(storeId?: string, limit?: number): Promise<OutboxEvent[]>;

  getAuthUserByEmail(storeId: string, email: string): Promise<AuthCredentialRecord | undefined>;
  getCallSession(callId: string): Promise<CallSession | undefined>;
  setCallSession(session: CallSession): Promise<void>;
}
