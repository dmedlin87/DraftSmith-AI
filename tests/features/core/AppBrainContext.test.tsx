import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { AppBrainProvider, useAppBrain } from '@/features/core/context/AppBrainContext';

const {
  mockNavigate,
  mockAnalysis,
  mockProject,
  mockIntelligenceHook,
} = vi.hoisted(() => {
  const mockNavigate = vi.fn();
  const mockAnalysis = {
    analysis: { score: 1 },
    analysisStatus: 'idle',
  } as any;

  const mockProject = {
    activeChapterId: 'ch1',
    currentProject: { id: 'p1', title: 'Novel', lore: { characters: [], worldRules: [] } },
    chapters: [
      { id: 'ch1', title: 'One', content: 'Hello world', order: 0, updatedAt: Date.now() },
      { id: 'ch2', title: 'Two', content: 'Next chapter', order: 1, updatedAt: Date.now() },
    ],
    getActiveChapter: vi.fn(() => ({ id: 'ch1', title: 'One' })),
  } as any;

  const mockIntelligenceHook = vi.fn(() => ({
    intelligence: { entities: [], hud: { situational: {} } },
    hud: { situational: {} },
  }));

  return { mockNavigate, mockAnalysis, mockProject, mockIntelligenceHook };
});

vi.mock('@/features/core/context/EditorContext', () => ({
  useEditor: () => ({
    currentText: 'Hello world',
    branches: [],
    activeBranchId: 'main',
    cursorPosition: 5,
    selectionRange: { text: 'Hello', start: 0, end: 5 },
    inlineComments: [],
    isZenMode: false,
    activeHighlight: null,
    commitEdit: vi.fn(),
  }),
}));

vi.mock('@/features/analysis', () => ({ useAnalysis: () => mockAnalysis }));
vi.mock('@/features/project', () => ({ useProjectStore: () => mockProject }));
vi.mock('@/features/shared/hooks/useManuscriptIntelligence', () => ({
  useManuscriptIntelligence: mockIntelligenceHook,
}));

vi.mock('@/services/commands/navigation', () => ({
  NavigateToTextCommand: vi.fn().mockImplementation(() => ({
    execute: mockNavigate,
  })),
  JumpToChapterCommand: vi.fn().mockImplementation(() => ({ execute: vi.fn().mockResolvedValue('jumped') })),
  JumpToSceneCommand: vi.fn().mockImplementation(() => ({ execute: vi.fn().mockResolvedValue('scene') })),
}));

vi.mock('@/services/commands/editing', () => ({
  UpdateManuscriptCommand: vi.fn().mockImplementation(() => ({ execute: vi.fn().mockResolvedValue('updated') })),
  AppendTextCommand: vi.fn().mockImplementation(() => ({ execute: vi.fn().mockResolvedValue('appended') })),
}));

vi.mock('@/services/commands/analysis', () => ({
  GetCritiqueCommand: vi.fn().mockImplementation(() => ({ execute: vi.fn().mockResolvedValue('critique') })),
  RunAnalysisCommand: vi.fn().mockImplementation(() => ({ execute: vi.fn().mockResolvedValue('analysis') })),
}));

vi.mock('@/services/commands/knowledge', () => ({
  QueryLoreCommand: vi.fn().mockImplementation(() => ({ execute: vi.fn().mockResolvedValue('lore') })),
  GetCharacterInfoCommand: vi.fn().mockImplementation(() => ({ execute: vi.fn().mockResolvedValue('character') })),
}));

vi.mock('@/services/commands/ui', () => ({
  SwitchPanelCommand: vi.fn().mockImplementation(() => ({ execute: vi.fn().mockResolvedValue('panel') })),
  ToggleZenModeCommand: vi.fn().mockImplementation(() => ({ execute: vi.fn().mockResolvedValue('zen') })),
  HighlightTextCommand: vi.fn().mockImplementation(() => ({ execute: vi.fn().mockResolvedValue('highlight') })),
  SetSelectionCommand: vi.fn().mockImplementation(() => ({ execute: vi.fn().mockResolvedValue('selection') })),
}));

vi.mock('@/services/commands/generation', () => ({
  RewriteSelectionCommand: vi.fn().mockImplementation(() => ({ execute: vi.fn().mockResolvedValue('rewrite') })),
  ContinueWritingCommand: vi.fn().mockImplementation(() => ({ execute: vi.fn().mockResolvedValue('continue') })),
}));

vi.mock('@/services/gemini/agent', () => ({ rewriteText: vi.fn(), generateContinuation: vi.fn() }));

const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AppBrainProvider>{children}</AppBrainProvider>
);

describe('AppBrainContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes state and actions from provider', async () => {
    const { result } = renderHook(() => useAppBrain(), { wrapper });

    expect(result.current.state.manuscript.projectTitle).toBe('Novel');
    expect(result.current.state.intelligence.hud).not.toBeNull();

    await act(async () => {
      await result.current.actions.navigateToText({ query: 'Hello', searchType: 'exact' } as any);
    });

    expect(mockNavigate).toHaveBeenCalledWith(
      { query: 'Hello', searchType: 'exact' },
      expect.objectContaining({ currentText: 'Hello world' }),
    );
    expect(result.current.subscribe).toBeTypeOf('function');
  });
});
