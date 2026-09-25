import { afterEach, describe, expect, it } from 'vitest';
import { createRepository } from '../src/store/factory.js';
import { PostgresStore } from '../src/store/postgres.js';

const envBackup = { ...process.env };

afterEach(() => {
  process.env = { ...envBackup };
});

describe('store factory', () => {
  it('uses memory backend by default', () => {
    delete process.env.STORE_BACKEND;
    delete process.env.DATABASE_URL;

    const built = createRepository();
    expect(built.backend).toBe('memory');
  });

  it('builds postgres repository when postgres backend is selected', () => {
    process.env.STORE_BACKEND = 'postgres';
    process.env.DATABASE_URL = 'postgres://localhost:5432/test';

    const built = createRepository();
    expect(built.backend).toBe('postgres');
    expect(built.repository).toBeInstanceOf(PostgresStore);
  });

  it('createRepository throws for postgres without DATABASE_URL', () => {
    process.env.STORE_BACKEND = 'postgres';
    delete process.env.DATABASE_URL;
    expect(() => createRepository()).toThrow(/DATABASE_URL/);
  });
});
