import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

const { mockCreateAgentSession, mockSendMessage } = vi.hoisted(() => {
  const sendMessage = vi.fn();
  return {
    mockSendMessage: sendMessage,
    mockCreateAgentSession: vi.fn(() => ({ sendMessage })),
  };
});

vi.mock('@/services/gemini/agent', () => ({
  createAgentSession: mockCreateAgentSession,
}));

import { ChatInterface } from '@/features/agent/components/ChatInterface';
import { DEFAULT_PERSONAS } from '@/types/personas';
import { EditorContext } from '@/types';

const baseContext: EditorContext = {
  cursorPosition: 0,
  selection: null,
  totalLength: 0,
};

const baseProps = {
  editorContext: baseContext,
  fullText: 'Example manuscript',
  onAgentAction: vi.fn().mockResolvedValue('action complete'),
  chapters: [],
};

describe('ChatInterface', () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  beforeEach(() => {
    mockSendMessage.mockReset();
    mockCreateAgentSession.mockClear();
  });

  it('renders with persona selector and input', async () => {
    mockSendMessage.mockResolvedValue({ text: '', functionCalls: [] });

    render(<ChatInterface {...baseProps} />);

    expect(await screen.findByTitle(`Current: ${DEFAULT_PERSONAS[0].name}`)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Type \/ to use tools/i)).toBeInTheDocument();
  });

  it('sends user messages and displays agent responses', async () => {
    mockSendMessage
      .mockResolvedValueOnce({ text: 'init', functionCalls: [] })
      .mockResolvedValueOnce({ text: 'Agent reply', functionCalls: [] });

    render(<ChatInterface {...baseProps} />);

    const input = await screen.findByPlaceholderText(/Type \/ to use tools/i);
    const sendButton = screen.getAllByRole('button').at(-1);

    await userEvent.type(input, 'Hello agent');
    if (sendButton) {
      await userEvent.click(sendButton);
    }

    await waitFor(() => {
      expect(screen.getByText('Hello agent')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('Agent reply')).toBeInTheDocument();
    });

    expect(mockCreateAgentSession).toHaveBeenCalled();
    expect(mockSendMessage.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
