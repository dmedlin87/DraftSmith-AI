import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useAgentService } from '@/features/agent/hooks/useAgentService';
import { useProjectStore } from '@/features/project/store/useProjectStore';
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

const { projects, chapters, dbMock } = vi.hoisted(() => {
  const projects: any[] = [];
  const chapters: any[] = [];

  const dbMock = {
    projects: {
      orderBy: vi.fn(),
      add: vi.fn(),
      get: vi.fn(async (id: string) => projects.find(p => p.id === id) || null),
      update: vi.fn(),
    },
    chapters: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          sortBy: vi.fn(async () => [...chapters])
        }))
      })),
      add: vi.fn(async (chapter: any) => {
        chapters.push(chapter);
        return chapter.id;
      }),
      update: vi.fn(async (id: string, changes: any) => {
        const index = chapters.findIndex(c => c.id === id);
        if (index !== -1) {
          chapters[index] = { ...chapters[index], ...changes };
        }
      }),
      bulkPut: vi.fn(),
      bulkAdd: vi.fn(),
      delete: vi.fn(),
    }
  };

  return { projects, chapters, dbMock };
});

vi.mock('@/services/db', () => ({ db: dbMock }));
vi.mock('@/services/manuscriptIndexer', () => ({ createEmptyIndex: vi.fn(() => ({ characters: {}, lastUpdated: {} })) }));

let uuidCounter = 0;

const baseContext: EditorContext = {
  cursorPosition: 0,
  selection: null,
  totalLength: 12,
};

describe('Agent flow integration', () => {
  beforeEach(() => {
    uuidCounter = 0;
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => `uuid-${++uuidCounter}`) });
    projects.length = 0;
    chapters.length = 0;
    vi.clearAllMocks();

    const projectId = 'proj-1';
    const chapterId = 'ch-1';

    projects.push({ id: projectId, title: 'Test', author: 'Author', manuscriptIndex: { characters: {}, lastUpdated: {} }, createdAt: Date.now(), updatedAt: Date.now() });
    chapters.push({ id: chapterId, projectId, title: 'Chapter 1', content: 'Old content', order: 0, updatedAt: Date.now() });

    useProjectStore.setState({
      projects: [...projects],
      currentProject: projects[0] as any,
      chapters: [...chapters],
      activeChapterId: chapterId,
      isLoading: false,
    });
  });

  it('executes agent tool calls that update the manuscript', async () => {
    mockSendMessage.mockImplementation(async payload => {
      if (typeof (payload as any).message === 'string' && (payload as any).message.includes('[USER CONTEXT]')) {
        return {
          text: '',
          functionCalls: [
            { id: 'fn-1', name: 'update_manuscript', args: { oldText: 'Old content', newText: 'Rewritten content' } }
          ],
        };
      }

      if (Array.isArray((payload as any).message)) {
        return { text: 'Applied edit to manuscript' };
      }

      return { text: '' };
    });

    const onToolAction = vi.fn(async (_tool: string, args: Record<string, unknown>) => {
      const chapterId = useProjectStore.getState().activeChapterId!;
      await useProjectStore.getState().updateChapterContent(chapterId, args.newText as string);
      return 'Updated manuscript';
    });

    const { result } = renderHook(() => useAgentService('Old content', {
      chapters: useProjectStore.getState().chapters,
      analysis: null,
      onToolAction,
    }));

    await act(async () => {
      await result.current.sendMessage('Please rewrite this section', baseContext);
    });

    await waitFor(() => {
      expect(onToolAction).toHaveBeenCalledWith('update_manuscript', { oldText: 'Old content', newText: 'Rewritten content' });
    });

    const updatedChapter = useProjectStore.getState().chapters.find(c => c.id === useProjectStore.getState().activeChapterId);
    expect(updatedChapter?.content).toBe('Rewritten content');
    expect(result.current.messages.map(m => m.text)).toContain('Applied edit to manuscript');
  });
});
