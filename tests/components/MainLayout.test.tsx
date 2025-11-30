import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, type Mock } from 'vitest';

// Mock all dependencies before importing MainLayout
vi.mock('@/features/project', () => ({
  ProjectSidebar: () => <div data-testid="project-sidebar">Sidebar</div>,
  StoryBoard: ({ onSwitchToEditor }: { onSwitchToEditor: () => void }) => (
    <div data-testid="storyboard">
      <button onClick={onSwitchToEditor}>Switch to Editor</button>
    </div>
  ),
  useProjectStore: vi.fn(),
}));

vi.mock('@/features/editor', () => ({
  EditorWorkspace: () => <div data-testid="editor-workspace">Editor</div>,
}));

vi.mock('@/features/layout/UploadLayout', () => ({
  UploadLayout: () => <div data-testid="upload-layout">Upload</div>,
}));

vi.mock('@/features/agent', () => ({
  ChatInterface: () => <div data-testid="chat-interface">Chat</div>,
  ActivityFeed: () => <div data-testid="activity-feed">Activity</div>,
  AIPresenceOrb: ({ onClick, isActive }: { onClick: () => void; isActive: boolean }) => (
    <button data-testid="ai-orb" onClick={onClick} data-active={isActive}>
      AI Orb
    </button>
  ),
}));

vi.mock('@/features/voice', () => ({
  VoiceMode: () => <div data-testid="voice-mode">Voice</div>,
}));

vi.mock('@/features/shared', () => ({
  useEditor: vi.fn(),
  useEngine: vi.fn(),
  UsageBadge: () => <div data-testid="usage-badge">Usage</div>,
}));

vi.mock('@/features/analysis', () => ({
  Dashboard: () => <div data-testid="dashboard">Dashboard</div>,
}));

vi.mock('@/features/lore', () => ({
  KnowledgeGraph: () => <div data-testid="knowledge-graph">Graph</div>,
  LoreManager: () => <div data-testid="lore-manager">Lore</div>,
}));

vi.mock('@/features/layout/EditorHeader', () => ({
  EditorHeader: ({ isZenMode }: { isZenMode: boolean }) => (
    <div data-testid="editor-header" data-zen={isZenMode}>
      Header
    </div>
  ),
}));

vi.mock('framer-motion', () => ({
  motion: {
    nav: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => <nav {...props}>{children}</nav>,
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
    aside: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => <aside {...props}>{children}</aside>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/features/shared/context/EditorContext', () => ({
  useEditorState: vi.fn(),
  useEditorActions: vi.fn(),
}));

import { MainLayout } from '@/features/layout/MainLayout';
import { useProjectStore } from '@/features/project';
import { useEngine } from '@/features/shared';
import { useEditorState, useEditorActions } from '@/features/shared/context/EditorContext';

const mockUseProjectStore = useProjectStore as unknown as Mock;
const mockUseEngine = useEngine as unknown as Mock;
const mockUseEditorState = useEditorState as unknown as Mock;
const mockUseEditorActions = useEditorActions as unknown as Mock;

describe('MainLayout', () => {
  const mockEditor = { state: { selection: { from: 0 } } };
  const mockToggleZenMode = vi.fn();

  const setupMocks = (hasProject = true) => {
    mockUseProjectStore.mockReturnValue({
      currentProject: hasProject ? { id: 'p1', title: 'Test Novel', lore: null } : null,
      getActiveChapter: () => (hasProject ? { id: 'ch1', lastAnalysis: null } : null),
      chapters: [],
    });

    mockUseEditorState.mockReturnValue({
      editor: mockEditor,
      currentText: 'Sample text',
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
    });

    mockUseEditorActions.mockReturnValue({
      restore: vi.fn(),
      toggleZenMode: mockToggleZenMode,
    });

    mockUseEngine.mockReturnValue({
      state: { isAnalyzing: false, isMagicLoading: false, analysisWarning: null },
      actions: { handleAgentAction: vi.fn() },
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders UploadLayout when no project is selected', () => {
    setupMocks(false);
    render(<MainLayout />);
    
    expect(screen.getByTestId('upload-layout')).toBeInTheDocument();
  });

  it('renders main editor view when project is selected', () => {
    setupMocks(true);
    render(<MainLayout />);
    
    expect(screen.getByTestId('editor-workspace')).toBeInTheDocument();
    expect(screen.getByTestId('project-sidebar')).toBeInTheDocument();
  });

  it('shows AI orb in navigation', () => {
    setupMocks(true);
    render(<MainLayout />);
    
    expect(screen.getByTestId('ai-orb')).toBeInTheDocument();
  });

  it('switches between tabs when nav buttons are clicked', () => {
    setupMocks(true);
    render(<MainLayout />);
    
    // Click AI orb to switch to chat
    fireEvent.click(screen.getByTestId('ai-orb'));
    expect(screen.getByTestId('chat-interface')).toBeInTheDocument();
  });

  it('shows Analysis tab by default', () => {
    setupMocks(true);
    render(<MainLayout />);
    
    expect(screen.getByTestId('dashboard')).toBeInTheDocument();
  });

  it('toggles between editor and storyboard views', () => {
    setupMocks(true);
    render(<MainLayout />);
    
    // Find and click the board toggle button
    const boardButton = screen.getByTitle('Story Board');
    fireEvent.click(boardButton);
    
    expect(screen.getByTestId('storyboard')).toBeInTheDocument();
  });

  it('calls toggleZenMode when zen button is clicked', () => {
    setupMocks(true);
    render(<MainLayout />);
    
    const zenButton = screen.getByTitle('Enter Zen Mode');
    fireEvent.click(zenButton);
    
    expect(mockToggleZenMode).toHaveBeenCalled();
  });

  it('toggles theme when theme button is clicked', () => {
    setupMocks(true);
    render(<MainLayout />);
    
    // Initially light mode
    const darkModeButton = screen.getByTitle('Switch to Dark Mode');
    fireEvent.click(darkModeButton);
    
    // Should now show light mode option
    expect(screen.getByTitle('Switch to Light Mode')).toBeInTheDocument();
  });

  it('persists theme preference to localStorage', () => {
    setupMocks(true);
    render(<MainLayout />);
    
    const darkModeButton = screen.getByTitle('Switch to Dark Mode');
    fireEvent.click(darkModeButton);
    
    expect(localStorage.getItem('quillai-theme')).toBe('dark');
  });

  it('loads theme preference from localStorage', () => {
    localStorage.setItem('quillai-theme', 'dark');
    setupMocks(true);
    render(<MainLayout />);
    
    expect(screen.getByTitle('Switch to Light Mode')).toBeInTheDocument();
  });
});
