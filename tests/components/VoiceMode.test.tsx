import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { VoiceMode } from '@/features/voice/components/VoiceMode';
import { useVoiceSession } from '@/features/voice/hooks/useVoiceSession';
import { vi, MockedFunction } from 'vitest';

vi.mock('@/features/voice/hooks/useVoiceSession', () => ({
  useVoiceSession: vi.fn(),
}));

const mockedUseVoiceSession = useVoiceSession as MockedFunction<typeof useVoiceSession>;

const createAnalyser = () => ({
  frequencyBinCount: 32,
  getByteFrequencyData: vi.fn(),
}) as unknown as AnalyserNode;

describe('VoiceMode', () => {
  const originalGetContext = HTMLCanvasElement.prototype.getContext;

  beforeEach(() => {
    vi.clearAllMocks();
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      fill: vi.fn(),
      set fillStyle(value: string) {},
      set shadowBlur(value: number) {},
      set shadowColor(value: string) {},
    } as unknown as CanvasRenderingContext2D));
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1 as any);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    vi.restoreAllMocks();
  });

  it('shows the idle state and starts a session on click', () => {
    const startSession = vi.fn();

    mockedUseVoiceSession.mockReturnValue({
      isConnected: false,
      isAiSpeaking: false,
      error: null,
      startSession,
      stopSession: vi.fn(),
      volumeData: { inputVolume: 0, outputVolume: 0, inputFrequency: null, outputFrequency: null },
      inputAnalyserRef: { current: null },
      outputAnalyserRef: { current: null },
    });

    render(<VoiceMode />);

    expect(screen.getByText(/start voice session/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /start conversation/i }));
    expect(startSession).toHaveBeenCalled();
  });

  it('shows listening state and ends session on click', () => {
    const stopSession = vi.fn();

    mockedUseVoiceSession.mockReturnValue({
      isConnected: true,
      isAiSpeaking: false,
      error: null,
      startSession: vi.fn(),
      stopSession,
      volumeData: { inputVolume: 0, outputVolume: 0, inputFrequency: null, outputFrequency: null },
      inputAnalyserRef: { current: createAnalyser() },
      outputAnalyserRef: { current: createAnalyser() },
    });

    const { container } = render(<VoiceMode />);

    expect(screen.getByText(/listening/i)).toBeInTheDocument();
    expect(container.querySelector('canvas')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /end session/i }));
    expect(stopSession).toHaveBeenCalled();
  });

  it('displays AI speaking state and errors', () => {
    mockedUseVoiceSession.mockReturnValue({
      isConnected: true,
      isAiSpeaking: true,
      error: 'Microphone blocked',
      startSession: vi.fn(),
      stopSession: vi.fn(),
      volumeData: { inputVolume: 0, outputVolume: 0, inputFrequency: null, outputFrequency: null },
      inputAnalyserRef: { current: createAnalyser() },
      outputAnalyserRef: { current: createAnalyser() },
    });

    render(<VoiceMode />);

    expect(screen.getByText(/gemini is speaking/i)).toBeInTheDocument();
    expect(screen.getByText(/microphone blocked/i)).toBeInTheDocument();
  });
});
