import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CallToolHandler } from '../src/workers/call-tools.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('CallToolHandler', () => {
  let handler: CallToolHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new CallToolHandler({
      apiBaseUrl: 'http://localhost:3000',
      internalApiKey: 'test-key',
      storeId: 'store-1',
      callerPhone: '+15559876543',
      callSid: 'CA123'
    });
  });

  describe('get_store_mode', () => {
    it('fetches store info and returns mode', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'store-1',
          name: 'Test Store',
          mode: 'OPEN',
          default_prep_mins: 15
        })
      });

      const result = await handler.execute('get_store_mode', '{}');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/internal/stores/store-1',
        expect.objectContaining({
          headers: expect.objectContaining({ 'x-internal-api-key': 'test-key' })
        })
      );
      const parsed = JSON.parse(result);
      expect(parsed.mode).toBe('OPEN');
    });
  });

  describe('search_menu', () => {
    it('fetches menu with query param', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            { id: 'item-1', name: 'Cheeseburger', basePriceCents: 999, isAvailable: true }
          ]
        })
      });

      const result = await handler.execute('search_menu', JSON.stringify({ query: 'burger' }));
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/internal/stores/store-1/menu?q=burger',
        expect.any(Object)
      );
      const parsed = JSON.parse(result);
      expect(parsed.items).toHaveLength(1);
      expect(parsed.items[0].name).toBe('Cheeseburger');
    });
  });

  describe('create_order', () => {
    it('posts simplified order to internal endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'order-1',
          order_number: 42,
          status: 'NEW'
        })
      });

      const args = JSON.stringify({
        customer_name: 'Alice',
        items: [{ item_id: 'item-1', qty: 2 }]
      });
      const result = await handler.execute('create_order', args);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/internal/orders',
        expect.objectContaining({
          method: 'POST',
          body: expect.any(String)
        })
      );
      const parsed = JSON.parse(result);
      expect(parsed.order_number).toBe(42);
    });
  });

  describe('unknown tool', () => {
    it('returns an error string', async () => {
      const result = await handler.execute('nonexistent', '{}');
      expect(result).toContain('error');
    });
  });
});
