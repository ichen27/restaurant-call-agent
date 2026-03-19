import { describe, expect, it, vi } from 'vitest';
import { safeLog } from '../src/logger.js';

vi.mock('pino', () => {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };
  return { default: () => logger, __mockLogger: logger };
});

async function getMockLogger() {
  const mod = await import('pino') as unknown as { __mockLogger: Record<string, ReturnType<typeof vi.fn>> };
  return mod.__mockLogger;
}

describe('safeLog PII redaction', () => {
  it('redacts US phone number from message', async () => {
    const logger = await getMockLogger();
    safeLog('info', 'Call from +1 (555) 123-4567 please');
    const msg = logger.info.mock.calls.at(-1)?.[1] as string;
    expect(msg).not.toContain('555');
    expect(msg).toContain('[REDACTED_PHONE]');
  });

  it('redacts international phone number', async () => {
    const logger = await getMockLogger();
    safeLog('info', 'Call from +44 20 7946 0958');
    const msg = logger.info.mock.calls.at(-1)?.[1] as string;
    expect(msg).not.toContain('7946');
    expect(msg).toContain('[REDACTED_PHONE]');
  });

  it('redacts bare 10+ digit phone number', async () => {
    const logger = await getMockLogger();
    safeLog('info', 'Number is 5551234567');
    const msg = logger.info.mock.calls.at(-1)?.[1] as string;
    expect(msg).not.toContain('5551234567');
    expect(msg).toContain('[REDACTED_PHONE]');
  });

  it('redacts email address from message', async () => {
    const logger = await getMockLogger();
    safeLog('info', 'Contact user@example.com');
    const msg = logger.info.mock.calls.at(-1)?.[1] as string;
    expect(msg).not.toContain('user@example.com');
    expect(msg).toContain('[REDACTED_EMAIL]');
  });

  it('redacts email in payload values', async () => {
    const logger = await getMockLogger();
    safeLog('info', 'test', { email: 'a@b.com' });
    const payload = logger.info.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(payload.email).toBe('[REDACTED_EMAIL]');
  });

  it('redacts phone in payload values', async () => {
    const logger = await getMockLogger();
    safeLog('info', 'test', { phone: '+15551234567' });
    const payload = logger.info.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(String(payload.phone)).toContain('[REDACTED_PHONE]');
  });

  it('handles undefined payload without error', () => {
    expect(() => safeLog('info', 'no payload')).not.toThrow();
  });

  it('handles empty payload without error', () => {
    expect(() => safeLog('info', 'empty payload', {})).not.toThrow();
  });

  it('does not redact short numbers', async () => {
    const logger = await getMockLogger();
    safeLog('info', 'code is 12345');
    const msg = logger.info.mock.calls.at(-1)?.[1] as string;
    expect(msg).toContain('12345');
  });

  it('redacts multiple PII in one string', async () => {
    const logger = await getMockLogger();
    safeLog('info', 'Call +15551234567 or email a@b.com');
    const msg = logger.info.mock.calls.at(-1)?.[1] as string;
    expect(msg).not.toContain('5551234567');
    expect(msg).not.toContain('a@b.com');
    expect(msg).toContain('[REDACTED_PHONE]');
    expect(msg).toContain('[REDACTED_EMAIL]');
  });

  it('calls correct pino method for each log level', async () => {
    const logger = await getMockLogger();
    logger.info.mockClear();
    logger.warn.mockClear();
    logger.error.mockClear();

    safeLog('info', 'info msg');
    safeLog('warn', 'warn msg');
    safeLog('error', 'error msg');

    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});
