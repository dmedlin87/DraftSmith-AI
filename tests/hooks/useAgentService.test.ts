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
      chapters: [{ title: 'Chapter 1', content: 'Hello world' }],
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

  it('clears messages and reinitializes the session', async () => {
    mockSendMessage.mockImplementation(async payload => {
      if (typeof (payload as any).message === 'string' && (payload as any).message.includes('[USER CONTEXT]')) {
        return { text: 'Response' };
      }

      return { text: '' };
    });

    const onToolAction = vi.fn().mockResolvedValue('done');

    const { result } = renderHook(() => useAgentService('Sample', {
      chapters: [{ title: 'One', content: 'Sample' }],
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
      chapters: [{ title: 'One', content: 'Text' }],
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
});
