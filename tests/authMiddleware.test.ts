import { afterEach, describe, expect, it, vi } from 'vitest';
import { authenticateRequest, requireRole } from '../src/auth/middleware.js';
import type { NextFunction, Request, Response } from 'express';
import type { AuthContext } from '../src/auth/types.js';

const envBackup = { ...process.env };

afterEach(() => {
  process.env = { ...envBackup };
});

function mockReqRes(authHeader?: string, auth?: AuthContext) {
  const req = {
    header: vi.fn((name: string) => (name.toLowerCase() === 'authorization' ? authHeader : undefined)),
    auth
  } as unknown as Request;
  const jsonFn = vi.fn();
  const statusFn = vi.fn(() => ({ json: jsonFn }));
  const res = { status: statusFn, json: jsonFn } as unknown as Response;
  const next = vi.fn() as NextFunction;
  return { req, res, statusFn, jsonFn, next };
}

function fakeAuthService(verifyResult?: AuthContext) {
  return { verify: vi.fn(() => verifyResult) };
}

describe('authenticateRequest', () => {
  it('passes through when no auth header (req.auth undefined)', () => {
    const auth = fakeAuthService();
    const { req, res, next } = mockReqRes();
    authenticateRequest(auth as never)(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.auth).toBeUndefined();
  });

  it('sets req.auth with valid bearer token', () => {
    const context: AuthContext = { userId: 'u1', storeId: 's1', email: 'a@b.com', role: 'STAFF' };
    const auth = fakeAuthService(context);
    const { req, res, next } = mockReqRes('Bearer valid-token');
    authenticateRequest(auth as never)(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.auth).toEqual(context);
  });

  it('returns 401 for invalid token', () => {
    const auth = fakeAuthService(undefined);
    const { req, res, statusFn, next } = mockReqRes('Bearer bad-token');
    authenticateRequest(auth as never)(req, res, next);
    expect(statusFn).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 for malformed header (no Bearer prefix)', () => {
    const auth = fakeAuthService();
    const { req, res, statusFn, next } = mockReqRes('Basic xyz');
    authenticateRequest(auth as never)(req, res, next);
    expect(statusFn).toHaveBeenCalledWith(401);
  });

  it('returns 401 for empty bearer value', () => {
    const auth = fakeAuthService();
    const { req, res, statusFn, next } = mockReqRes('Bearer ');
    authenticateRequest(auth as never)(req, res, next);
    expect(statusFn).toHaveBeenCalledWith(401);
  });
});

describe('requireRole', () => {
  it('STAFF accessing STAFF route → allowed', () => {
    const auth: AuthContext = { userId: 'u1', storeId: 's1', email: 'a@b.com', role: 'STAFF' };
    const { req, res, next } = mockReqRes(undefined, auth);
    requireRole('STAFF')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('MANAGER accessing STAFF route → allowed', () => {
    const auth: AuthContext = { userId: 'u1', storeId: 's1', email: 'a@b.com', role: 'MANAGER' };
    const { req, res, next } = mockReqRes(undefined, auth);
    requireRole('STAFF')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('STAFF accessing MANAGER route → 403', () => {
    const auth: AuthContext = { userId: 'u1', storeId: 's1', email: 'a@b.com', role: 'STAFF' };
    const { req, res, statusFn, next } = mockReqRes(undefined, auth);
    requireRole('MANAGER')(req, res, next);
    expect(statusFn).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('MANAGER accessing MANAGER route → allowed', () => {
    const auth: AuthContext = { userId: 'u1', storeId: 's1', email: 'a@b.com', role: 'MANAGER' };
    const { req, res, next } = mockReqRes(undefined, auth);
    requireRole('MANAGER')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('no auth when required → 401', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.AUTH_REQUIRED;
    const { req, res, statusFn, next } = mockReqRes();
    requireRole('STAFF')(req, res, next);
    expect(statusFn).toHaveBeenCalledWith(401);
  });

  it('no auth when not required (dev) → passes through', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.AUTH_REQUIRED;
    const { req, res, next } = mockReqRes();
    requireRole('STAFF')(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
