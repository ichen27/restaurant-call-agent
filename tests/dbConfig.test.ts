import { afterEach, describe, expect, it } from 'vitest';
import { getDbConfig } from '../src/db/config.js';

const envBackup = { ...process.env };

afterEach(() => {
  process.env = { ...envBackup };
});

describe('getDbConfig', () => {
  it('defaults to memory backend', () => {
    delete process.env.STORE_BACKEND;
    delete process.env.DATABASE_URL;
    const config = getDbConfig();
    expect(config.backend).toBe('memory');
    expect(config.databaseUrl).toBeUndefined();
  });

  it('returns postgres backend with URL', () => {
    process.env.STORE_BACKEND = 'postgres';
    process.env.DATABASE_URL = 'postgres://localhost:5432/test';
    const config = getDbConfig();
    expect(config.backend).toBe('postgres');
    expect(config.databaseUrl).toBe('postgres://localhost:5432/test');
  });

  it('returns postgres backend without URL', () => {
    process.env.STORE_BACKEND = 'postgres';
    delete process.env.DATABASE_URL;
    const config = getDbConfig();
    expect(config.backend).toBe('postgres');
    expect(config.databaseUrl).toBeUndefined();
  });
});
