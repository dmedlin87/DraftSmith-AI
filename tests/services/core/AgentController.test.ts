import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DefaultAgentController } from '@/services/core/AgentController';

const {
  mockCreateAgentSession,
  mockSendMessage,
  mockGetOrCreateBedsideNote,
} = vi.hoisted(() => {
  const mockSendMessage = vi.fn();
  const mockCreateAgentSession = vi.fn(() => ({
    sendMessage: mockSendMessage,
  }));

  const mockGetOrCreateBedsideNote = vi.fn(async () => ({
    text: 'Existing bedside note summary',
  }));

  return { mockCreateAgentSession, mockSendMessage, mockGetOrCreateBedsideNote };
});

vi.mock('@/services/gemini/agent', () => ({
  createAgentSession: mockCreateAgentSession,
}));

vi.mock('@/services/memory', () => ({
  getOrCreateBedsideNote: mockGetOrCreateBedsideNote,
}));

describe('DefaultAgentController', () => {
  const persona = {
    id: 'guide',
    name: 'The Guide',
    icon: '\ud83e\uddd1\u200d\ud83e\udded',
    role: 'Helpful writing guide',
    description: 'Helps you improve your manuscript',
    systemPrompt: 'Be a helpful, constructive writing guide.',
  } as any;

  const baseContext = {
    fullText: 'Once upon a time',
    chapters: [
      {
        id: 'ch1',
        title: 'Chapter 1',
        content: 'Once upon a time',
        order: 0,
        updatedAt: Date.now(),
      },
    ],
    critiqueIntensity: 'standard',
    experienceLevel: 'intermediate',
    autonomyMode: 'copilot',
    projectId: 'p1',
  } as any;

  const editorContext = {
    cursorPosition: 0,
    selection: null,
    totalLength: 17,
  } as any;

  const makeController = (overrides?: {
    events?: any;
    toolExecutorExecute?: (
      toolName: string,
      args: Record<string, unknown>,
    ) => Promise<{ success: boolean; message: string }>;
  }) => {
    const events =
      overrides?.events ?? {
        onStateChange: vi.fn(),
        onMessage: vi.fn(),
        onError: vi.fn(),
      };

    const toolExecutor = {
      execute: vi.fn(async () => ({ success: true, message: 'ok' })),
    } as any;

    if (overrides?.toolExecutorExecute) {
      toolExecutor.execute = vi.fn(overrides.toolExecutorExecute);
    }

    const controller = new DefaultAgentController({
      context: baseContext,
      deps: { toolExecutor },
      events,
      initialPersona: persona,
    });

    return { controller, events, toolExecutor };
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends a simple message without tool calls', async () => {
    // Init session
    mockSendMessage.mockResolvedValueOnce({ text: '' });
    // User message result without tools
    mockSendMessage.mockResolvedValueOnce({ text: 'Agent reply', functionCalls: [] });

    const { controller, events, toolExecutor } = makeController();

    await controller.sendMessage({ text: 'Hello', editorContext });

    expect(mockCreateAgentSession).toHaveBeenCalledTimes(1);
    expect(toolExecutor.execute).not.toHaveBeenCalled();

    const stateCalls = (events.onStateChange as any).mock.calls;
    const lastState = stateCalls[stateCalls.length - 1]?.[0];
    expect(lastState.status).toBe('idle');

    const messageTexts = (events.onMessage as any).mock.calls.map(
      (call: any[]) => call[0].text,
    );
    expect(messageTexts).toContain('Hello');
    expect(messageTexts).toContain('Agent reply');
  });

  it('runs tool loop when model returns functionCalls', async () => {
    // Init session
    mockSendMessage.mockResolvedValueOnce({ text: '' });
    // First model response after user message: one tool call
    mockSendMessage.mockResolvedValueOnce({
      text: '',
      functionCalls: [
        { id: 'call-1', name: 'update_manuscript', args: { foo: 'bar' } },
      ],
    });
    // Second model response after tools: final text
    mockSendMessage.mockResolvedValueOnce({
      text: 'After tools',
      functionCalls: [],
    });

    const events = {
      onStateChange: vi.fn(),
      onMessage: vi.fn(),
      onError: vi.fn(),
    };

    const { controller, toolExecutor } = makeController({
      events,
      toolExecutorExecute: async () => ({ success: true, message: 'tool-ok' }),
    });

    await controller.sendMessage({ text: 'Run a tool', editorContext });

    expect(toolExecutor.execute).toHaveBeenCalledTimes(1);
    expect(toolExecutor.execute).toHaveBeenCalledWith(
      'update_manuscript',
      { foo: 'bar' },
    );

    // One send for init, one for user context, one for tool loop
    expect(mockSendMessage).toHaveBeenCalledTimes(3);

    const stateCalls = (events.onStateChange as any).mock.calls;
    const statuses = stateCalls.map((call: any[]) => call[0].status);

    expect(statuses).toContain('executing');
    expect(statuses[statuses.length - 1]).toBe('idle');

    const messageTexts = (events.onMessage as any).mock.calls.map(
      (call: any[]) => call[0].text,
    );
    expect(messageTexts).toContain('Run a tool');
    expect(
      messageTexts.some(text =>
        text.startsWith('\ud83d\udd28 Suggesting Action: update_manuscript'),
      ),
    ).toBe(true);
    expect(messageTexts).toContain('After tools');
    expect(
      messageTexts.some(text => text.includes('Bedside note may need an update')),
    ).toBe(true);

    const toolResponsePayload = mockSendMessage.mock.calls[2][0].message[0].functionResponse.response
      .result as string;
    expect(toolResponsePayload).toContain('Reflection: Should the bedside note be updated');
    expect(mockGetOrCreateBedsideNote).toHaveBeenCalled();
  });

  it('skips bedside-note suggestion when update tool already ran', async () => {
    mockSendMessage.mockResolvedValueOnce({ text: '' });
    mockSendMessage.mockResolvedValueOnce({
      text: '',
      functionCalls: [
        { id: 'call-1', name: 'update_bedside_note', args: { foo: 'bar' } },
      ],
    });
    mockSendMessage.mockResolvedValueOnce({
      text: 'After bedside update',
      functionCalls: [],
    });

    const events = {
      onStateChange: vi.fn(),
      onMessage: vi.fn(),
      onError: vi.fn(),
    };

    const { controller, toolExecutor } = makeController({
      events,
      toolExecutorExecute: async () => ({ success: true, message: 'bedside updated' }),
    });

    await controller.sendMessage({ text: 'Reflect on bedside', editorContext });

    const messageTexts = (events.onMessage as any).mock.calls.map(
      (call: any[]) => call[0].text,
    );

    expect(messageTexts.some(text => text.includes('Bedside note may need an update'))).toBe(
      false,
    );
    expect(toolExecutor.execute).toHaveBeenCalledWith('update_bedside_note', { foo: 'bar' });
    expect(mockGetOrCreateBedsideNote).not.toHaveBeenCalled();
  });

  it('does not add reflection text for non-significant tools', async () => {
    mockSendMessage.mockResolvedValueOnce({ text: '' });
    mockSendMessage.mockResolvedValueOnce({
      text: '',
      functionCalls: [
        { id: 'call-1', name: 'highlight_text', args: { foo: 'bar' } },
      ],
    });
    mockSendMessage.mockResolvedValueOnce({ text: 'No reflection', functionCalls: [] });

    const { controller } = makeController({
      toolExecutorExecute: async () => ({ success: true, message: 'highlighted' }),
    });

    await controller.sendMessage({ text: 'Highlight only', editorContext });

    const toolResponsePayload = mockSendMessage.mock.calls[2][0].message[0].functionResponse.response
      .result as string;

    expect(toolResponsePayload).toBe('highlighted');
    expect(mockGetOrCreateBedsideNote).not.toHaveBeenCalled();
  });

  it('honors an already-aborted external signal by skipping tools and final reply', async () => {
    // Init session
    mockSendMessage.mockResolvedValueOnce({ text: '' });
    // First model response after user message: would normally trigger tools
    mockSendMessage.mockResolvedValueOnce({
      text: '',
      functionCalls: [
        { id: 'call-1', name: 'update_manuscript', args: { foo: 'bar' } },
      ],
    });

    const events = {
      onStateChange: vi.fn(),
      onMessage: vi.fn(),
      onError: vi.fn(),
    };

    const { controller, toolExecutor } = makeController({ events });

    const externalAbort = new AbortController();
    // Mark the signal as already aborted before sending
    externalAbort.abort();

    await controller.sendMessage({
      text: 'Should abort',
      editorContext,
      options: { abortSignal: externalAbort.signal },
    });

    // Tool executor should never be invoked because the shared loop short-circuits
    expect(toolExecutor.execute).not.toHaveBeenCalled();

    const messageTexts = (events.onMessage as any).mock.calls.map(
      (call: any[]) => call[0].text,
    );

    // User message is still emitted
    expect(messageTexts).toContain('Should abort');
    // But no final model reply is produced because we exit via the abort branch
    expect(messageTexts.length).toBe(1);
  });

  it('handles model errors by updating state and emitting a friendly error message', async () => {
    // Init session
    mockSendMessage.mockResolvedValueOnce({ text: '' });
    const error = new Error('boom');
    // User message result rejects with a non-AbortError
    mockSendMessage.mockRejectedValueOnce(error);

    const events = {
      onStateChange: vi.fn(),
      onMessage: vi.fn(),
      onError: vi.fn(),
    };

    const { controller } = makeController({ events });

    await controller.sendMessage({ text: 'Trigger error', editorContext });

    const stateCalls = (events.onStateChange as any).mock.calls;
    const lastState = stateCalls[stateCalls.length - 1]?.[0];
    expect(lastState.status).toBe('error');
    expect(lastState.lastError).toBe('boom');

    expect(events.onError).toHaveBeenCalledWith(error);

    const messageTexts = (events.onMessage as any).mock.calls.map(
      (call: any[]) => call[0].text,
    );
    expect(messageTexts).toContain('Trigger error');
    expect(
      messageTexts.some(text =>
        text.includes('Sorry, I encountered an error connecting to the Agent.'),
      ),
    ).toBe(true);
  });

  it('treats AbortError as a clean cancellation without error state', async () => {
    // Init session
    mockSendMessage.mockResolvedValueOnce({ text: '' });
    // User message result rejects with a DOMException AbortError
    const abortError = new DOMException('Aborted', 'AbortError');
    mockSendMessage.mockRejectedValueOnce(abortError);

    const events = {
      onStateChange: vi.fn(),
      onMessage: vi.fn(),
      onError: vi.fn(),
    };

    const { controller } = makeController({ events });

    await controller.sendMessage({ text: 'Will be aborted', editorContext });

    const stateCalls = (events.onStateChange as any).mock.calls;
    const lastState = stateCalls[stateCalls.length - 1]?.[0];
    expect(lastState.status).toBe('idle');
    expect(lastState.lastError).toBeUndefined();

    const messageTexts = (events.onMessage as any).mock.calls.map(
      (call: any[]) => call[0].text,
    );
    // User message is still emitted
    expect(messageTexts).toContain('Will be aborted');
    // But no friendly error message is emitted for aborts
    expect(
      messageTexts.some(text =>
        text.includes('Sorry, I encountered an error connecting to the Agent.'),
      ),
    ).toBe(false);
    expect(events.onError).not.toHaveBeenCalled();
  });
});
