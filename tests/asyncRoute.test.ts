import { describe, expect, it, vi } from 'vitest';
import { asyncRoute } from '../src/http/asyncRoute.js';
import type { NextFunction, Request, Response } from 'express';

function mockReqResNext() {
  const req = {} as Request;
  const res = { json: vi.fn(), status: vi.fn(() => res) } as unknown as Response;
  const next = vi.fn() as NextFunction;
  return { req, res, next };
}

describe('asyncRoute', () => {
  it('calls handler and sends response on success', async () => {
    const handler = vi.fn(async (_req: Request, res: Response) => {
      res.json({ ok: true });
    });
    const { req, res, next } = mockReqResNext();
    const wrapped = asyncRoute(handler);
    wrapped(req, res, next);
    // Allow microtask to resolve
    await new Promise((r) => setTimeout(r, 0));
    expect(handler).toHaveBeenCalledOnce();
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next with error on async rejection', async () => {
    const error = new Error('async fail');
    const handler = vi.fn(async () => {
      throw error;
    });
    const { req, res, next } = mockReqResNext();
    asyncRoute(handler)(req, res, next);
    await new Promise((r) => setTimeout(r, 0));
    expect(next).toHaveBeenCalledWith(error);
  });

  it('calls next with error on sync throw wrapped in async', async () => {
    const error = new Error('sync throw');
    const handler = vi.fn(async () => {
      throw error;
    });
    const { req, res, next } = mockReqResNext();
    asyncRoute(handler)(req, res, next);
    await new Promise((r) => setTimeout(r, 0));
    expect(next).toHaveBeenCalledWith(error);
  });
});
