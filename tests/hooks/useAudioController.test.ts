import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAudioController } from '@/features/voice/hooks/useAudioController';

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
  public close = vi.fn(async () => {
    this.state = 'closed';
  });
  public decodeAudioData = vi.fn(async (_buffer: ArrayBuffer) => ({ duration: 0.5 } as any));

  constructor(public options?: any) {
    (globalThis as any).__audioContexts.push(this);
  }

  resume = vi.fn(async () => {
    this.state = 'running';
  });

  createBufferSource = vi.fn(() => {
    const source = new MockAudioBufferSourceNode();
    (globalThis as any).__lastAudioSource = source;
    return source;
  });
}

describe('useAudioController', () => {
  beforeEach(() => {
    (globalThis as any).AudioContext = MockAudioContext as any;
    (globalThis as any).webkitAudioContext = undefined;
    (globalThis as any).__audioContexts = [];
    (globalThis as any).__lastAudioSource = null;
    vi.clearAllMocks();
  });

  it('plays buffers and notifies state changes', async () => {
    const onStateChange = vi.fn();
    const { result } = renderHook(() => useAudioController({ onStateChange }));

    const buffer = { duration: 1 } as any;
    await act(async () => {
      await result.current.playBuffer(buffer);
    });

    expect(onStateChange).toHaveBeenCalledWith({ isPlaying: true, currentTime: 0, duration: 1 });
    const source = (globalThis as any).__lastAudioSource as MockAudioBufferSourceNode;
    expect(source.start).toHaveBeenCalled();

    act(() => {
      source.onended?.();
    });

    expect(onStateChange).toHaveBeenLastCalledWith({ isPlaying: false, currentTime: 0, duration: 0 });
  });

  it('queues buffers for streaming playback', async () => {
    const { result } = renderHook(() => useAudioController());
    const first = { duration: 0.25 } as any;
    const second = { duration: 0.5 } as any;

    await act(async () => {
      await result.current.enqueueBuffer(first);
      await result.current.enqueueBuffer(second);
    });

    const contexts: MockAudioContext[] = (globalThis as any).__audioContexts;
    const source = (globalThis as any).__lastAudioSource as MockAudioBufferSourceNode;
    expect(contexts[0].createBufferSource).toHaveBeenCalledTimes(2);
    expect(source.start.mock.calls[0]?.[0]).toBeDefined();
  });

  it('loads audio from URL and decodes it', async () => {
    const array = new ArrayBuffer(8);
    global.fetch = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: vi.fn().mockResolvedValue(array) } as any);
    const { result } = renderHook(() => useAudioController());

    await act(async () => {
      await result.current.playUrl('https://example.com/audio');
    });

    const contexts: MockAudioContext[] = (globalThis as any).__audioContexts;
    expect(global.fetch).toHaveBeenCalled();
    expect(contexts[0].decodeAudioData).toHaveBeenCalled();
  });

  it('stops all playback and closes contexts', async () => {
    const { result } = renderHook(() => useAudioController());

    await act(async () => {
      await result.current.playBuffer({ duration: 0.5 } as any);
    });

    act(() => {
      result.current.stop();
    });

    const contexts: MockAudioContext[] = (globalThis as any).__audioContexts;
    expect(contexts.every(ctx => ctx.state === 'closed')).toBe(true);
  });
});
