import { describe, it, expect } from 'vitest';
import { createCallWorkerServer } from '../src/workers/call.js';

describe('call worker server', () => {
  it('exports createCallWorkerServer function', () => {
    expect(typeof createCallWorkerServer).toBe('function');
  });

  it('creates an HTTP server that responds to /health', async () => {
    const { server } = createCallWorkerServer({
      port: 0,
      apiBaseUrl: 'http://localhost:3000',
      internalApiKey: 'test',
      openaiApiKey: 'sk-test',
      openaiModel: 'gpt-4o-realtime-preview',
      openaiVoice: 'alloy',
      twilioAccountSid: 'AC123',
      twilioAuthToken: 'auth'
    });

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;

    const res = await fetch(`http://localhost:${port}/health`);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.service).toBe('call-worker');
    expect(body.active_calls).toBe(0);

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
