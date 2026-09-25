import { describe, expect, it, vi } from 'vitest';
import { errorMiddleware } from '../src/http/errorMiddleware.js';
import type { Request, Response } from 'express';

function mockReqRes() {
  const req = { method: 'GET', path: '/test', header: () => undefined } as unknown as Request;
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const res = { status, json } as unknown as Response;
  const next = vi.fn();
  return { req, res, status, json, next };
}

describe('errorMiddleware', () => {
  it('classifies "invalid transition" as 400 INVALID_STATUS_CHANGE', () => {
    const { req, res, status, json, next } = mockReqRes();
    errorMiddleware(new Error('invalid transition from NEW to COMPLETED'), req, res, next);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'INVALID_STATUS_CHANGE' }) })
    );
  });

  it('classifies "not found" as 404 NOT_FOUND', () => {
    const { req, res, status, json, next } = mockReqRes();
    errorMiddleware(new Error('Order not found'), req, res, next);
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'NOT_FOUND' }) })
    );
  });

  it('classifies "database" as 503 DB_UNAVAILABLE', () => {
    const { req, res, status, next } = mockReqRes();
    errorMiddleware(new Error('database connection lost'), req, res, next);
    expect(status).toHaveBeenCalledWith(503);
  });

  it('classifies "connection" as 503 DB_UNAVAILABLE', () => {
    const { req, res, status, next } = mockReqRes();
    errorMiddleware(new Error('connection refused'), req, res, next);
    expect(status).toHaveBeenCalledWith(503);
  });

  it('classifies "timeout" as 503 DB_UNAVAILABLE', () => {
    const { req, res, status, next } = mockReqRes();
    errorMiddleware(new Error('query timeout'), req, res, next);
    expect(status).toHaveBeenCalledWith(503);
  });

  it('classifies "query" as 503 DB_UNAVAILABLE', () => {
    const { req, res, status, next } = mockReqRes();
    errorMiddleware(new Error('query failed'), req, res, next);
    expect(status).toHaveBeenCalledWith(503);
  });

  it('classifies unknown error as 500 INTERNAL_ERROR', () => {
    const { req, res, status, json, next } = mockReqRes();
    errorMiddleware(new Error('something broke'), req, res, next);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'INTERNAL_ERROR' }) })
    );
  });

  it('handles error with no message as 500', () => {
    const { req, res, status, next } = mockReqRes();
    errorMiddleware(new Error(), req, res, next);
    expect(status).toHaveBeenCalledWith(500);
  });

  it('returns correct JSON format { error: { code, message } }', () => {
    const { req, res, json, next } = mockReqRes();
    errorMiddleware(new Error('something'), req, res, next);
    const body = json.mock.calls[0]![0] as { error: { code: string; message: string } };
    expect(body).toHaveProperty('error.code');
    expect(body).toHaveProperty('error.message');
  });
});
