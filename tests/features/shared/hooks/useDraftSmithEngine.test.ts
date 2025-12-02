import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useQuillAIEngine } from '@/features/shared/hooks/useDraftSmithEngine';

const trackUsage = vi.fn();

vi.mock('@/features/shared/context/UsageContext', () => ({
  useUsage: () => ({ trackUsage }),
}));

vi.mock('@/services/gemini/analysis', () => ({
  analyzeDraft: vi.fn(async () => ({
    result: {} as any,
    usage: { promptTokenCount: 1, totalTokenCount: 2 },
    warning: null,
  })),
}));

vi.mock('@/features/editor', () => ({
  useMagicEditor: () => ({
    state: { isMagicBusy: false },
    actions: {
      applyMagic: vi.fn(),
      resetMagic: vi.fn(),
      acceptMagic: vi.fn(),
      rejectMagic: vi.fn(),
    },
  }),
}));

vi.mock('@/services/gemini/memoryToolHandlers', () => ({
  isMemoryTool: vi.fn(() => false),
  executeMemoryTool: vi.fn(),
}));

describe('useQuillAIEngine handleAgentAction', () => {
  const baseProps = {
    getCurrentText: () => 'Hello world',
    currentProject: { id: 'p1' },
    activeChapterId: 'c1',
    updateChapterAnalysis: vi.fn(async () => {}),
    updateProjectLore: vi.fn(async () => {}),
    commit: vi.fn(),
    selectionRange: null,
    clearSelection: vi.fn(),
  } as const;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('proposes manuscript updates and accepts them', async () => {
    const { result } = renderHook(() => useQuillAIEngine(baseProps));

    await act(async () => {
      const message = await result.current.actions.handleAgentAction('update_manuscript', {
        search_text: 'Hello',
        replacement_text: 'Hi',
      });
      expect(message).toContain('Edit proposed');
    });

    expect(result.current.state.pendingDiff?.modified).toBe('Hi world');

    act(() => {
      result.current.actions.acceptDiff();
    });

    expect(baseProps.commit).toHaveBeenCalledWith('Hi world', 'Agent Edit', 'Agent');
  });

  it('queues append edits with newline handling', async () => {
    const { result } = renderHook(() =>
      useQuillAIEngine({ ...baseProps, getCurrentText: () => 'Line one' }),
    );

    await act(async () => {
      const message = await result.current.actions.handleAgentAction('append_to_manuscript', {
        text_to_add: 'Line two',
      });
      expect(message).toContain('Edit proposed');
    });

    expect(result.current.state.pendingDiff?.modified).toBe('Line one\nLine two');
  });

  it('supports undo and unknown agent actions', async () => {
    const { result } = renderHook(() => useQuillAIEngine(baseProps));

    await act(async () => {
      const undoMessage = await result.current.actions.handleAgentAction('undo_last_change', {});
      expect(undoMessage).toContain('undo button');

      const unknown = await result.current.actions.handleAgentAction('nonexistent', {});
      expect(unknown).toBe('Unknown action.');
    });
  });
});

