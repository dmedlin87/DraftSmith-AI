import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAgentOrchestrator } from '@/features/agent/hooks/useAgentOrchestrator';

const {
  mockCreateAgentSession,
  mockSendMessage,
  mockUseAppBrain,
  mockExecuteAgentToolCall,
  brainValue,
} = vi.hoisted(() => {
  const mockSendMessage = vi.fn();
  const mockCreateAgentSession = vi.fn(() => ({
    sendMessage: mockSendMessage,
  }));

  const brainValue = {
    state: {
      manuscript: {
        projectId: 'p1',
        projectTitle: 'Test Project',
        chapters: [
          { id: 'ch1', title: 'Chapter 1', content: 'Once upon a time', order: 0, updatedAt: Date.now() },
        ],
        activeChapterId: 'ch1',
        currentText: 'Once upon a time',
        branches: [],
        activeBranchId: null,
        setting: undefined,
      },
      lore: {
        characters: [],
        worldRules: [],
        manuscriptIndex: null,
      },
      analysis: {
        result: null,
        status: 'idle',
        inlineComments: [],
      },
      intelligence: {
        hud: null,
        full: null,
        entities: null,
        timeline: null,
        style: null,
        heatmap: null,
        lastProcessedAt: 0,
      },
      ui: {
        cursor: { position: 0, scene: null, paragraph: null },
        selection: null,
        activePanel: 'chat',
        activeView: 'editor',
        isZenMode: false,
        activeHighlight: null,
        microphone: { status: 'idle', mode: 'voice', lastTranscript: null, error: null },
      },
      session: {
        chatHistory: [],
        currentPersona: null,
        pendingToolCalls: [],
        lastAgentAction: null,
        isProcessing: false,
      },
    },
    actions: {},
    context: {
      getCompressedContext: () => 'COMPRESSED-CONTEXT',
    },
  };

  const mockUseAppBrain = vi.fn(() => brainValue);

  const mockExecuteAgentToolCall = vi.fn(async () => ({
    success: true,
    message: 'tool-ok',
  }));

  return {
    mockCreateAgentSession,
    mockSendMessage,
    mockUseAppBrain,
    mockExecuteAgentToolCall,
    brainValue,
  };
});

vi.mock('@/services/gemini/agent', () => ({
  createAgentSession: mockCreateAgentSession,
}));

vi.mock('@/features/core', () => ({
  useAppBrain: mockUseAppBrain,
}));

vi.mock('@/services/gemini/toolExecutor', () => ({
  executeAgentToolCall: mockExecuteAgentToolCall,
}));

vi.mock('@/services/appBrain', () => ({
  emitToolExecuted: vi.fn(),
  eventBus: {
    getChangeLog: vi.fn(() => []),
    subscribeForOrchestrator: vi.fn(() => () => {}),
  },
}));

vi.mock('@/features/settings', () => ({
  useSettingsStore: (selector: any) => selector({
    critiqueIntensity: 'standard',
    experienceLevel: 'intermediate',
    autonomyMode: 'copilot',
  }),
}));

describe('useAgentOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes session and marks isReady', async () => {
    mockSendMessage.mockResolvedValueOnce({ text: '' });

    const { result } = renderHook(() => useAgentOrchestrator());

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
      expect(result.current.state.status).toBe('idle');
    });

    expect(mockCreateAgentSession).toHaveBeenCalledTimes(1);
  });

  it('sends a message and transitions through thinking back to idle', async () => {
    // First call: initialization message
    mockSendMessage.mockResolvedValueOnce({ text: '' });
    // Second call: user request without tool calls
    mockSendMessage.mockResolvedValueOnce({ text: 'Agent reply' });

    const { result } = renderHook(() => useAgentOrchestrator());

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    await act(async () => {
      await result.current.sendMessage('Help me',);
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('idle');
      expect(result.current.isProcessing).toBe(false);
      expect(result.current.messages.some(m => m.role === 'user')).toBe(true);
      expect(result.current.messages.some(m => m.role === 'model' && m.text === 'Agent reply' || m.text === 'Done.')).toBe(true);
    });
  });

  it('ignores empty or whitespace-only messages', async () => {
    // Init
    mockSendMessage.mockResolvedValueOnce({ text: '' });

    const { result } = renderHook(() => useAgentOrchestrator());

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    const initialMessagesLength = result.current.messages.length;

    await act(async () => {
      await result.current.sendMessage('   ');
    });

    // No additional chat calls beyond initialization
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(result.current.messages.length).toBe(initialMessagesLength);
  });

  it('handles a simple tool call round trip', async () => {
    // Init
    mockSendMessage.mockResolvedValueOnce({ text: '' });
    // First user send: returns one tool call
    mockSendMessage.mockResolvedValueOnce({
      text: '',
      functionCalls: [
        { id: 'call-1', name: 'update_manuscript', args: { foo: 'bar' } },
      ],
    });
    // Second send (after tool execution) returns final text
    mockSendMessage.mockResolvedValueOnce({ text: 'After tools' });

    const { result } = renderHook(() => useAgentOrchestrator());

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    await act(async () => {
      await result.current.sendMessage('Run a tool');
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('idle');
      expect(result.current.state.lastToolCall).toEqual({ name: 'update_manuscript', success: true });
    });

    expect(mockExecuteAgentToolCall).toHaveBeenCalledWith(
      'update_manuscript',
      { foo: 'bar' },
      expect.any(Object),
      'p1',
    );
  });

  it('handles agent errors gracefully and exposes error state', async () => {
    // Init
    mockSendMessage.mockResolvedValueOnce({ text: '' });
    // User send: force an error from the agent
    mockSendMessage.mockRejectedValueOnce(new Error('boom'));

    const { result } = renderHook(() => useAgentOrchestrator());

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    await act(async () => {
      await result.current.sendMessage('Trigger error');
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('error');
      expect(result.current.state.lastError).toBe('boom');
    });

    const friendlyError = result.current.messages.find(
      m => m.role === 'model' && m.text.includes('Sorry, I encountered an error'),
    );
    expect(friendlyError).toBeTruthy();
  });

  it('reinitializes session and logs a message when persona changes', async () => {
    // First init
    mockSendMessage.mockResolvedValueOnce({ text: '' });
    // Re-init after persona switch
    mockSendMessage.mockResolvedValueOnce({ text: '' });

    const { result } = renderHook(() => useAgentOrchestrator());

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    await act(async () => {
      result.current.setPersona({
        id: 'critic',
        name: 'The Critic',
        icon: '🧐',
        role: 'Harsh structural critic',
        description: 'Focuses on finding structural flaws',
        systemPrompt: 'Be a harsh structural critic.',
      } as any);
    });

    await waitFor(() => {
      expect(result.current.currentPersona.name).toBe('The Critic');
      const switchMessage = result.current.messages.find(
        m => m.role === 'model' && m.text.includes('Switched to The Critic'),
      );
      expect(switchMessage).toBeTruthy();
    });

    // One session for initial init, one for persona switch
    expect(mockCreateAgentSession).toHaveBeenCalledTimes(2);
  });

  it('reinitializes the agent session when context changes with autoReinit enabled', async () => {
    mockSendMessage.mockResolvedValue({ text: '' });

    const { result, rerender } = renderHook(() => useAgentOrchestrator());

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    expect(mockCreateAgentSession).toHaveBeenCalledTimes(1);

    act(() => {
      brainValue.state.analysis = {
        ...brainValue.state.analysis,
        result: 'New analysis ready',
      } as any;
    });

    rerender();

    await waitFor(() => {
      expect(mockCreateAgentSession).toHaveBeenCalledTimes(2);
    });
  });

  it('exposes voice mode flag when initialized in voice mode', async () => {
    mockSendMessage.mockResolvedValueOnce({ text: '' });

    const { result } = renderHook(() => useAgentOrchestrator({ mode: 'voice' }));

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    expect(result.current.isVoiceMode).toBe(true);
  });
 
  it('aborts an in-flight request without adding a final model message', async () => {
    let resolveSecond: ((value: any) => void) | undefined;

    mockSendMessage.mockResolvedValueOnce({ text: '' });
    mockSendMessage.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveSecond = resolve;
        }),
    );

    const { result } = renderHook(() => useAgentOrchestrator());

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    act(() => {
      void result.current.sendMessage('Will abort');
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('thinking');
    });

    act(() => {
      result.current.abort();
    });

    await act(async () => {
      resolveSecond?.({ text: 'Should not be shown', functionCalls: [] });
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('idle');
    });

    const modelMessages = result.current.messages.filter(m => m.role === 'model');
    expect(modelMessages.some(m => m.text === 'Should not be shown')).toBe(false);
  });
});
