import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import useMemoryIntelligence from '@/features/agent/hooks/useMemoryIntelligence';

const mocks = vi.hoisted(() => ({
  observeAnalysisResults: vi.fn(),
  observeIntelligenceResults: vi.fn(),
  runConsolidation: vi.fn(),
  reinforceMemory: vi.fn(),
  getMemoryHealthStats: vi.fn(),
  subscribe: vi.fn(),
  getActiveGoals: vi.fn(),
  evolveBedsideNote: vi.fn(),
}));

type MockObservationResult = {
  created: any[];
  skipped: number;
  errors?: string[];
};

vi.mock('@/services/appBrain', () => ({
  eventBus: {
    subscribe: mocks.subscribe,
  },
}));

vi.mock('@/services/memory/autoObserver', () => ({
  observeAnalysisResults: (...args: any[]) => mocks.observeAnalysisResults(...args),
  observeIntelligenceResults: (...args: any[]) => mocks.observeIntelligenceResults(...args),
}));

vi.mock('@/services/memory/consolidation', () => ({
  runConsolidation: (...args: any[]) => mocks.runConsolidation(...args),
  reinforceMemory: (...args: any[]) => mocks.reinforceMemory(...args),
  reinforceMemories: vi.fn(),
  getMemoryHealthStats: (...args: any[]) => mocks.getMemoryHealthStats(...args),
}));

vi.mock('@/services/memory', () => ({
  getActiveGoals: (...args: any[]) => mocks.getActiveGoals(...args),
  evolveBedsideNote: (...args: any[]) => mocks.evolveBedsideNote(...args),
}));

describe('useMemoryIntelligence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.subscribe.mockReturnValue(() => {});
    mocks.observeAnalysisResults.mockResolvedValue({ created: ['a'], skipped: 0 });
    mocks.observeIntelligenceResults.mockResolvedValue({ created: ['b'], skipped: 0 });
    mocks.runConsolidation.mockResolvedValue({
      decayed: 1,
      merged: 0,
      archived: 0,
      reinforced: 0,
      errors: [],
      duration: 10,
    });
    mocks.reinforceMemory.mockResolvedValue(true);
    mocks.getMemoryHealthStats.mockResolvedValue({
      totalMemories: 3,
      avgImportance: 0.5,
      lowImportanceCount: 1,
      oldMemoriesCount: 0,
      activeGoals: 0,
      completedGoals: 0,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('returns "No project ID" when observing without a project', async () => {
    const { result } = renderHook(() =>
      useMemoryIntelligence({
        projectId: null,
        autoObserveEnabled: false,
        consolidateOnMount: false,
        consolidationIntervalMs: 0,
      })
    );

    let observation: MockObservationResult | null = null;
    await act(async () => {
      observation = await result.current.observeAnalysis({} as any);
    });

    expect(observation).toEqual({ created: [], skipped: 0, errors: ['No project ID'] });

    let intelligenceObservation: MockObservationResult | null = null;
    await act(async () => {
      intelligenceObservation = await result.current.observeIntelligence({} as any);
    });

    expect(intelligenceObservation).toEqual({ created: [], skipped: 0, errors: ['No project ID'] });
  });

  it('runs consolidation on mount, schedules intervals, and cleans up timers', async () => {
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

    const { result, unmount } = renderHook(() =>
      useMemoryIntelligence({
        projectId: 'project-1',
        consolidationIntervalMs: 5000,
      })
    );

    expect(mocks.runConsolidation).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.runConsolidation).toHaveBeenCalledTimes(1);
    expect(mocks.getMemoryHealthStats).toHaveBeenCalledWith('project-1');
    expect(result.current.lastConsolidation).toEqual({
      decayed: 1,
      merged: 0,
      archived: 0,
      reinforced: 0,
      errors: [],
      duration: 10,
    });

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(mocks.runConsolidation).toHaveBeenCalledTimes(2);

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it('refreshHealthStats updates state and handles errors', async () => {
    const { result } = renderHook(() =>
      useMemoryIntelligence({
        projectId: 'project-1',
        autoObserveEnabled: false,
        consolidateOnMount: false,
        consolidationIntervalMs: 0,
      })
    );

    await act(async () => {
      await result.current.refreshHealthStats();
    });

    expect(result.current.healthStats).toEqual({
      totalMemories: 3,
      avgImportance: 0.5,
      lowImportanceCount: 1,
      oldMemoriesCount: 0,
      activeGoals: 0,
      completedGoals: 0,
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.getMemoryHealthStats.mockRejectedValueOnce(new Error('boom'));

    await act(async () => {
      await result.current.refreshHealthStats();
    });

    expect(result.current.healthStats).toEqual({
      totalMemories: 3,
      avgImportance: 0.5,
      lowImportanceCount: 1,
      oldMemoriesCount: 0,
      activeGoals: 0,
      completedGoals: 0,
    });
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('delegates reinforcement to reinforceMemory', async () => {
    const { result } = renderHook(() =>
      useMemoryIntelligence({
        projectId: 'project-1',
        autoObserveEnabled: false,
        consolidateOnMount: false,
        consolidationIntervalMs: 0,
      })
    );

    let reinforced = false;
    await act(async () => {
      reinforced = await result.current.reinforceUsed('memory-1', 'manual');
    });

    expect(reinforced).toBe(true);
    expect(mocks.reinforceMemory).toHaveBeenCalledWith({ memoryId: 'memory-1', reason: 'manual' });
  });

  it('evolves the bedside-note plan after observing analysis for a project', async () => {
    const analysis: any = {
      summary: 'Story so far',
      weaknesses: ['Pacing is uneven'],
      plotIssues: [{ issue: 'Unclear motivation in Act 2' }],
    };

    mocks.getActiveGoals.mockResolvedValueOnce([
      {
        id: 'goal-1',
        projectId: 'project-1',
        title: 'Tighten pacing',
        status: 'active',
        progress: 25,
        createdAt: Date.now(),
      },
    ]);
    mocks.evolveBedsideNote.mockResolvedValueOnce({} as any);

    const { result } = renderHook(() =>
      useMemoryIntelligence({
        projectId: 'project-1',
        autoObserveEnabled: false,
        consolidateOnMount: false,
        consolidationIntervalMs: 0,
      })
    );

    await act(async () => {
      await result.current.observeAnalysis(analysis);
    });

    expect(mocks.observeAnalysisResults).toHaveBeenCalledWith(analysis, { projectId: 'project-1' });
    expect(mocks.getActiveGoals).toHaveBeenCalledWith('project-1');
    expect(mocks.evolveBedsideNote).toHaveBeenCalledTimes(1);
    const [projectIdArg, planText, options] = mocks.evolveBedsideNote.mock.calls[0];
    expect(projectIdArg).toBe('project-1');
    expect(typeof planText).toBe('string');
    expect(planText).toContain('Current Focus:');
    expect(planText).toContain('Active Goals:');
    expect(planText).toContain('Warnings & Risks:');
    expect(options).toEqual({ changeReason: 'analysis_update', structuredContent: expect.any(Object) });
  });
});
