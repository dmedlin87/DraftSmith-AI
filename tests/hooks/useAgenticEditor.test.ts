import { act, renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAgenticEditor } from '@/features/agent/hooks/useAgenticEditor';
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

describe('useAgenticEditor', () => {
  let currentText = 'Hello world';
  const editorActions = {
    updateText: vi.fn((text: string) => { currentText = text; }),
    undo: vi.fn(() => true),
    redo: vi.fn(() => true),
    getEditorContext: vi.fn((): EditorContext => ({
      cursorPosition: 0,
      selection: null,
      totalLength: currentText.length,
    })),
    getCurrentText: vi.fn(() => currentText),
  };

  beforeEach(() => {
    currentText = 'Hello world';
    vi.clearAllMocks();
    mockSendMessage.mockReset();
    mockCreateAgentSession.mockClear();
  });

  it('applies manuscript updates via tool invocation', async () => {
    mockSendMessage.mockImplementation(async payload => {
      if (Array.isArray((payload as any).message)) {
        return { text: 'Updated' };
      }

      if (typeof (payload as any).message === 'string' && (payload as any).message.includes('[USER CONTEXT]')) {
        return { functionCalls: [{ id: '1', name: 'update_manuscript', args: { oldText: 'Hello', newText: 'Hi' } }] };
      }

      return { text: '' };
    });

    const { result } = renderHook(() => useAgenticEditor({
      editorActions,
      chapters: [{ title: 'One', content: currentText }],
      analysis: null,
    }));

    await act(async () => {
      await result.current.sendMessage('Rewrite the intro');
    });

    expect(editorActions.updateText).toHaveBeenCalledWith('Hi world', 'Agent: Manuscript update');
    expect(currentText).toBe('Hi world');
    expect(mockSendMessage.mock.calls.length).toBeGreaterThanOrEqual(3); // init + user + function response
  });

  it('handles undo requests from the agent', async () => {
    mockSendMessage.mockImplementation(async payload => {
      if (Array.isArray((payload as any).message)) {
        return { text: 'Undone' };
      }

      if (typeof (payload as any).message === 'string' && (payload as any).message.includes('[USER CONTEXT]')) {
        return { functionCalls: [{ id: 'undo', name: 'undo_last_change', args: {} }] };
      }

      return { text: '' };
    });

    const { result } = renderHook(() => useAgenticEditor({
      editorActions,
      chapters: [{ title: 'One', content: currentText }],
      analysis: null,
    }));

    await act(async () => {
      await result.current.sendMessage('Undo the last change');
    });

    expect(editorActions.undo).toHaveBeenCalled();
    expect(result.current.messages.at(-1)?.text).toBe('Undone');
  });
});
