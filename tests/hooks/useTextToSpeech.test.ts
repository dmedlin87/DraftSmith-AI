import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTextToSpeech } from '@/features/voice/hooks/useTextToSpeech';
import { generateSpeech } from '@/services/gemini/audio';

vi.mock('@/services/gemini/audio', () => ({
  generateSpeech: vi.fn(),
}));

class MockAudioBufferSourceNode {
  public buffer: any = null;
  public onended: (() => void) | null = null;
  public connect = vi.fn();
  public start = vi.fn();
  public stop = vi.fn();
}

class MockAudioContext {
  public state: 'running' | 'closed' = 'running';
  public destination = {};
  public close = vi.fn(async () => {
    this.state = 'closed';
  });

  constructor() {
    (globalThis as any).__lastTtsContext = this;
  }

  createBufferSource = vi.fn(() => {
    const source = new MockAudioBufferSourceNode();
    (globalThis as any).__lastTtsSource = source;
    return source;
  });
}

describe('useTextToSpeech', () => {
  beforeEach(() => {
    (globalThis as any).AudioContext = MockAudioContext as any;
    (globalThis as any).webkitAudioContext = undefined;
    (globalThis as any).__lastTtsSource = null;
    (globalThis as any).__lastTtsContext = null;
    vi.clearAllMocks();
  });

  it('plays generated speech and stops when audio ends', async () => {
    const audioBuffer = { duration: 1 } as any;
    (generateSpeech as vi.MockedFunction<typeof generateSpeech>).mockResolvedValue(audioBuffer);

    const { result } = renderHook(() => useTextToSpeech());

    await act(async () => {
      await result.current.play('hello world');
    });

    expect(result.current.isPlaying).toBe(true);
    const source = (globalThis as any).__lastTtsSource as MockAudioBufferSourceNode;
    act(() => {
      source.onended?.();
    });

    expect(result.current.isPlaying).toBe(false);
    const ctx = (globalThis as any).__lastTtsContext as MockAudioContext;
    expect(ctx.close).toHaveBeenCalled();
  });

  it('handles generation failures gracefully', async () => {
    (generateSpeech as vi.MockedFunction<typeof generateSpeech>).mockResolvedValue(null);

    const { result } = renderHook(() => useTextToSpeech());

    await act(async () => {
      await result.current.play('bad');
    });

    expect(result.current.isPlaying).toBe(false);
    expect(result.current.error).toBe('Could not read text aloud.');
  });

  it('abort controller cancels playback on stop', async () => {
    const audioBuffer = { duration: 1 } as any;
    (generateSpeech as vi.MockedFunction<typeof generateSpeech>).mockResolvedValue(audioBuffer);

    const { result } = renderHook(() => useTextToSpeech());

    await act(async () => {
      await result.current.play('stop me');
    });

    const ctx = (globalThis as any).__lastTtsContext as MockAudioContext;
    expect(ctx.state).toBe('running');

    act(() => {
      result.current.stop();
    });

    expect(ctx.close).toHaveBeenCalled();
    expect(result.current.isPlaying).toBe(false);
  });
});
