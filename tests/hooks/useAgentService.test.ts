import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAgentService } from '@/features/agent/hooks/useAgentService';
import { DEFAULT_PERSONAS } from '@/types/personas';
import type { FunctionCall } from '@google/genai';
import type { EditorContext } from '@/types';

const { mockSendMessage, mockCreateAgentSession } = vi.hoisted(() => {
  const mockSendMessage = vi.fn();
  const mockCreateAgentSession = vi.fn(() => ({
    sendMessage: mockSendMessage,
  }));

  return { mockSendMessage, mockCreateAgentSession };
});

vi.mock('@/services/gemini/agent', () => ({
  createAgentSession: mockCreateAgentSession,
}));

describe('useAgentService', () => {
  const baseContext: EditorContext = {
    cursorPosition: 0,
    selection: null,
    totalLength: 20,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSendMessage.mockReset();
    mockCreateAgentSession.mockClear();
  });

  it('processes tool calls and final responses', async () => {
    const toolCalls: FunctionCall[] = [
      { id: '1', name: 'update_manuscript', args: { oldText: 'Hello', newText: 'Hi' } },
    ];

    mockSendMessage.mockImplementation(async payload => {
      if (Array.isArray((payload as any).message)) {
        return { text: 'Completed edit' };
      }

      if (typeof (payload as any).message === 'string' && (payload as any).message.includes('[USER CONTEXT]')) {
        return { text: '', functionCalls: toolCalls };
      }

      return { text: '' };
    });

    const onToolAction = vi.fn().mockResolvedValue('Successfully updated the manuscript');

    const { result } = renderHook(() => useAgentService('Hello world', {
      chapters: [{ id: 'ch1', projectId: 'p1', title: 'Chapter 1', content: 'Hello world', order: 0, updatedAt: Date.now() }],
      analysis: null,
      onToolAction,
    }));

    await act(async () => {
      await result.current.sendMessage('Please update greeting', baseContext);
    });

    expect(onToolAction).toHaveBeenCalledWith('update_manuscript', { oldText: 'Hello', newText: 'Hi' });
    expect(mockSendMessage.mock.calls.length).toBeGreaterThanOrEqual(3); // init + user + tool response
    expect(result.current.messages.map(m => m.text)).toContain('🛠️ Suggesting Action: update_manuscript...');
    expect(result.current.messages.at(-1)?.text).toBe('Completed edit');
    expect(result.current.agentState.status).toBe('idle');
    expect(result.current.isProcessing).toBe(false);
  });

  it('ignores empty or whitespace-only messages', async () => {
    mockSendMessage.mockResolvedValue({ text: '' });

    const onToolAction = vi.fn().mockResolvedValue('ok');

    const { result } = renderHook(() =>
      useAgentService('Hello world', {
        chapters: [
          {
            id: 'ch1',
            projectId: 'p1',
            title: 'Chapter 1',
            content: 'Hello world',
            order: 0,
            updatedAt: Date.now(),
          },
        ],
        analysis: null,
        onToolAction,
      }),
    );

    // Wait for initial session initialization
    await waitFor(() => {
      expect(mockCreateAgentSession).toHaveBeenCalledTimes(1);
    });

    const initialSendCount = mockSendMessage.mock.calls.length;

    await act(async () => {
      await result.current.sendMessage('   ', baseContext);
    });

    // No additional sends beyond initialization
    expect(mockSendMessage.mock.calls.length).toBe(initialSendCount);
  });

  it('clears messages and reinitializes the session', async () => {
    mockSendMessage.mockImplementation(async payload => {
      if (typeof (payload as any).message === 'string' && (payload as any).message.includes('[USER CONTEXT]')) {
        return { text: 'Response' };
      }

      return { text: '' };
    });

    const onToolAction = vi.fn().mockResolvedValue('done');

    const { result } = renderHook(() => useAgentService('Sample', {
      chapters: [{ id: 'ch1', projectId: 'p1', title: 'One', content: 'Sample', order: 0, updatedAt: Date.now() }],
      onToolAction,
      analysis: null,
    }));

    await act(async () => {
      await result.current.sendMessage('Hi', baseContext);
    });

    expect(result.current.messages.length).toBeGreaterThan(0);
    const initialCreateCalls = mockCreateAgentSession.mock.calls.length;

    await act(async () => {
      result.current.clearMessages();
      await Promise.resolve();
    });

    expect(result.current.messages).toHaveLength(0);
    expect(mockCreateAgentSession.mock.calls.length).toBeGreaterThan(initialCreateCalls);
  });

  it('switches persona and announces the change', async () => {
    mockSendMessage.mockImplementation(async () => ({ text: 'Hello' }));

    const { result } = renderHook(() => useAgentService('Text', {
      chapters: [{ id: 'ch1', projectId: 'p1', title: 'One', content: 'Text', order: 0, updatedAt: Date.now() }],
      onToolAction: vi.fn(),
      analysis: null,
      initialPersona: DEFAULT_PERSONAS[0],
    }));

    const newPersona = DEFAULT_PERSONAS[1];

    await act(async () => {
      result.current.setPersona(newPersona);
    });

    await waitFor(() => {
      expect(result.current.currentPersona).toBe(newPersona);
      expect(result.current.messages.some(msg => msg.text.includes(`Switching to ${newPersona.name} mode`))).toBe(true);
    });

    expect(mockCreateAgentSession.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('applies a rolling message limit', async () => {
    mockSendMessage.mockResolvedValue({ text: 'Reply' });

    const onToolAction = vi.fn().mockResolvedValue('ok');

    const { result } = renderHook(() =>
      useAgentService('Hello world', {
        chapters: [{ id: 'ch1', projectId: 'p1', title: 'Chapter 1', content: 'Hello world', order: 0, updatedAt: Date.now() }],
        analysis: null,
        onToolAction,
        messageLimit: 3,
      }),
    );

    await act(async () => {
      await result.current.sendMessage('First', baseContext);
      await result.current.sendMessage('Second', baseContext);
    });

    await waitFor(() => {
      expect(result.current.messages.length).toBe(3);
    });

    const texts = result.current.messages.map(m => m.text);
    expect(texts).not.toContain('First');
    expect(texts).toContain('Second');
    expect(texts.filter(t => t === 'Reply').length).toBeGreaterThanOrEqual(1);
  });
});
