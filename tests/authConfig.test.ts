import { afterEach, describe, expect, it } from 'vitest';
import {
  configuredUsers,
  isAuthRequired,
  isNonLocalEnv,
  jwtExpiresIn,
  jwtSecret,
  validateRuntimeSecurityConfig
} from '../src/auth/config.js';

const envBackup = { ...process.env };

afterEach(() => {
  process.env = { ...envBackup };
});

describe('isAuthRequired', () => {
  it('returns true in production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.AUTH_REQUIRED;
    expect(isAuthRequired()).toBe(true);
  });

  it('returns false in development', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.AUTH_REQUIRED;
    expect(isAuthRequired()).toBe(false);
  });

  it('returns false in test', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.AUTH_REQUIRED;
    expect(isAuthRequired()).toBe(false);
  });

  it('AUTH_REQUIRED=true overrides dev mode', () => {
    process.env.NODE_ENV = 'development';
    process.env.AUTH_REQUIRED = 'true';
    expect(isAuthRequired()).toBe(true);
  });

  it('AUTH_REQUIRED=false overrides production', () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTH_REQUIRED = 'false';
    expect(isAuthRequired()).toBe(false);
  });
});

describe('isNonLocalEnv', () => {
  it('returns true in production', () => {
    process.env.NODE_ENV = 'production';
    expect(isNonLocalEnv()).toBe(true);
  });

  it('returns false in development', () => {
    process.env.NODE_ENV = 'development';
    expect(isNonLocalEnv()).toBe(false);
  });
});

describe('jwtSecret', () => {
  it('returns env value when set', () => {
    process.env.JWT_SECRET = 'mysecret';
    expect(jwtSecret()).toBe('mysecret');
  });

  it('returns default when not set', () => {
    delete process.env.JWT_SECRET;
    expect(jwtSecret()).toBe('dev-insecure-secret');
  });
});

describe('jwtExpiresIn', () => {
  it('returns env value when set', () => {
    process.env.JWT_EXPIRES_IN = '24h';
    expect(jwtExpiresIn()).toBe('24h');
  });

  it('returns default when not set', () => {
    delete process.env.JWT_EXPIRES_IN;
    expect(jwtExpiresIn()).toBe('8h');
  });
});

describe('configuredUsers', () => {
  it('parses valid AUTH_USERS_JSON', () => {
    process.env.AUTH_USERS_JSON = JSON.stringify([
      {
        userId: 'u1',
        storeId: 's1',
        email: 'a@b.com',
        role: 'STAFF',
        passwordHash: 'pbkdf2_sha256$100000$salt$digest'
      }
    ]);
    const users = configuredUsers();
    expect(users).toHaveLength(1);
    expect(users[0]!.email).toBe('a@b.com');
  });

  it('hashes plain passwords', () => {
    process.env.AUTH_USERS_JSON = JSON.stringify([
      {
        userId: 'u1',
        storeId: 's1',
        email: 'a@b.com',
        role: 'STAFF',
        password: 'plaintext123'
      }
    ]);
    const users = configuredUsers();
    expect(users).toHaveLength(1);
    expect(users[0]!.passwordHash).toMatch(/^pbkdf2_sha256\$/);
  });

  it('filters entries with missing fields', () => {
    process.env.AUTH_USERS_JSON = JSON.stringify([
      { userId: 'u1' },
      {
        userId: 'u2',
        storeId: 's1',
        email: 'b@c.com',
        role: 'STAFF',
        passwordHash: 'pbkdf2_sha256$100000$salt$digest'
      }
    ]);
    const users = configuredUsers();
    expect(users).toHaveLength(1);
    expect(users[0]!.userId).toBe('u2');
  });

  it('returns defaults when env not set', () => {
    delete process.env.AUTH_USERS_JSON;
    const users = configuredUsers();
    expect(users.length).toBeGreaterThanOrEqual(2);
    expect(users[0]!.email).toBe('staff@store.test');
  });
});

describe('validateRuntimeSecurityConfig', () => {
  it('passes in development', () => {
    process.env.NODE_ENV = 'development';
    expect(() => validateRuntimeSecurityConfig()).not.toThrow();
  });

  it('rejects insecure JWT in production with auth required', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    delete process.env.AUTH_REQUIRED;
    expect(() => validateRuntimeSecurityConfig()).toThrow(/JWT_SECRET/);
  });

  it('requires INTERNAL_API_KEY in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a-real-secret';
    delete process.env.INTERNAL_API_KEY;
    expect(() => validateRuntimeSecurityConfig()).toThrow(/INTERNAL_API_KEY/);
  });

  it('requires min 8 char INTERNAL_API_KEY', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a-real-secret';
    process.env.INTERNAL_API_KEY = 'abc';
    expect(() => validateRuntimeSecurityConfig()).toThrow(/INTERNAL_API_KEY/);
  });

  it('requires telephony secret in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a-real-secret';
    process.env.INTERNAL_API_KEY = 'long-enough-key';
    delete process.env.TELEPHONY_WEBHOOK_TOKEN;
    delete process.env.TELEPHONY_WEBHOOK_SECRET;
    expect(() => validateRuntimeSecurityConfig()).toThrow(/TELEPHONY_WEBHOOK/);
  });
});
