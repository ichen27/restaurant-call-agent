import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { PassThrough } from 'node:stream';
import { RealtimeGateway, type RealtimeEnvelope } from '../src/realtime/gateway.js';

function computeExpectedAccept(key: string): string {
  return createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');
}

function makeMockSocket(): PassThrough & { destroyed: boolean } {
  const stream = new PassThrough();
  return stream as PassThrough & { destroyed: boolean };
}

function sampleEnvelope(storeId = 'store-1'): RealtimeEnvelope {
  return {
    kind: 'outbox_publish',
    event_id: 1,
    store_id: storeId,
    event_type: 'OrderCreated',
    aggregate_id: 'order-1',
    aggregate_type: 'ORDER',
    attempts: 1,
    created_at: '2026-01-01T00:00:00Z',
    payload: { orderId: 'order-1' }
  };
}

describe('RealtimeGateway', () => {
  describe('WebSocket frame encoding', () => {
    it('encodes small payload (<126 bytes)', () => {
      const gw = new RealtimeGateway();
      // We test indirectly through publish to a connected client
      const socket = makeMockSocket();
      const chunks: Buffer[] = [];
      socket.on('data', (chunk: Buffer) => chunks.push(chunk));

      const authService = {
        verify: () => ({ userId: 'u1', storeId: 'store-1', email: 'a@b.com', role: 'STAFF' as const })
      };
      gw.attachUpgrade('/ws?token=valid&store_id=store-1', { 'sec-websocket-key': 'testkey123' }, socket, authService as never);

      gw.publish(sampleEnvelope());

      // Find the WebSocket frame in collected data (after HTTP upgrade response)
      const allData = Buffer.concat(chunks);
      const frameStart = allData.indexOf(0x81, allData.indexOf('\r\n\r\n'));
      expect(frameStart).toBeGreaterThan(-1);

      socket.destroy();
    });
  });

  describe('publish', () => {
    it('returns 0 for store with no clients', () => {
      const gw = new RealtimeGateway();
      expect(gw.publish(sampleEnvelope('no-clients'))).toBe(0);
    });

    it('broadcasts to connected clients', () => {
      const gw = new RealtimeGateway();
      const authService = {
        verify: () => ({ userId: 'u1', storeId: 'store-1', email: 'a@b.com', role: 'STAFF' as const })
      };
      const sockets = [makeMockSocket(), makeMockSocket(), makeMockSocket()];
      for (const socket of sockets) {
        gw.attachUpgrade('/ws?token=valid&store_id=store-1', { 'sec-websocket-key': 'key1' }, socket, authService as never);
      }

      const delivered = gw.publish(sampleEnvelope());
      expect(delivered).toBe(3);

      for (const s of sockets) s.destroy();
    });
  });

  describe('connectedCount', () => {
    it('returns total across stores', () => {
      const gw = new RealtimeGateway();
      const auth = (storeId: string) => ({
        verify: () => ({ userId: 'u1', storeId, email: 'a@b.com', role: 'STAFF' as const })
      });

      const s1 = makeMockSocket();
      const s2 = makeMockSocket();
      gw.attachUpgrade('/ws?token=valid&store_id=store-1', { 'sec-websocket-key': 'k1' }, s1, auth('store-1') as never);
      gw.attachUpgrade('/ws?token=valid&store_id=store-2', { 'sec-websocket-key': 'k2' }, s2, auth('store-2') as never);

      expect(gw.connectedCount()).toBe(2);

      s1.destroy();
      s2.destroy();
    });

    it('returns count per store', () => {
      const gw = new RealtimeGateway();
      const authService = {
        verify: () => ({ userId: 'u1', storeId: 'store-1', email: 'a@b.com', role: 'STAFF' as const })
      };

      const s1 = makeMockSocket();
      gw.attachUpgrade('/ws?token=valid&store_id=store-1', { 'sec-websocket-key': 'k1' }, s1, authService as never);

      expect(gw.connectedCount('store-1')).toBe(1);
      expect(gw.connectedCount('store-2')).toBe(0);

      s1.destroy();
    });
  });

  describe('computeWebSocketAccept', () => {
    it('produces correct RFC 6455 accept value', () => {
      const key = 'dGhlIHNhbXBsZSBub25jZQ==';
      const expected = computeExpectedAccept(key);
      // The function is not exported, but we verify through attachUpgrade behavior
      // The HTTP response should contain the Sec-WebSocket-Accept header
      const gw = new RealtimeGateway();
      const socket = makeMockSocket();
      const chunks: Buffer[] = [];
      socket.on('data', (chunk: Buffer) => chunks.push(chunk));

      const authService = {
        verify: () => ({ userId: 'u1', storeId: 'store-1', email: 'a@b.com', role: 'STAFF' as const })
      };
      gw.attachUpgrade('/ws?token=valid&store_id=store-1', { 'sec-websocket-key': key }, socket, authService as never);

      const response = Buffer.concat(chunks).toString();
      expect(response).toContain(`Sec-WebSocket-Accept: ${expected}`);

      socket.destroy();
    });
  });
});
