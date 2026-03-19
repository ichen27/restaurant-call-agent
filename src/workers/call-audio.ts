// mulaw decode table using standard ITU-T G.711 algorithm (BIAS = 132)
const MULAW_DECODE_TABLE = new Int16Array(256);
(function buildMulawDecodeTable() {
  const EXP_LUT = [0, 132, 396, 924, 1980, 4092, 8316, 16764];
  for (let i = 0; i < 256; i++) {
    const mu = ~i & 0xff;
    const sign = mu & 0x80;
    const exponent = (mu >> 4) & 0x07;
    const mantissa = mu & 0x0f;
    let sample = EXP_LUT[exponent]! + (mantissa << (exponent + 3));
    MULAW_DECODE_TABLE[i] = sign ? -sample : sample;
  }
})();

// Standard ITU-T G.711 mulaw encoder (BIAS = 132)
const MULAW_BIAS = 0x84; // 132
const MULAW_CLIP = 32635;
const MULAW_SEG_END = [0xff, 0x1ff, 0x3ff, 0x7ff, 0xfff, 0x1fff, 0x3fff, 0x7fff];

function encodeMulawSample(sample: number): number {
  let mask: number;
  let pcm = sample;
  if (pcm < 0) {
    pcm = MULAW_BIAS - pcm;
    mask = 0x7f;
  } else {
    pcm += MULAW_BIAS;
    mask = 0xff;
  }
  if (pcm > MULAW_CLIP) pcm = MULAW_CLIP;

  let seg = 8;
  for (let i = 0; i < 8; i++) {
    if (pcm <= MULAW_SEG_END[i]!) {
      seg = i;
      break;
    }
  }

  const uval = (seg << 4) | ((pcm >> (seg + 3)) & 0x0f);
  return (uval ^ mask) & 0xff;
}

export function mulawToPcm16(mulawBuf: Buffer): Buffer {
  const pcm = Buffer.alloc(mulawBuf.length * 2);
  for (let i = 0; i < mulawBuf.length; i++) {
    pcm.writeInt16LE(MULAW_DECODE_TABLE[mulawBuf[i]!], i * 2);
  }
  return pcm;
}

export function pcm16ToMulaw(pcmBuf: Buffer): Buffer {
  const sampleCount = pcmBuf.length >> 1;
  const mulaw = Buffer.alloc(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    mulaw[i] = encodeMulawSample(pcmBuf.readInt16LE(i * 2));
  }
  return mulaw;
}

export function upsample(pcmBuf: Buffer, fromRate: number, toRate: number): Buffer {
  const ratio = toRate / fromRate;
  const inputSamples = pcmBuf.length >> 1;
  const outputSamples = Math.round(inputSamples * ratio);
  const output = Buffer.alloc(outputSamples * 2);

  for (let i = 0; i < outputSamples; i++) {
    const srcIndex = (i / ratio);
    const srcFloor = Math.floor(srcIndex);
    const srcCeil = Math.min(srcFloor + 1, inputSamples - 1);
    const frac = srcIndex - srcFloor;

    const a = pcmBuf.readInt16LE(srcFloor * 2);
    const b = pcmBuf.readInt16LE(srcCeil * 2);
    const interpolated = Math.round(a + (b - a) * frac);
    output.writeInt16LE(interpolated, i * 2);
  }

  return output;
}

export function downsample(pcmBuf: Buffer, fromRate: number, toRate: number): Buffer {
  const ratio = fromRate / toRate;
  const inputSamples = pcmBuf.length >> 1;
  const outputSamples = Math.floor(inputSamples / ratio);
  const output = Buffer.alloc(outputSamples * 2);

  for (let i = 0; i < outputSamples; i++) {
    const srcIndex = Math.round(i * ratio);
    const clamped = Math.min(srcIndex, inputSamples - 1);
    output.writeInt16LE(pcmBuf.readInt16LE(clamped * 2), i * 2);
  }

  return output;
}

/** Full pipeline: Twilio mulaw 8kHz base64 → OpenAI PCM16 24kHz base64 */
export function twilioToOpenAI(base64Mulaw: string): string {
  const mulaw = Buffer.from(base64Mulaw, 'base64');
  const pcm8k = mulawToPcm16(mulaw);
  const pcm24k = upsample(pcm8k, 8000, 24000);
  return pcm24k.toString('base64');
}

/** Full pipeline: OpenAI PCM16 24kHz base64 → Twilio mulaw 8kHz base64 */
export function openAIToTwilio(base64Pcm24k: string): string {
  const pcm24k = Buffer.from(base64Pcm24k, 'base64');
  const pcm8k = downsample(pcm24k, 24000, 8000);
  const mulaw = pcm16ToMulaw(pcm8k);
  return mulaw.toString('base64');
}
