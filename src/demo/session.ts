import { randomUUID } from 'node:crypto';
import { MemoryStore } from '../store/memory.js';
import { OrderService } from '../orderService.js';
import { priceMenuOrder } from '../menuOrder.js';
import type { OrderStatus } from '../types.js';

export type Scenario = 'pickup' | 'unavailable' | 'handoff';
type Message = { role: 'agent' | 'caller'; text: string };
type Call = {
  id: string;
  scenario: Scenario;
  cursor: number;
  phase: 'talking' | 'confirmation' | 'complete' | 'handoff';
  messages: Message[];
  orderId?: string;
};
const basket = [
  { item_id: 'sesame-chicken', qty: 2 },
  { item_id: 'spring-rolls', qty: 1 }
];
const menu = [
  ['sesame-chicken', 'Sesame chicken', 1450],
  ['pepper-tofu', 'Black pepper tofu', 1250],
  ['vegetable-noodles', 'Vegetable lo mein', 1150],
  ['spring-rolls', 'Vegetable spring rolls', 650],
  ['fried-rice', 'House fried rice', 1050],
  ['dumplings', 'Pan-fried dumplings', 850],
  ['jasmine-tea', 'Jasmine iced tea', 300]
] as const;

export class DemoSession {
  readonly db = new MemoryStore();
  readonly service = new OrderService(this.db);
  call: Call | null = null;
  private script: Message[] = [];
  readonly createdAt: number;
  constructor(now: number) {
    this.createdAt = now;
  }

  async seed() {
    this.db.stores.set('store-1', {
      id: 'store-1',
      name: 'Golden Wok',
      timezone: 'America/New_York',
      publicPhone: '+15555550100',
      mode: 'OPEN',
      defaultPrepMins: 20
    });
    this.db.menuItems.clear();
    for (const [id, name, price] of menu)
      this.db.menuItems.set(id, { id, name, basePriceCents: price, storeId: 'store-1', isAvailable: true });
    for (const [index, [name, item, progress]] of [
      ['Nora Kim', 'sesame-chicken', 0],
      ['Daniel Park', 'pepper-tofu', 2],
      ['Maya Chen', 'vegetable-noodles', 3],
      ['Chris Lee', 'fried-rice', 1]
    ].entries()) {
      const priced = priceMenuOrder(await this.db.getMenu('store-1'), [{ item_id: String(item), qty: 2 }]);
      const order = await this.service.createOrder({
        storeId: 'store-1',
        idempotencyKey: 'seed-' + index,
        customerName: String(name),
        customerPhone: '+1555555010' + index,
        ...priced,
        notes: 'Synthetic sample order'
      });
      order.createdAt = new Date(Date.now() - (index + 2) * 60000).toISOString();
      for (const status of (['ACCEPTED', 'IN_PROGRESS', 'READY'] as const).slice(0, Number(progress))) {
        await this.service.updateStatus(order.id, status, 'demo-staff');
      }
    }
  }

  async snapshot() {
    return {
      store: await this.db.getStoreById('store-1'),
      menu: await this.db.getMenu('store-1'),
      orders: [...(await this.db.listOrders('store-1'))].reverse(),
      events: await this.db.getEventsSince('store-1', 0),
      call: this.call
    };
  }

  async start(scenario: Scenario) {
    if (this.call?.phase === 'talking' || this.call?.phase === 'confirmation')
      throw new Error('Finish or reset the current call first.');
    if (scenario === 'unavailable') await this.db.setItemAvailability('sesame-chicken', false);
    const greeting: Message = {
      role: 'agent',
      text: 'Thanks for calling Golden Wok. What can I get started for you?'
    };
    this.script =
      scenario === 'pickup'
        ? [
            greeting,
            {
              role: 'caller',
              text: 'Hi! Two sesame chickens and an order of vegetable spring rolls for pickup, please.'
            },
            { role: 'agent', text: 'Let me check the menu. And what name should I put on the order?' },
            { role: 'caller', text: 'Alex, thank you.' },
            {
              role: 'agent',
              text: 'Two sesame chickens and one vegetable spring roll appetizer. That’s $35.50, pay at pickup. Shall I place that order?'
            }
          ]
        : scenario === 'unavailable'
          ? [
              greeting,
              { role: 'caller', text: 'Could I get sesame chicken?' },
              {
                role: 'agent',
                text: 'Sesame chicken is unavailable right now. Black pepper tofu is available, or I can connect you with the team.'
              },
              { role: 'caller', text: 'I’d like to speak with someone, please.' },
              {
                role: 'agent',
                text: 'Of course. I’m passing your request to the team. No order has been placed.'
              }
            ]
          : [
              greeting,
              { role: 'caller', text: 'I have a food allergy. Can I speak with someone at the restaurant?' },
              {
                role: 'agent',
                text: 'Absolutely. A staff member can help with your allergy questions. I’m passing along your request; no order has been placed.'
              }
            ];
    this.call = { id: randomUUID(), scenario, cursor: 1, phase: 'talking', messages: [greeting] };
    return this.snapshot();
  }

  async next(step: number) {
    const call = this.call;
    if (!call) throw new Error('Start a sample call first.');
    if (step < call.cursor || call.phase !== 'talking') return this.snapshot();
    if (step !== call.cursor) throw new Error('The conversation changed. Refresh and try again.');
    const message = this.script[call.cursor];
    if (message) {
      call.messages.push(message);
      call.cursor++;
    }
    if (call.cursor === this.script.length) {
      call.phase = call.scenario === 'pickup' ? 'confirmation' : 'handoff';
      if (call.phase === 'handoff')
        await this.db.appendStoreEvent('store-1', 'call-' + call.id, 'CallHandoffRequested', {
          reason:
            call.scenario === 'unavailable'
              ? 'Unavailable item; customer requested staff'
              : 'Customer requested allergy assistance',
          simulated: true
        });
    }
    return this.snapshot();
  }

  async confirm(callId: string) {
    const call = this.call;
    if (!call || call.id !== callId || !['confirmation', 'complete'].includes(call.phase)) {
      throw new Error('The caller must review and confirm the order first.');
    }
    if (call.orderId) return this.snapshot();
    const store = await this.db.getStoreById('store-1');
    if (store?.mode === 'CLOSED') throw new Error('The restaurant is closed. Please contact the team.');
    const priced = priceMenuOrder(await this.db.getMenu('store-1'), basket);
    const order = await this.service.createOrder({
      storeId: 'store-1',
      idempotencyKey: 'call-' + call.id,
      customerName: 'Alex Morgan',
      customerPhone: '+15555550109',
      callId: call.id,
      ...priced
    });
    if (!call.orderId) {
      call.orderId = order.id;
      call.phase = 'complete';
      call.messages.push({
        role: 'agent',
        text:
          'You’re all set, Alex. Order #' +
          order.orderNumber +
          ' will be ready in about ' +
          (store?.mode === 'BUSY' ? 35 : 20) +
          ' minutes. See you soon!'
      });
    }
    return this.snapshot();
  }

  async updateOrder(id: string, status: OrderStatus) {
    await this.service.updateStatus(
      id,
      status,
      'demo-staff',
      status === 'REJECTED' ? { rejectReason: 'UNABLE_TO_FULFILL' } : undefined
    );
    return this.snapshot();
  }
}
