import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../src/workers/call-prompt.js';

describe('buildSystemPrompt', () => {
  it('includes the store name', () => {
    const prompt = buildSystemPrompt('Mario\'s Pizza');
    expect(prompt).toContain('Mario\'s Pizza');
  });

  it('includes pickup-only rule', () => {
    const prompt = buildSystemPrompt('Test Store');
    expect(prompt).toContain('pickup');
  });

  it('mentions tool names', () => {
    const prompt = buildSystemPrompt('Test Store');
    expect(prompt).toContain('get_store_mode');
    expect(prompt).toContain('search_menu');
    expect(prompt).toContain('create_order');
    expect(prompt).toContain('transfer_to_staff');
    expect(prompt).toContain('end_call');
  });

  it('instructs to collect customer name', () => {
    const prompt = buildSystemPrompt('Test Store');
    expect(prompt).toContain('name');
  });

  it('instructs to confirm order before submitting', () => {
    const prompt = buildSystemPrompt('Test Store');
    expect(prompt).toContain('confirm');
  });
});
