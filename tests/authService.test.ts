import { describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/password.js';
import { AuthService } from '../src/auth/service.js';

describe('auth service', () => {
  it('logs in configured user record and verifies token', async () => {
    process.env.JWT_SECRET = 'test-secret';

    const auth = new AuthService({
      async getAuthUserByEmail() {
        return {
          userId: 'manager-1',
          storeId: 'store-1',
          email: 'manager@store.test',
          role: 'MANAGER',
          passwordHash: hashPassword('password123', 'fixedsalt'),
          active: true
        };
      }
    });
    const result = await auth.login('store-1', 'manager@store.test', 'password123');
    expect(result).toBeDefined();
    if (!result) {
      throw new Error('expected login result');
    }

    const verified = auth.verify(result.token);
    expect(verified?.email).toBe('manager@store.test');
    expect(verified?.role).toBe('MANAGER');
  });

  it('rejects invalid credentials', async () => {
    const auth = new AuthService({
      async getAuthUserByEmail() {
        return {
          userId: 'manager-1',
          storeId: 'store-1',
          email: 'manager@store.test',
          role: 'MANAGER',
          passwordHash: hashPassword('password123', 'fixedsalt'),
          active: true
        };
      }
    });
    const result = await auth.login('store-1', 'manager@store.test', 'wrong');
    expect(result).toBeUndefined();
  });

  it('rejects inactive user', async () => {
    const auth = new AuthService({
      async getAuthUserByEmail() {
        return {
          userId: 'staff-1',
          storeId: 'store-1',
          email: 'staff@store.test',
          role: 'STAFF',
          passwordHash: hashPassword('password123', 'fixedsalt'),
          active: false
        };
      }
    });
    const result = await auth.login('store-1', 'staff@store.test', 'password123');
    expect(result).toBeUndefined();
  });

  it('returns undefined for non-existent email', async () => {
    const auth = new AuthService({
      async getAuthUserByEmail() {
        return undefined;
      }
    });
    const result = await auth.login('store-1', 'nobody@test.com', 'password');
    expect(result).toBeUndefined();
  });

  it('login email lookup is case-insensitive', async () => {
    process.env.JWT_SECRET = 'test-secret';
    let lookupEmail = '';
    const auth = new AuthService({
      async getAuthUserByEmail(_storeId: string, email: string) {
        lookupEmail = email;
        return {
          userId: 'manager-1',
          storeId: 'store-1',
          email: 'manager@store.test',
          role: 'MANAGER',
          passwordHash: hashPassword('password123', 'fixedsalt'),
          active: true
        };
      }
    });
    await auth.login('store-1', 'MANAGER@STORE.TEST', 'password123');
    expect(lookupEmail).toBe('manager@store.test');
  });

  it('verify returns undefined for expired token', async () => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.JWT_EXPIRES_IN = '0s';
    const auth = new AuthService({
      async getAuthUserByEmail() {
        return {
          userId: 'staff-1',
          storeId: 'store-1',
          email: 'staff@store.test',
          role: 'STAFF',
          passwordHash: hashPassword('password123', 'fixedsalt'),
          active: true
        };
      }
    });
    const result = await auth.login('store-1', 'staff@store.test', 'password123');
    // wait briefly to ensure expiry
    await new Promise((r) => setTimeout(r, 50));
    if (result) {
      const verified = auth.verify(result.token);
      expect(verified).toBeUndefined();
    }
  });

  it('verify returns undefined for malformed token', () => {
    process.env.JWT_SECRET = 'test-secret';
    const auth = new AuthService({ async getAuthUserByEmail() { return undefined; } });
    expect(auth.verify('not.a.jwt')).toBeUndefined();
  });

  it('verify returns undefined for empty string', () => {
    process.env.JWT_SECRET = 'test-secret';
    const auth = new AuthService({ async getAuthUserByEmail() { return undefined; } });
    expect(auth.verify('')).toBeUndefined();
  });
});
