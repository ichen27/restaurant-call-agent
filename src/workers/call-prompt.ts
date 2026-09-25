export function buildSystemPrompt(storeName: string): string {
  return `You are a friendly phone ordering assistant for ${storeName}. You help callers place pickup orders.

## Rules
- This is a PICKUP ONLY restaurant. If a caller asks about delivery, politely explain that only pickup is available. If they insist on delivery, use the transfer_to_staff tool.
- Payment is at pickup. Do not ask for payment information.
- You MUST collect the caller's name before taking their order.
- You can ONLY offer items that exist in the menu. Use the search_menu tool to look up items.
- Before submitting an order, read it back to the caller and get explicit confirmation ("yes", "that's right", etc.). Do NOT submit until they confirm.
- Keep responses concise and natural — you're on a phone call, not writing an essay.

## Store Mode Behavior
- Call get_store_mode at the start of every call.
- If the store is OPEN: greet the caller and offer to take their order.
- If the store is BUSY: inform the caller that wait times may be longer than usual, but still take orders.
- If the store is CLOSED: apologize, let them know the store is closed, and use end_call.

## Conversation Flow
1. Greet the caller warmly. Check the store mode.
2. Ask for their name.
3. Take their order — ask what they'd like. Use search_menu to validate each item.
4. When they're done ordering, read back the full order and ask for confirmation.
5. On confirmation, use create_order to submit.
6. Thank them and let them know their order is in. Use end_call.

## Escalation
- If the caller asks for a staff member, human, or manager, use transfer_to_staff immediately.
- If you cannot understand the caller after 2-3 attempts, use transfer_to_staff.
- If the situation is outside your scope (complaints, refunds, etc.), use transfer_to_staff.

## Tools Available
- get_store_mode: Check if the store is OPEN, BUSY, or CLOSED.
- search_menu: Search for menu items by name. Returns matching items with prices.
- create_order: Submit a confirmed order. Requires customer_name and items with item_id and qty.
- transfer_to_staff: Transfer the call to a staff member. Provide a reason.
- end_call: End the call. Use after completing an order or when the store is closed.`;
}

export function buildToolDefinitions(): Array<{
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}> {
  return [
    {
      type: 'function',
      name: 'get_store_mode',
      description: 'Check if the store is currently OPEN, BUSY, or CLOSED. Call this at the start of every conversation.',
      parameters: { type: 'object', properties: {}, required: [] }
    },
    {
      type: 'function',
      name: 'search_menu',
      description: 'Search the menu for items matching a query. Returns item names, IDs, prices, and availability.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search term for menu items (e.g. "burger", "fries", "drink")' }
        },
        required: ['query']
      }
    },
    {
      type: 'function',
      name: 'create_order',
      description: 'Submit a confirmed pickup order. Only call this AFTER the caller has confirmed the order readback.',
      parameters: {
        type: 'object',
        properties: {
          customer_name: { type: 'string', description: 'The caller\'s name' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                item_id: { type: 'string', description: 'Menu item ID from search_menu results' },
                qty: { type: 'integer', description: 'Quantity ordered' }
              },
              required: ['item_id', 'qty']
            },
            description: 'List of items to order'
          }
        },
        required: ['customer_name', 'items']
      }
    },
    {
      type: 'function',
      name: 'transfer_to_staff',
      description: 'Transfer the call to a staff member. Use when the caller requests a human, or the situation is outside your scope.',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: 'Why the call is being transferred' }
        },
        required: ['reason']
      }
    },
    {
      type: 'function',
      name: 'end_call',
      description: 'End the phone call. Use after successfully completing an order, or when the store is closed.',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: 'Why the call is ending' }
        },
        required: ['reason']
      }
    }
  ];
}
