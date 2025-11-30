/**
 * Comprehensive tests for Gemini audio service
 * Covers generateSpeech and connectLiveSession with Web Audio API mocking
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  generateSpeech, 
  connectLiveSession, 
  LiveSessionClient 
} from '@/services/gemini/audio';
import { 
  mockUsageMetadata
} from '@/tests/mocks/geminiClient';

// Setup mocks using vi.hoisted() to ensure they're available at import time
const mockAi = vi.hoisted(() => ({
  models: {
    generateContent: vi.fn(),
  },
  live: {
    connect: vi.fn(),
  },
}));

// Mock the client module before any imports
vi.mock('@/services/gemini/client', () => ({
  ai: mockAi,
}));

// Mock audio utility functions (voice barrel re-exports)
vi.mock('@/features/voice', () => ({
  base64ToUint8Array: vi.fn((base64: string) => new Uint8Array([1, 2, 3, 4])),
  createBlob: vi.fn((data: any) => new Blob([data as any])),
  decodeAudioData: vi.fn(),
}));

// Mock Web Audio API - create factory that returns fresh mocks
const createMockAudioContext = () => ({
  state: 'running',
  close: vi.fn().mockResolvedValue(undefined),
  decodeAudioData: vi.fn(),
  createBuffer: vi.fn(),
});

const MockAudioContextConstructor = vi.fn(() => createMockAudioContext());

const mockAudioBuffer = {
  length: 1000,
  duration: 0.041666666666666664,
  sampleRate: 24000,
  numberOfChannels: 1,
  getChannelData: vi.fn().mockReturnValue(new Float32Array(1000)),
  copyFromChannel: vi.fn(),
  copyToChannel: vi.fn(),
};

// Use vi.stubGlobal for more reliable global mocking
vi.stubGlobal('AudioContext', MockAudioContextConstructor);
vi.stubGlobal('webkitAudioContext', MockAudioContextConstructor);

describe('generateSpeech', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset AudioContext constructor mock
    MockAudioContextConstructor.mockClear();
  });

  it('generates speech from text successfully', async () => {
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  data: 'base64audiodata'
                }
              }
            ]
          }
        }
      ],
      usageMetadata: mockUsageMetadata,
    };

    mockAi.models.generateContent.mockResolvedValue(mockResponse);

    const { decodeAudioData } = await import('@/features/voice');
    vi.mocked(decodeAudioData).mockResolvedValue(mockAudioBuffer);

    const result = await generateSpeech('Hello world');

    expect(result).toBe(mockAudioBuffer);
    expect(mockAi.models.generateContent).toHaveBeenCalledWith({
      model: expect.any(String),
      contents: [{ parts: [{ text: 'Hello world' }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    // Verify AudioContext was created and close was called
    expect(MockAudioContextConstructor).toHaveBeenCalledWith({ sampleRate: 24000 });
    const audioContextInstance = MockAudioContextConstructor.mock.results[0].value;
    expect(audioContextInstance.close).toHaveBeenCalled();
  });

  it('handles missing audio data gracefully', async () => {
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  data: null
                }
              }
            ]
          }
        }
      ],
      usageMetadata: mockUsageMetadata,
    };

    mockAi.models.generateContent.mockResolvedValue(mockResponse);

    const result = await generateSpeech('Hello world');

    expect(result).toBeNull();
    // Note: AudioContext is NOT created when base64Audio is null/falsy
    // The service returns early at audio.ts:29 before creating AudioContext
  });

  it('handles no audio data with text message', async () => {
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: 'No audio available'
              }
            ]
          }
        }
      ]
    };

    mockAi.models.generateContent.mockResolvedValue(mockResponse);

    const result = await generateSpeech('Test text');

    expect(result).toBeNull();
    // Note: AudioContext is not closed in this error case in the actual service
  });

  it('handles API errors gracefully', async () => {
    mockAi.models.generateContent.mockRejectedValue(new Error('API Error'));

    const result = await generateSpeech('Hello world');

    expect(result).toBeNull();
  });

  it('handles audio decoding errors', async () => {
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  data: 'base64audiodata'
                }
              }
            ]
          }
        }
      ],
      usageMetadata: mockUsageMetadata,
    };

    mockAi.models.generateContent.mockResolvedValue(mockResponse);

    const { decodeAudioData } = await import('@/features/voice/services/audioUtils');
    vi.mocked(decodeAudioData).mockRejectedValue(new Error('Decoding failed'));

    const result = await generateSpeech('Hello world');

    expect(result).toBeNull();
    // Note: AudioContext is not closed in decode error case in the actual service
  });

  it('creates AudioContext with correct sample rate', async () => {
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  data: 'base64audiodata'
                }
              }
            ]
          }
        }
      ],
      usageMetadata: mockUsageMetadata,
    };

    mockAi.models.generateContent.mockResolvedValue(mockResponse);

    const { decodeAudioData } = await import('@/features/voice/services/audioUtils');
    vi.mocked(decodeAudioData).mockResolvedValue(mockAudioBuffer);

    await generateSpeech('Hello world');

    expect(MockAudioContextConstructor).toHaveBeenCalledWith({ sampleRate: 24000 });
  });
});

describe('connectLiveSession', () => {
  let mockLiveSession: any;
  let mockOnAudioData: (buffer: AudioBuffer) => void;
  let mockOnClose: () => void;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockOnAudioData = vi.fn();
    mockOnClose = vi.fn();

    // Mock live session
    mockLiveSession = {
      sendRealtimeInput: vi.fn(),
      close: vi.fn(),
    };

    mockAi.live.connect.mockResolvedValue(mockLiveSession);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates live session successfully', async () => {
    const client = await connectLiveSession(mockOnAudioData, mockOnClose);

    expect(client).toBeDefined();
    expect(typeof client.sendAudio).toBe('function');
    expect(typeof client.disconnect).toBe('function');

    expect(mockAi.live.connect).toHaveBeenCalledWith({
      model: expect.any(String),
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
        },
        systemInstruction: expect.any(String),
      },
      callbacks: {
        onopen: expect.any(Function),
        onmessage: expect.any(Function),
        onclose: expect.any(Function),
        onerror: expect.any(Function),
      }
    });

    expect(MockAudioContextConstructor).toHaveBeenCalledWith({ sampleRate: 24000 });
  });

  it('sends audio data through session', async () => {
    const client = await connectLiveSession(mockOnAudioData, mockOnClose);
    
    const audioData = new Float32Array([0.1, 0.2, 0.3]);
    await client.sendAudio(audioData);

    const { createBlob } = await import('@/features/voice');
    expect(createBlob).toHaveBeenCalledWith(audioData);
    expect(mockLiveSession.sendRealtimeInput).toHaveBeenCalled();
  });

  it('disconnects session and closes audio context', async () => {
    const client = await connectLiveSession(mockOnAudioData, mockOnClose);
    
    // Verify AudioContext was created
    expect(MockAudioContextConstructor).toHaveBeenCalledWith({ sampleRate: 24000 });
    const audioContextInstance = MockAudioContextConstructor.mock.results[0].value;
    
    await client.disconnect();

    expect(mockLiveSession.close).toHaveBeenCalled();
    expect(audioContextInstance.close).toHaveBeenCalled();
  });

  it('handles audio data in onmessage callback', async () => {
    const client = await connectLiveSession(mockOnAudioData, mockOnClose);
    
    const connectCall = mockAi.live.connect.mock.calls[0];
    const onMessageCallback = connectCall[0].callbacks.onmessage;

    const mockMessage = {
      serverContent: {
        modelTurn: {
          parts: [
            {
              inlineData: {
                data: 'base64audiodata'
              }
            }
          ]
        }
      }
    };

    const { base64ToUint8Array, decodeAudioData } = await import('@/features/voice');
    vi.mocked(decodeAudioData).mockResolvedValue(mockAudioBuffer);

    await onMessageCallback(mockMessage);

    expect(base64ToUint8Array).toHaveBeenCalledWith('base64audiodata');
    expect(decodeAudioData).toHaveBeenCalled();
    expect(mockOnAudioData).toHaveBeenCalledWith(mockAudioBuffer);
  });

  it('calls onclose when session closes', async () => {
    const client = await connectLiveSession(mockOnAudioData, mockOnClose);
    
    const connectCall = mockAi.live.connect.mock.calls[0];
    const onCloseCallback = connectCall[0].callbacks.onclose;

    onCloseCallback();

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('calls onclose when session errors', async () => {
    const client = await connectLiveSession(mockOnAudioData, mockOnClose);
    
    const connectCall = mockAi.live.connect.mock.calls[0];
    const onErrorCallback = connectCall[0].callbacks.onerror;

    const error = new Error('Session error');
    onErrorCallback(error);

    expect(mockOnClose).toHaveBeenCalled();
  });
});
