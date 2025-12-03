import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, type Mock } from 'vitest';
import { SidebarTab } from '@/types';

// Mock all dependencies
vi.mock('@/features/project', () => ({
  ProjectSidebar: () => <div data-testid="project-sidebar">Sidebar</div>,
  useProjectStore: vi.fn(),
}));

vi.mock('@/features/analysis', () => ({
  AnalysisPanel: () => <div data-testid="analysis-panel">Analysis</div>,
}));

vi.mock('@/features/agent', () => ({
  ChatInterface: () => <div data-testid="chat-interface">Chat</div>,
  ActivityFeed: ({ onInspect }: { onInspect: (item: unknown) => void }) => (
    <div data-testid="activity-feed">
      <button onClick={() => onInspect({ previousContent: 'old', newContent: 'new', description: 'test' })}>
        Inspect
      </button>
    </div>
  ),
}));

vi.mock('@/features/voice', () => ({
  VoiceMode: () => <div data-testid="voice-mode">Voice</div>,
}));

vi.mock('@/features/editor', () => ({
  MagicBar: () => <div data-testid="magic-bar">MagicBar</div>,
  FindReplaceModal: ({ isOpen }: { isOpen: boolean }) => 
    isOpen ? <div data-testid="find-replace-modal">Find/Replace</div> : null,
  VisualDiff: () => <div data-testid="visual-diff">Diff</div>,
  RichTextEditor: () => <div data-testid="rich-text-editor">Editor</div>,
}));

vi.mock('@/features/shared', () => ({
  findQuoteRange: vi.fn(),
  useEditor: vi.fn(),
  useEngine: vi.fn(),
}));

vi.mock('@/features/core/context/AppBrainContext', () => ({
  useAppBrainState: vi.fn(() => ({
    intelligence: {
      full: { voice: null },
    },
  })),
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

describe('EditorLayout', () => {
  const mockOnTabChange = vi.fn();
  const mockOnToggleSidebar = vi.fn();
  const mockOnToggleTools = vi.fn();
  const mockOnHomeClick = vi.fn();
  const mockRunAnalysis = vi.fn();
  const mockClearSelection = vi.fn();

  const defaultProps = {
    activeTab: SidebarTab.ANALYSIS,
    onTabChange: mockOnTabChange,
    isSidebarCollapsed: false,
    onToggleSidebar: mockOnToggleSidebar,
    isToolsCollapsed: false,
    onToggleTools: mockOnToggleTools,
    onHomeClick: mockOnHomeClick,
  };

  const setupMocks = (overrides = {}) => {
    mockUseProjectStore.mockReturnValue({
      currentProject: { id: 'p1', title: 'Test', setting: { timePeriod: 'Modern', location: 'City' } },
      getActiveChapter: () => ({ id: 'ch1', title: 'Chapter 1', lastAnalysis: null }),
      chapters: [],
      ...overrides,
    });

    mockUseEditor.mockReturnValue({
      currentText: 'Sample manuscript text',
      updateText: vi.fn(),
      setSelectionState: vi.fn(),
      selectionRange: null,
      selectionPos: null,
      activeHighlight: null,
      setEditor: vi.fn(),
      clearSelection: mockClearSelection,
      editor: { state: { selection: { from: 0 } } },
      history: [],
      restore: vi.fn(),
      handleNavigateToIssue: vi.fn(),
    });

    mockUseEngine.mockReturnValue({
      state: {
        isAnalyzing: false,
        isMagicLoading: false,
        magicVariations: [],
        magicHelpResult: null,
        magicHelpType: null,
        activeMagicMode: null,
        pendingDiff: null,
        analysisWarning: null,
      },
      actions: {
        runAnalysis: mockRunAnalysis,
        runSelectionAnalysis: vi.fn(),
        handleRewrite: vi.fn(),
        handleHelp: vi.fn(),
        applyVariation: vi.fn(),
        closeMagicBar: vi.fn(),
        acceptDiff: vi.fn(),
        rejectDiff: vi.fn(),
        handleAgentAction: vi.fn(),
      },
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks();
  });

  it('renders main layout components', () => {
    render(<EditorLayout {...defaultProps} />);
    
    expect(screen.getByTestId('project-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('rich-text-editor')).toBeInTheDocument();
    expect(screen.getByTestId('analysis-panel')).toBeInTheDocument();
  });

  it('displays chapter title and word count', () => {
    render(<EditorLayout {...defaultProps} />);
    
    expect(screen.getByText('Chapter 1')).toBeInTheDocument();
    expect(screen.getByText('3 words')).toBeInTheDocument();
  });

  it('displays setting badge when project has setting', () => {
    render(<EditorLayout {...defaultProps} />);
    
    expect(screen.getByText('Modern • City')).toBeInTheDocument();
  });

  it('shows "No Active Chapter" when no chapter selected', () => {
    mockUseProjectStore.mockReturnValue({
      currentProject: { id: 'p1', title: 'Test' },
      getActiveChapter: () => null,
      chapters: [],
    });
    
    render(<EditorLayout {...defaultProps} />);
    
    expect(screen.getByText('No Active Chapter')).toBeInTheDocument();
  });

  it('calls runAnalysis when Deep Analysis button is clicked', () => {
    render(<EditorLayout {...defaultProps} />);
    
    fireEvent.click(screen.getByText('Deep Analysis'));
    
    expect(mockRunAnalysis).toHaveBeenCalled();
  });

  it('shows loading state when analyzing', () => {
    mockUseEngine.mockReturnValue({
      state: { isAnalyzing: true, pendingDiff: null },
      actions: { runAnalysis: mockRunAnalysis, runSelectionAnalysis: vi.fn() },
    });
    
    render(<EditorLayout {...defaultProps} />);
    
    const button = screen.getByText('Deep Analysis').closest('button');
    expect(button).toBeDisabled();
  });

  it('calls onTabChange when navigation button is clicked', () => {
    render(<EditorLayout {...defaultProps} />);
    
    fireEvent.click(screen.getByTitle('Agent'));
    
    expect(mockOnTabChange).toHaveBeenCalledWith(SidebarTab.CHAT);
  });

  it('calls onHomeClick when home button is clicked', () => {
    render(<EditorLayout {...defaultProps} />);
    
    fireEvent.click(screen.getByTitle('Library'));
    
    expect(mockOnHomeClick).toHaveBeenCalled();
  });

  it('hides sidebar when collapsed', () => {
    render(<EditorLayout {...defaultProps} isSidebarCollapsed={true} />);
    
    expect(screen.queryByTestId('project-sidebar')).not.toBeInTheDocument();
  });

  it('hides tools panel when collapsed', () => {
    render(<EditorLayout {...defaultProps} isToolsCollapsed={true} />);
    
    expect(screen.queryByTestId('analysis-panel')).not.toBeInTheDocument();
  });

  it('switches tabs correctly', () => {
    const { rerender } = render(<EditorLayout {...defaultProps} activeTab={SidebarTab.CHAT} />);
    expect(screen.getByTestId('chat-interface')).toBeInTheDocument();
    
    rerender(<EditorLayout {...defaultProps} activeTab={SidebarTab.HISTORY} />);
    expect(screen.getByTestId('activity-feed')).toBeInTheDocument();
    
    rerender(<EditorLayout {...defaultProps} activeTab={SidebarTab.VOICE} />);
    expect(screen.getByTestId('voice-mode')).toBeInTheDocument();
  });

  it('opens find/replace modal with Ctrl+F', () => {
    render(<EditorLayout {...defaultProps} />);
    
    fireEvent.keyDown(window, { key: 'f', ctrlKey: true });
    
    expect(screen.getByTestId('find-replace-modal')).toBeInTheDocument();
  });

  it('shows pending diff modal when diff is available', () => {
    mockUseEngine.mockReturnValue({
      state: {
        isAnalyzing: false,
        pendingDiff: { original: 'old text', modified: 'new text' },
      },
      actions: {
        runAnalysis: vi.fn(),
        acceptDiff: vi.fn(),
        rejectDiff: vi.fn(),
      },
    });
    
    render(<EditorLayout {...defaultProps} />);
    
    expect(screen.getByText('Review Agent Suggestions')).toBeInTheDocument();
    expect(screen.getByTestId('visual-diff')).toBeInTheDocument();
  });

  it('clears selection when clicking outside editor', () => {
    render(<EditorLayout {...defaultProps} />);
    
    // The outer container has onClick={clearSelection}
    const editorContainer = screen.getByTestId('rich-text-editor').closest('.flex-1.overflow-y-auto');
    if (editorContainer) {
      fireEvent.click(editorContainer);
      expect(mockClearSelection).toHaveBeenCalled();
    }
  });
});
