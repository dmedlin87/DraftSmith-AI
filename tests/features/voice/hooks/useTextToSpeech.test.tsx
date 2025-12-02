import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';
import { useTextToSpeech } from '@/features/voice/hooks/useTextToSpeech';
import { generateSpeech } from '@/services/gemini/audio';

vi.mock('@/services/gemini/audio', () => ({
  generateSpeech: vi.fn(async () => ({}) as any),
}));

const createMockAudioContext = () => {
  const bufferSource: any = {
    connect: vi.fn(),
    start: vi.fn(),
    onended: null as (() => void) | null,
    buffer: null as unknown,
  };

  const context: any = {
    state: 'running',
    destination: {},
    close: vi.fn(() => {
      context.state = 'closed';
    }),
    createBufferSource: vi.fn(() => bufferSource),
  };

  return { context, bufferSource };
};

describe('useTextToSpeech', () => {
  let mockAudio: ReturnType<typeof createMockAudioContext>;

  beforeEach(() => {
    mockAudio = createMockAudioContext();
    // @ts-expect-error test-only audio context
    global.AudioContext = vi.fn().mockImplementation(() => mockAudio.context);
    // @ts-expect-error test-only audio context
    global.webkitAudioContext = undefined;
  });

  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('plays synthesized audio and resets when playback ends', async () => {
    const { result } = renderHook(() => useTextToSpeech());

    await act(async () => {
      await result.current.play('Hello world');
    });

    expect(result.current.isPlaying).toBe(true);
    expect(mockAudio.bufferSource.start).toHaveBeenCalled();

    act(() => {
      mockAudio.bufferSource.onended?.();
    });

    expect(result.current.isPlaying).toBe(false);
    expect(mockAudio.context.close).toHaveBeenCalled();
  });

  it('surfaces errors from the audio pipeline', async () => {
    vi.mocked(generateSpeech).mockImplementationOnce(async () => {
      throw new Error('boom');
    });
    const { result } = renderHook(() => useTextToSpeech());

    await act(async () => {
      await result.current.play('bad');
    });

    expect(result.current.isPlaying).toBe(false);
    expect(result.current.error).toBe('Could not read text aloud.');
  });

  it('stops playback and aborts pending requests', async () => {
    const abortSpy = vi.spyOn(AbortController.prototype, 'abort');
    const { result } = renderHook(() => useTextToSpeech());

    await act(async () => {
      await result.current.play('stop me');
    });

    await act(async () => {
      result.current.stop();
    });

    expect(abortSpy).toHaveBeenCalled();
    expect(result.current.isPlaying).toBe(false);
  });

  it('closes existing context when stop is called mid-playback', async () => {
    const { result } = renderHook(() => useTextToSpeech());

    await act(async () => {
      await result.current.play('closing');
    });

    await act(async () => {
      result.current.stop();
    });

    expect(mockAudio.context.close).toHaveBeenCalled();
    expect(result.current.isPlaying).toBe(false);
  });

  it('aborts playback before audio creation completes', async () => {
    let resolveSpeech: (value: any) => void;
    vi.mocked(generateSpeech).mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveSpeech = resolve;
      }) as any
    );

    const abortSpy = vi.spyOn(AbortController.prototype, 'abort');
    const { result } = renderHook(() => useTextToSpeech());

    await act(async () => {
      const playPromise = result.current.play('slow');
      result.current.stop();
      resolveSpeech?.({});
      await playPromise;
    });

    expect(abortSpy).toHaveBeenCalled();
    expect(result.current.isPlaying).toBe(false);
  });

  it('handles null responses from speech generation', async () => {
    vi.mocked(generateSpeech).mockResolvedValueOnce(null as any);
    const { result } = renderHook(() => useTextToSpeech());

    await act(async () => {
      await result.current.play('empty');
    });

    expect(result.current.error).toBe('Could not read text aloud.');
    expect(result.current.isPlaying).toBe(false);
    expect(mockAudio.context.createBufferSource).not.toHaveBeenCalled();
  });

  it('fails gracefully when Web Audio API is unavailable', async () => {
    // @ts-expect-error remove audio APIs
    global.AudioContext = undefined;
    // @ts-expect-error remove audio APIs
    global.webkitAudioContext = undefined;
    const { result } = renderHook(() => useTextToSpeech());

    await act(async () => {
      await result.current.play('unsupported');
    });

    expect(result.current.error).toBe('Could not read text aloud.');
    expect(result.current.isPlaying).toBe(false);
  });

  it('cleans up resources on unmount even if playback is active', async () => {
    const abortSpy = vi.spyOn(AbortController.prototype, 'abort');
    const { result, unmount } = renderHook(() => useTextToSpeech());

    await act(async () => {
      await result.current.play('cleanup');
    });

    await act(async () => {
      unmount();
    });

    expect(mockAudio.context.close).toHaveBeenCalled();
    expect(abortSpy).toHaveBeenCalled();
  });
});
