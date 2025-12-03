import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, beforeEach, expect, type Mock } from 'vitest';
import { EditorWorkspace } from '@/features/editor/components/EditorWorkspace';

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
    header: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => <header {...props}>{children}</header>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/features/project', () => ({
  useProjectStore: vi.fn(),
}));

vi.mock('@/features/shared', () => ({
  useEditor: vi.fn(),
  useEngine: vi.fn(),
  findQuoteRange: vi.fn(),
  useManuscriptIntelligence: vi.fn(() => ({
    intelligence: null,
    hud: { prioritizedIssues: [] },
    instantMetrics: { wordCount: 0 },
    isProcessing: false,
    updateText: vi.fn(),
    updateCursor: vi.fn(),
  })),
}));

vi.mock('@/features/core/context/EditorContext', () => ({
  useEditorState: vi.fn(),
  useEditorActions: vi.fn(),
}));

const mockRichTextProps = vi.fn();
const mockMagicBarProps = vi.fn();
const mockFindModalProps = vi.fn();

vi.mock('@/features/editor/components/RichTextEditor', () => ({
  RichTextEditor: (props: any) => {
    mockRichTextProps(props);
    return <div data-testid="rich-text-editor" />;
  },
}));

vi.mock('@/features/editor/components/MagicBar', () => ({
  MagicBar: (props: any) => {
    mockMagicBarProps(props);
    return <div data-testid="magic-bar" />;
  },
}));

vi.mock('@/features/editor/components/FindReplaceModal', () => ({
  FindReplaceModal: (props: any) => {
    mockFindModalProps(props);
    return props.isOpen ? <div data-testid="find-replace-modal" /> : null;
  },
}));

vi.mock('@/features/editor/components/VisualDiff', () => ({
  VisualDiff: () => <div data-testid="visual-diff" />,
}));

const mockHandleFixRequest = vi.fn();
vi.mock('@/features/layout/store/useLayoutStore', () => ({
  useLayoutStore: vi.fn((selector) => {
    const state = {
      handleFixRequest: mockHandleFixRequest,
    } as const;
    return typeof selector === 'function' ? selector(state) : state;
  }),
}));

const mockCommentCardProps = vi.fn();
vi.mock('@/features/editor/components/CommentCard', () => ({
  CommentCard: (props: any) => {
    mockCommentCardProps(props);
    return <div data-testid="comment-card">Comment Card</div>;
  },
}));

import { useProjectStore } from '@/features/project';
import { useEngine } from '@/features/shared';
import { useEditorState, useEditorActions } from '@/features/core/context/EditorContext';

const mockUseProjectStore = useProjectStore as unknown as Mock;
const mockUseEngine = useEngine as unknown as Mock;
const mockUseEditorState = useEditorState as unknown as Mock;
const mockUseEditorActions = useEditorActions as unknown as Mock;

describe('EditorWorkspace', () => {
  const mockRunAnalysis = vi.fn();
  const mockToggleZenMode = vi.fn();

  const setupMocks = (overridesEditor: Record<string, any> = {}, overridesEngine: Record<string, any> = {}) => {
    const { dismissComment: overrideDismissComment, ...editorStateOverrides } = overridesEditor;

    mockUseProjectStore.mockReturnValue({
      currentProject: { id: 'p1', title: 'Test Project', setting: { timePeriod: 'Modern', location: 'City' } },
      getActiveChapter: () => ({ id: 'ch1', title: 'Chapter 1', lastAnalysis: null }),
    });

    mockUseEditorState.mockReturnValue({
      editor: null,
      currentText: 'Sample manuscript text',
      history: [],
      redoStack: [],
      canUndo: false,
      canRedo: false,
      hasUnsavedChanges: false,
      selectionRange: null,
      selectionPos: null,
      cursorPosition: 0,
      activeHighlight: null,
      branches: [],
      activeBranchId: null,
      isOnMain: true,
      inlineComments: [],
      visibleComments: [],
      isZenMode: false,
      ...editorStateOverrides,
    });

    mockUseEditorActions.mockReturnValue({
      setEditor: vi.fn(),
      updateText: vi.fn(),
      commit: vi.fn(),
      loadDocument: vi.fn(),
      undo: vi.fn(),
      redo: vi.fn(),
      restore: vi.fn(),
      setSelection: vi.fn(),
      setSelectionState: vi.fn(),
      clearSelection: vi.fn(),
      handleNavigateToIssue: vi.fn(),
      scrollToPosition: vi.fn(),
      getEditorContext: vi.fn(),
      createBranch: vi.fn(),
      switchBranch: vi.fn(),
      mergeBranch: vi.fn(),
      deleteBranch: vi.fn(),
      renameBranch: vi.fn(),
      setInlineComments: vi.fn(),
      dismissComment: overrideDismissComment || vi.fn(),
      clearComments: vi.fn(),
      toggleZenMode: mockToggleZenMode,
    });

    const defaultEngineState = {
      isAnalyzing: false,
      isMagicLoading: false,
      magicVariations: [],
      magicHelpResult: null,
      magicHelpType: null,
      activeMagicMode: null,
      pendingDiff: null,
      grammarSuggestions: [],
      grammarHighlights: [],
    };

    const defaultEngineActions = {
      runAnalysis: mockRunAnalysis,
      handleRewrite: vi.fn(),
      handleHelp: vi.fn(),
      applyVariation: vi.fn(),
      closeMagicBar: vi.fn(),
      handleGrammarCheck: vi.fn(),
      applyGrammarSuggestion: vi.fn(),
      applyAllGrammarSuggestions: vi.fn(),
      dismissGrammarSuggestion: vi.fn(),
      acceptDiff: vi.fn(),
      rejectDiff: vi.fn(),
    };

    const mergedState = { ...defaultEngineState, ...(overridesEngine.state || {}) };
    const mergedActions = { ...defaultEngineActions, ...(overridesEngine.actions || {}) };

    mockUseEngine.mockReturnValue({
      ...overridesEngine,
      state: mergedState,
      actions: mergedActions,
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRichTextProps.mockReset();
    mockMagicBarProps.mockReset();
    mockFindModalProps.mockReset();
    mockCommentCardProps.mockReset();
    setupMocks();
  });

  it('renders RichTextEditor with current text and handlers', () => {
    render(<EditorWorkspace />);

    expect(screen.getByTestId('rich-text-editor')).toBeInTheDocument();
    expect(mockRichTextProps).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Sample manuscript text',
        onUpdate: expect.any(Function),
        onSelectionChange: expect.any(Function),
      }),
    );
  });

  it('shows MagicBar when there is a text selection and position', () => {
    setupMocks(
      {
        selectionRange: { start: 0, end: 5, text: 'Sample' },
        selectionPos: { top: 100, left: 200 },
      },
    );

    render(<EditorWorkspace />);

    expect(screen.getByTestId('magic-bar')).toBeInTheDocument();
    expect(mockMagicBarProps).toHaveBeenCalledWith(
      expect.objectContaining({
        position: { top: 100, left: 200 },
        onRewrite: expect.any(Function),
        onHelp: expect.any(Function),
      }),
    );
  });

  it('opens FindReplaceModal with Ctrl+F', () => {
    render(<EditorWorkspace />);

    fireEvent.keyDown(window, { key: 'f', ctrlKey: true });

    expect(screen.getByTestId('find-replace-modal')).toBeInTheDocument();
    expect(mockFindModalProps).toHaveBeenCalledWith(
      expect.objectContaining({ isOpen: true }),
    );
  });

  it('toggles Zen Mode with Ctrl+Shift+Z and Escape', () => {
    setupMocks({ isZenMode: false });
    render(<EditorWorkspace />);

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(mockToggleZenMode).toHaveBeenCalledTimes(1);

    // When already in Zen Mode, Escape should also toggle
    setupMocks({ isZenMode: true });
    render(<EditorWorkspace />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(mockToggleZenMode).toHaveBeenCalledTimes(2);
  });

  it('shows diff modal when pendingDiff is present', () => {
    setupMocks(
      {},
      {
        state: {
          isAnalyzing: false,
          isMagicLoading: false,
          magicVariations: [],
          magicHelpResult: null,
          magicHelpType: null,
          activeMagicMode: null,
          pendingDiff: { original: 'old', modified: 'new' },
        },
      },
    );

    const mockAccept = vi.fn();
    const mockReject = vi.fn();

    const engineState = {
      isAnalyzing: false,
      isMagicLoading: false,
      magicVariations: [],
      magicHelpResult: null,
      magicHelpType: null,
      activeMagicMode: null,
      pendingDiff: { original: 'old', modified: 'new' },
      grammarSuggestions: [],
      grammarHighlights: [],
    };

    mockUseEngine.mockReturnValue({
      state: engineState,
      actions: {
        runAnalysis: mockRunAnalysis,
        handleRewrite: vi.fn(),
        handleHelp: vi.fn(),
        applyVariation: vi.fn(),
        closeMagicBar: vi.fn(),
        handleGrammarCheck: vi.fn(),
        applyGrammarSuggestion: vi.fn(),
        applyAllGrammarSuggestions: vi.fn(),
        dismissGrammarSuggestion: vi.fn(),
        acceptDiff: mockAccept,
        rejectDiff: mockReject,
      },
    });

    render(<EditorWorkspace />);

    expect(screen.getByText('Review Agent Suggestions')).toBeInTheDocument();
    expect(screen.getByTestId('visual-diff')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Accept'));
    expect(mockAccept).toHaveBeenCalled();

    fireEvent.click(screen.getByText('Reject'));
    expect(mockReject).toHaveBeenCalled();
  });

  it('handles comment interactions', () => {
    const mockDismissComment = vi.fn();
    setupMocks({ dismissComment: mockDismissComment });
    render(<EditorWorkspace />);

    // 1. Trigger comment click from RichTextEditor
    const onCommentClick = mockRichTextProps.mock.calls[0][0].onCommentClick;
    const mockComment = {
      id: 'c1',
      type: 'issue',
      issue: 'Grammar',
      suggestion: 'Fix it',
      severity: 'high',
      quote: 'bad text',
    };
    const mockPos = { top: 100, left: 100 };

    fireEvent(
      window,
      new MouseEvent('click', { bubbles: true, cancelable: true })
    ); // clear any previous selection/state if needed (though not needed here really)

    React.act(() => {
      onCommentClick(mockComment, mockPos);
    });

    expect(screen.getByTestId('comment-card')).toBeInTheDocument();
    expect(mockCommentCardProps).toHaveBeenCalledWith(
      expect.objectContaining({
        comment: expect.objectContaining({ commentId: 'c1' }),
        position: mockPos,
      })
    );

    // 2. Test Fix with Agent (closes card)
    const onFixWithAgent = mockCommentCardProps.mock.calls[0][0].onFixWithAgent;
    React.act(() => {
      onFixWithAgent('Grammar', 'Fix it', 'bad text');
    });
    expect(screen.queryByTestId('comment-card')).not.toBeInTheDocument();
    expect(mockHandleFixRequest).toHaveBeenCalledWith('Grammar — "bad text"', 'Fix it');

    // Re-open for next test
    React.act(() => {
      onCommentClick(mockComment, mockPos);
    });

    // 3. Test Dismiss (closes card and calls context dismiss)
    const onDismiss = mockCommentCardProps.mock.calls[1][0].onDismiss;
    React.act(() => {
      onDismiss('c1');
    });
    expect(screen.queryByTestId('comment-card')).not.toBeInTheDocument();
    expect(mockDismissComment).toHaveBeenCalledWith('c1');
  });
});
