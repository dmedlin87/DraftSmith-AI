import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolsPanel } from '@/features/layout/ToolsPanel';
import { SidebarTab } from '@/types';

// Mock layout store with configurable activeTab
let mockActiveTab = SidebarTab.ANALYSIS;
const mockHandleFixRequest = vi.fn();
const mockHandleSelectGraphCharacter = vi.fn();
const mockHandleInterviewCharacter = vi.fn();
const mockClearChatInitialMessage = vi.fn();
const mockExitInterview = vi.fn();

vi.mock('@/features/layout/store/useLayoutStore', () => ({
  useLayoutStore: vi.fn((selector) => {
    const state = {
      activeTab: mockActiveTab,
      isToolsCollapsed: false,
      chatInitialMessage: undefined,
      interviewTarget: null,
      clearChatInitialMessage: mockClearChatInitialMessage,
      exitInterview: mockExitInterview,
      handleFixRequest: mockHandleFixRequest,
      handleSelectGraphCharacter: mockHandleSelectGraphCharacter,
      handleInterviewCharacter: mockHandleInterviewCharacter,
    };
    return typeof selector === 'function' ? selector(state) : state;
  }),
}));

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    aside: ({ children, ...props }: any) => <aside {...props}>{children}</aside>,
  },
  AnimatePresence: ({ children, mode }: any) => <>{children}</>,
}));

// Mock child components to isolate ToolsPanel testing
vi.mock('@/features/agent', () => ({
  ChatInterface: () => <div data-testid="chat-interface">Chat Interface</div>,
  ActivityFeed: ({ history }: any) => (
    <div data-testid="activity-feed">Activity Feed ({history.length} items)</div>
  ),
}));

vi.mock('@/features/analysis', () => ({
  Dashboard: ({ isLoading, warning }: any) => (
    <div data-testid="analysis-dashboard" data-loading={isLoading} data-warning={warning?.message || warning}>
      Analysis Dashboard
    </div>
  ),
}));

vi.mock('@/features/voice', () => ({
  VoiceMode: () => <div data-testid="voice-mode">Voice Mode</div>,
}));

vi.mock('@/features/lore', () => ({
  KnowledgeGraph: () => <div data-testid="knowledge-graph">Knowledge Graph</div>,
  LoreManager: () => <div data-testid="lore-manager">Lore Manager</div>,
}));

vi.mock('@/features/memory', () => ({
  MemoryManager: () => <div data-testid="memory-manager">Memory Manager</div>,
}));

describe('ToolsPanel', () => {
  const defaultProps = {
    isZenMode: false,
    currentText: 'Sample text content',
    editorContext: {
      cursorPosition: 0,
      selection: null,
      totalLength: 100,
    },
    projectId: 'project-1',
    lore: {},
    chapters: [],
    analysis: null,
    history: [{ id: '1', text: 'test' }],
    isAnalyzing: false,
    analysisWarning: undefined,
    onAgentAction: vi.fn().mockResolvedValue('success'),
    onRestore: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveTab = SidebarTab.ANALYSIS;
  });

  describe('Visibility', () => {
    it('renders panel when not collapsed and not zen mode', () => {
      render(<ToolsPanel {...defaultProps} />);

      expect(screen.getByRole('complementary')).toBeInTheDocument();
    });

    it('does not render when zen mode is active', () => {
      render(<ToolsPanel {...defaultProps} isZenMode={true} />);

      expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    });

    it('has correct aria-label based on active tab', () => {
      render(<ToolsPanel {...defaultProps} />);

      expect(screen.getByRole('complementary')).toHaveAttribute(
        'aria-label',
        'ANALYSIS panel'
      );
    });
  });

  describe('Panel Header', () => {
    it('displays active tab name in header', () => {
      render(<ToolsPanel {...defaultProps} />);

      expect(screen.getByText('ANALYSIS')).toBeInTheDocument();
    });
  });

  describe('Tab Content: Analysis', () => {
    it('renders Dashboard when activeTab is ANALYSIS', () => {
      mockActiveTab = SidebarTab.ANALYSIS;
      render(<ToolsPanel {...defaultProps} />);

      expect(screen.getByTestId('analysis-dashboard')).toBeInTheDocument();
    });

    it('passes isAnalyzing prop to Dashboard', () => {
      mockActiveTab = SidebarTab.ANALYSIS;
      render(<ToolsPanel {...defaultProps} isAnalyzing={true} />);

      expect(screen.getByTestId('analysis-dashboard')).toHaveAttribute('data-loading', 'true');
    });

    it('passes warning prop to Dashboard', () => {
      mockActiveTab = SidebarTab.ANALYSIS;
      render(<ToolsPanel {...defaultProps} analysisWarning={{ message: 'Test warning' }} />);

      expect(screen.getByTestId('analysis-dashboard')).toHaveAttribute('data-warning', 'Test warning');
    });
  });

  describe('Tab Content: Chat', () => {
    it('renders ChatInterface when activeTab is CHAT', () => {
      mockActiveTab = SidebarTab.CHAT;
      render(<ToolsPanel {...defaultProps} />);

      expect(screen.getByTestId('chat-interface')).toBeInTheDocument();
    });
  });

  describe('Tab Content: History', () => {
    it('renders ActivityFeed when activeTab is HISTORY', () => {
      mockActiveTab = SidebarTab.HISTORY;
      render(<ToolsPanel {...defaultProps} />);

      expect(screen.getByTestId('activity-feed')).toBeInTheDocument();
    });

    it('passes history items to ActivityFeed', () => {
      mockActiveTab = SidebarTab.HISTORY;
      render(<ToolsPanel {...defaultProps} history={[{ id: '1' }, { id: '2' }]} />);

      expect(screen.getByText('Activity Feed (2 items)')).toBeInTheDocument();
    });
  });

  describe('Tab Content: Voice', () => {
    it('renders VoiceMode when activeTab is VOICE', () => {
      mockActiveTab = SidebarTab.VOICE;
      render(<ToolsPanel {...defaultProps} />);

      expect(screen.getByTestId('voice-mode')).toBeInTheDocument();
    });
  });

  describe('Tab Content: Memory', () => {
    it('renders MemoryManager when activeTab is MEMORY', () => {
      mockActiveTab = SidebarTab.MEMORY;
      render(<ToolsPanel {...defaultProps} />);

      expect(screen.getByTestId('memory-manager')).toBeInTheDocument();
    });
  });

  describe('Tab Content: Graph', () => {
    it('renders KnowledgeGraph when activeTab is GRAPH', () => {
      mockActiveTab = SidebarTab.GRAPH;
      render(<ToolsPanel {...defaultProps} />);

      expect(screen.getByTestId('knowledge-graph')).toBeInTheDocument();
    });
  });

  describe('Tab Content: Lore', () => {
    it('renders LoreManager when activeTab is LORE', () => {
      mockActiveTab = SidebarTab.LORE;
      render(<ToolsPanel {...defaultProps} />);

      expect(screen.getByTestId('lore-manager')).toBeInTheDocument();
    });
  });

  describe('Content Switching', () => {
    it('only renders one panel content at a time', () => {
      mockActiveTab = SidebarTab.ANALYSIS;
      render(<ToolsPanel {...defaultProps} />);

      expect(screen.getByTestId('analysis-dashboard')).toBeInTheDocument();
      expect(screen.queryByTestId('chat-interface')).not.toBeInTheDocument();
      expect(screen.queryByTestId('activity-feed')).not.toBeInTheDocument();
      expect(screen.queryByTestId('voice-mode')).not.toBeInTheDocument();
      expect(screen.queryByTestId('knowledge-graph')).not.toBeInTheDocument();
      expect(screen.queryByTestId('lore-manager')).not.toBeInTheDocument();
    });
  });
});
