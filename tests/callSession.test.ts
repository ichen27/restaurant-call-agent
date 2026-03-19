import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CallSession, CallSessionConfig } from '../src/workers/call-session.js';

describe('CallSession', () => {
  let config: CallSessionConfig;

  beforeEach(() => {
    config = {
      streamSid: 'MZ123',
      callSid: 'CA123',
      storeId: 'store-1',
      storeName: 'Test Store',
      callerPhone: '+15559876543',
      apiBaseUrl: 'http://localhost:3000',
      internalApiKey: 'test-key',
      openaiApiKey: 'sk-test',
      openaiModel: 'gpt-4o-realtime-preview',
      openaiVoice: 'alloy',
      twilioAccountSid: 'AC123',
      twilioAuthToken: 'auth-token'
    };
  });

  it('creates a session with correct config', () => {
    const session = new CallSession(config);
    expect(session.callSid).toBe('CA123');
    expect(session.storeId).toBe('store-1');
  });

  it('builds correct OpenAI session.update message', () => {
    const session = new CallSession(config);
    const msg = session.buildSessionUpdate();
    expect(msg.type).toBe('session.update');
    expect(msg.session.model).toBe('gpt-4o-realtime-preview');
    expect(msg.session.voice).toBe('alloy');
    expect(msg.session.tools).toHaveLength(5);
    expect(msg.session.instructions).toContain('Test Store');
    expect(msg.session.input_audio_format).toBe('pcm16');
    expect(msg.session.output_audio_format).toBe('pcm16');
  });
});
