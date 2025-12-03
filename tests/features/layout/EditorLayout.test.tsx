import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, type Mock } from 'vitest';
import { SidebarTab } from '@/types';

vi.mock('@/features/project', () => ({
  ProjectSidebar: ({ toggleCollapsed }: { toggleCollapsed: () => void }) => (
    <div data-testid="project-sidebar">
      <button onClick={toggleCollapsed}>toggle-sidebar</button>
    </div>
  ),
  useProjectStore: vi.fn(),
}));

vi.mock('@/features/analysis', () => ({
  AnalysisPanel: ({ onNavigate }: { onNavigate: (issue: string) => void }) => (
    <div data-testid="analysis-panel">
      <button onClick={() => onNavigate('issue-target')}>navigate</button>
    </div>
  ),
}));

vi.mock('@/features/agent', () => ({
  ChatInterface: ({ onAgentAction }: { onAgentAction: (payload: unknown) => void }) => (
    <div data-testid="chat-interface">
      <button onClick={() => onAgentAction('chat-action')}>chat</button>
    </div>
  ),
  ActivityFeed: ({ onRestore, onInspect }: { onRestore: () => void; onInspect: (item: unknown) => void }) => (
    <div data-testid="activity-feed">
      <button onClick={onRestore}>restore</button>
      <button onClick={() => onInspect({ previousContent: 'old', newContent: 'new', description: 'desc' })}>inspect</button>
    </div>
  ),
}));

vi.mock('@/features/voice', () => ({
  VoiceMode: () => <div data-testid="voice-mode">voice</div>,
}));

vi.mock('@/features/editor', () => ({
  MagicBar: () => <div data-testid="magic-bar">magic</div>,
  FindReplaceModal: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div data-testid="find-replace-modal">find</div> : null),
  VisualDiff: () => <div data-testid="visual-diff">diff</div>,
  RichTextEditor: () => <div data-testid="rich-text-editor">editor</div>,
}));

vi.mock('@/features/shared', () => ({
  findQuoteRange: vi.fn(),
  useEditor: vi.fn(),
  useEngine: vi.fn(),
}));

vi.mock('@/features/core/context/AppBrainContext', () => ({
  useAppBrainState: () => ({
    intelligence: { full: { voice: null } },
  }),
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
    aside: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => <aside {...props}>{children}</aside>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { EditorLayout } from '@/features/layout/EditorLayout';
import { useProjectStore } from '@/features/project';
import { useEditor, useEngine } from '@/features/shared';

const mockUseProjectStore = useProjectStore as unknown as Mock;
const mockUseEditor = useEditor as unknown as Mock;
const mockUseEngine = useEngine as unknown as Mock;

const createProps = () => ({
  activeTab: SidebarTab.ANALYSIS,
  onTabChange: vi.fn(),
  isSidebarCollapsed: false,
  onToggleSidebar: vi.fn(),
  isToolsCollapsed: false,
  onToggleTools: vi.fn(),
  onHomeClick: vi.fn(),
});

const baseEditorState = () => ({
  currentText: 'Sample manuscript text',
  updateText: vi.fn(),
  setSelectionState: vi.fn(),
  selectionRange: null,
  selectionPos: null,
  activeHighlight: null,
  setEditor: vi.fn(),
  clearSelection: vi.fn(),
  editor: { state: { selection: { from: 0 } } },
  history: [],
  restore: vi.fn(),
  handleNavigateToIssue: vi.fn(),
});

const baseEngineState = () => ({
  state: {
    isAnalyzing: false,
    isMagicLoading: false,
    magicVariations: [],
    magicHelpResult: null,
    magicHelpType: null,
    activeMagicMode: null,
    pendingDiff: null,
    analysisWarning: null,
    grammarSuggestions: [],
    grammarHighlights: [],
  },
  actions: {
    runAnalysis: vi.fn(),
    runSelectionAnalysis: vi.fn(),
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
    handleAgentAction: vi.fn(),
  },
});

describe('features/layout/EditorLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseProjectStore.mockReturnValue({
      currentProject: { id: 'p1', title: 'Test', setting: { timePeriod: 'Modern', location: 'City' } },
      getActiveChapter: () => ({ id: 'ch1', title: 'Chapter 1', lastAnalysis: null }),
      chapters: [],
    });
    mockUseEditor.mockReturnValue(baseEditorState());
    mockUseEngine.mockReturnValue(baseEngineState());
  });

  it('fires navigation callbacks for home and each tab', () => {
    const props = createProps();
    render(<EditorLayout {...props} />);

    fireEvent.click(screen.getByTitle('Library'));
    expect(props.onHomeClick).toHaveBeenCalled();

    fireEvent.click(screen.getByTitle('Analysis'));
    fireEvent.click(screen.getByTitle('Agent'));
    fireEvent.click(screen.getByTitle('History'));
    fireEvent.click(screen.getByTitle('Voice'));

    expect(props.onTabChange).toHaveBeenCalledWith(SidebarTab.ANALYSIS);
    expect(props.onTabChange).toHaveBeenCalledWith(SidebarTab.CHAT);
    expect(props.onTabChange).toHaveBeenCalledWith(SidebarTab.HISTORY);
    expect(props.onTabChange).toHaveBeenCalledWith(SidebarTab.VOICE);
  });

  it('hides sidebar and tools panels when collapsed', () => {
    const props = createProps();
    const { rerender } = render(<EditorLayout {...props} isSidebarCollapsed />);

    expect(screen.queryByTestId('project-sidebar')).not.toBeInTheDocument();

    rerender(<EditorLayout {...props} isToolsCollapsed />);
    expect(screen.queryByTestId('analysis-panel')).not.toBeInTheDocument();
  });

  it('renders analysis panel branch and forwards navigation', () => {
    const props = createProps();
    const editorState = baseEditorState();
    mockUseEditor.mockReturnValue(editorState);
    render(<EditorLayout {...props} activeTab={SidebarTab.ANALYSIS} />);

    fireEvent.click(screen.getByText('navigate'));
    expect(editorState.handleNavigateToIssue).toHaveBeenCalledWith('issue-target');
  });

  it('renders chat branch and wires agent actions', () => {
    const props = createProps();
    const engineState = baseEngineState();
    mockUseEngine.mockReturnValue(engineState);
    render(<EditorLayout {...props} activeTab={SidebarTab.CHAT} />);

    fireEvent.click(screen.getByText('chat'));
    expect(engineState.actions.handleAgentAction).toHaveBeenCalledWith('chat-action');
  });

  it('renders history branch and triggers restore and inspect handlers', () => {
    const props = createProps();
    const editorState = baseEditorState();
    mockUseEditor.mockReturnValue(editorState);
    render(<EditorLayout {...props} activeTab={SidebarTab.HISTORY} />);

    fireEvent.click(screen.getByText('restore'));
    expect(editorState.restore).toHaveBeenCalled();

    fireEvent.click(screen.getByText('inspect'));
    expect(editorState.clearSelection).not.toHaveBeenCalled();
  });

  it('renders voice branch content', () => {
    const props = createProps();
    render(<EditorLayout {...props} activeTab={SidebarTab.VOICE} />);

    expect(screen.getByTestId('voice-mode')).toBeInTheDocument();
  });
});
