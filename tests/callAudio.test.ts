import { describe, it, expect } from 'vitest';
import { mulawToPcm16, pcm16ToMulaw, upsample, downsample } from '../src/workers/call-audio.js';

describe('call-audio', () => {
  describe('mulawToPcm16', () => {
    it('decodes the full byte range and preserves reference samples', () => {
      const output = mulawToPcm16(Buffer.from(Array.from({ length: 256 }, (_, i) => i)));
      expect(output.length).toBe(512);
      expect(output.readInt16LE(0x00 * 2)).toBe(-32124);
      expect(output.readInt16LE(0x80 * 2)).toBe(32124);
      expect(output.readInt16LE(0x7f * 2)).toBe(0);
      expect(output.readInt16LE(0xff * 2)).toBe(0);
    });

    it('accepts an empty audio frame', () => {
      expect(mulawToPcm16(Buffer.alloc(0))).toEqual(Buffer.alloc(0));
    });

    it('converts a single mulaw byte to a 16-bit PCM sample', () => {
      const input = Buffer.from([0xff]);
      const output = mulawToPcm16(input);
      expect(output).toBeInstanceOf(Buffer);
      expect(output.length).toBe(2);
      const sample = output.readInt16LE(0);
      expect(Math.abs(sample)).toBeLessThan(100);
    });

    it('converts multiple mulaw bytes', () => {
      const input = Buffer.from([0xff, 0x7f, 0x00, 0x80]);
      const output = mulawToPcm16(input);
      expect(output.length).toBe(8);
    });
  });

  describe('pcm16ToMulaw', () => {
    it('converts a PCM16 sample to mulaw', () => {
      const input = Buffer.alloc(2);
      input.writeInt16LE(0, 0);
      const output = pcm16ToMulaw(input);
      expect(output.length).toBe(1);
    });

    it('roundtrips approximately', () => {
      const original = Buffer.alloc(2);
      original.writeInt16LE(1000, 0);
      const mulaw = pcm16ToMulaw(original);
      const recovered = mulawToPcm16(mulaw);
      const recoveredSample = recovered.readInt16LE(0);
      expect(Math.abs(recoveredSample - 1000)).toBeLessThan(200);
    });
  });

  describe('upsample 8kHz → 24kHz', () => {
    it('triples the number of samples', () => {
      const input = Buffer.alloc(8);
      input.writeInt16LE(0, 0);
      input.writeInt16LE(300, 2);
      input.writeInt16LE(600, 4);
      input.writeInt16LE(900, 6);
      const output = upsample(input, 8000, 24000);
      expect(output.length).toBe(24);
    });
  });

  describe('downsample 24kHz → 8kHz', () => {
    it('reduces samples by factor of 3', () => {
      const input = Buffer.alloc(24);
      for (let i = 0; i < 12; i++) {
        input.writeInt16LE(i * 100, i * 2);
      }
      const output = downsample(input, 24000, 8000);
      expect(output.length).toBe(8);
    });
  });
});
