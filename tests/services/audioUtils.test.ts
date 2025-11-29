import { describe, expect, it, vi } from 'vitest';
import { arrayBufferToBase64, base64ToUint8Array, createBlob, decodeAudioData } from '@/features/voice/services/audioUtils';

class MockAudioContext {
  constructor(public sampleRate: number) {}
  createBuffer = vi.fn((numChannels: number, length: number, sampleRate: number) => {
    const channels = Array.from({ length: numChannels }, () => new Float32Array(length));
    return {
      sampleRate,
      getChannelData: (idx: number) => channels[idx],
    } as any;
  });
}

describe('audioUtils', () => {
  it('converts base64 to Uint8Array and back', () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    const b64 = arrayBufferToBase64(data.buffer);
    const restored = base64ToUint8Array(b64);

    expect(Array.from(restored)).toEqual([1, 2, 3, 4]);
  });

  it('decodes PCM data into AudioBuffer', async () => {
    const ctx = new MockAudioContext(16000) as any;
    const pcm = new Int16Array([0, 32767, -32768, 16384]);

    const buffer = await decodeAudioData(new Uint8Array(pcm.buffer), ctx, 16000, 1);
    const channelData = buffer.getChannelData(0);

    expect(channelData[0]).toBeCloseTo(0);
    expect(channelData[1]).toBeCloseTo(1, 3);
    expect(channelData[2]).toBeCloseTo(-1, 3);
    expect(buffer.sampleRate).toBe(16000);
  });

  it('creates PCM blob payloads from Float32 samples', () => {
    const blob = createBlob(new Float32Array([0, 1, -1]));
    const decoded = base64ToUint8Array(blob.data);
    const view = new Int16Array(decoded.buffer);

    expect(blob.mimeType).toBe('audio/pcm;rate=16000');
    expect(Array.from(view)).toEqual([0, 32767, -32768]);
  });
});
