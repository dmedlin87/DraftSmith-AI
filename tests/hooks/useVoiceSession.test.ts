import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useVoiceSession } from '@/features/voice/hooks/useVoiceSession';
import { connectLiveSession } from '@/services/gemini/audio';

vi.mock('@/services/gemini/audio', () => ({
  connectLiveSession: vi.fn(),
}));

class MockAudioWorkletNode {
  public port = { close: vi.fn(), postMessage: vi.fn(), onmessage: null as any };
  public connect = vi.fn();
  public disconnect = vi.fn();

  constructor(public context: any, public name: string) {
    (globalThis as any).__lastWorkletNode = this;
  }
}

class MockAnalyserNode {
  public fftSize = 0;
  public smoothingTimeConstant = 0;
  public frequencyBinCount = 4;
  public connect = vi.fn();
  getByteFrequencyData = vi.fn((arr: Uint8Array) => {
    arr.set([1, 2, 3, 4]);
  });
}

class MockAudioBufferSourceNode {
  public buffer: any = null;
  public onended: (() => void) | null = null;
  public connect = vi.fn();
  public start = vi.fn();
  public stop = vi.fn();
  public disconnect = vi.fn();
}

class MockAudioContext {
  public state: 'running' | 'closed' | 'suspended' = 'running';
  public destination = {};
  public currentTime = 0;
  public audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) };
  public close = vi.fn(async () => {
    this.state = 'closed';
  });

  constructor(public options?: any) {
    (globalThis as any).__createdContexts.push(this);
  }

  resume = vi.fn(async () => {
    this.state = 'running';
  });

  createMediaStreamSource = vi.fn(() => ({
    connect: vi.fn(),
  }));

  createAnalyser = vi.fn(() => new MockAnalyserNode());

  createBufferSource = vi.fn(() => {
    const source = new MockAudioBufferSourceNode();
    (globalThis as any).__lastBufferSource = source;
    return source;
  });
}

globalThis.AudioWorkletNode = MockAudioWorkletNode as any;

describe('useVoiceSession', () => {
  const stopTrack = vi.fn();
  const mediaStream = { getTracks: () => [{ stop: stopTrack }] } as any;

  beforeEach(() => {
    (globalThis as any).__createdContexts = [];
    (globalThis as any).__lastWorkletNode = null;
    (globalThis as any).__lastBufferSource = null;

    (navigator as any).mediaDevices = {
      getUserMedia: vi.fn().mockResolvedValue(mediaStream),
    };

    (globalThis as any).AudioContext = MockAudioContext as any;
    (globalThis as any).webkitAudioContext = undefined;

    (globalThis as any).requestAnimationFrame = vi.fn().mockReturnValue(1);
    (globalThis as any).cancelAnimationFrame = vi.fn();

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts session and forwards worklet audio to live client', async () => {
    const sendAudio = vi.fn();
    const disconnect = vi.fn();
    const liveCallbacks: { onClose?: () => void } = {};
    (connectLiveSession as vi.MockedFunction<typeof connectLiveSession>).mockImplementation(async (_onAudio, onClose) => {
      liveCallbacks.onClose = onClose;
      return { sendAudio, disconnect } as any;
    });

    const { result } = renderHook(() => useVoiceSession());

    await act(async () => {
      await result.current.startSession();
    });

    expect(result.current.isConnected).toBe(true);

    const workletNode = (globalThis as any).__lastWorkletNode as MockAudioWorkletNode;
    const int16Data = new Int16Array([0, 32767, -32768]);

    await act(async () => {
      workletNode.port.onmessage?.({ data: { type: 'audio', audioData: int16Data.buffer } });
    });

    expect(sendAudio).toHaveBeenCalledTimes(1);
    const sent = sendAudio.mock.calls[0][0] as Float32Array;
    expect(sent[1]).toBeCloseTo(1);
    expect(sent[2]).toBeCloseTo(-1);

    act(() => {
      liveCallbacks.onClose?.();
    });

    expect(result.current.isConnected).toBe(false);
  });

  it('stops session and cleans up resources', async () => {
    const disconnect = vi.fn();
    (connectLiveSession as vi.MockedFunction<typeof connectLiveSession>).mockResolvedValue({ sendAudio: vi.fn(), disconnect } as any);

    const { result } = renderHook(() => useVoiceSession());

    await act(async () => {
      await result.current.startSession();
    });

    act(() => {
      result.current.stopSession();
    });

    expect(result.current.isConnected).toBe(false);
    expect(stopTrack).toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalled();

    const contexts: MockAudioContext[] = (globalThis as any).__createdContexts;
    expect(contexts.every(ctx => ctx.state === 'closed')).toBe(true);
  });
});
