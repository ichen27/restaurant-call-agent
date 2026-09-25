import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/auth/password.js';

describe('password hashing', () => {
  it('verifies the correct password', () => {
    const hashed = hashPassword('password123', 'seeded-salt');
    expect(verifyPassword('password123', hashed)).toBe(true);
  });

  it('rejects an incorrect password', () => {
    const hashed = hashPassword('password123', 'seeded-salt');
    expect(verifyPassword('wrong-password', hashed)).toBe(false);
  });

  it('rejects malformed hash payloads', () => {
    expect(verifyPassword('password123', 'invalid')).toBe(false);
  });

  it('hashes empty password without error', () => {
    const hash = hashPassword('');
    expect(typeof hash).toBe('string');
    expect(hash.split('$')).toHaveLength(4);
  });

  it('round-trips unicode password', () => {
    const hash = hashPassword('pässwörd™');
    expect(verifyPassword('pässwörd™', hash)).toBe(true);
  });

  it('round-trips very long password (1000 chars)', () => {
    const long = 'a'.repeat(1000);
    const hash = hashPassword(long);
    expect(verifyPassword(long, hash)).toBe(true);
  });

  it('hash format has 4 parts', () => {
    const hash = hashPassword('test');
    expect(hash.split('$')).toHaveLength(4);
    expect(hash).toMatch(/^pbkdf2_sha256\$/);
  });

  it('different salts produce different hashes', () => {
    const h1 = hashPassword('same');
    const h2 = hashPassword('same');
    expect(h1).not.toBe(h2);
  });

  it('rejects malformed hash with 3 parts', () => {
    expect(verifyPassword('pw', 'a$b$c')).toBe(false);
  });

  it('rejects empty hash string', () => {
    expect(verifyPassword('pw', '')).toBe(false);
  });
});
