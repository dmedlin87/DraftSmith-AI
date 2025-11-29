import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { AnalysisProvider, useAnalysis } from '@/features/analysis/context/AnalysisContext';

const { mockFetchPacingAnalysis, mockFetchCharacterAnalysis, mockFetchPlotAnalysis, mockFetchSettingAnalysis } = vi.hoisted(() => ({
  mockFetchPacingAnalysis: vi.fn(),
  mockFetchCharacterAnalysis: vi.fn(),
  mockFetchPlotAnalysis: vi.fn(),
  mockFetchSettingAnalysis: vi.fn(),
}));

vi.mock('@/services/gemini/analysis', () => ({
  fetchPacingAnalysis: (...args: unknown[]) => mockFetchPacingAnalysis(...args),
  fetchCharacterAnalysis: (...args: unknown[]) => mockFetchCharacterAnalysis(...args),
  fetchPlotAnalysis: (...args: unknown[]) => mockFetchPlotAnalysis(...args),
  fetchSettingAnalysis: (...args: unknown[]) => mockFetchSettingAnalysis(...args),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AnalysisProvider>{children}</AnalysisProvider>
);

describe('Analysis flow integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchPacingAnalysis.mockResolvedValue({
      pacing: { score: 8, analysis: 'Steady', slowSections: [], fastSections: [] },
      generalSuggestions: ['Tighten transitions'],
    });
    mockFetchCharacterAnalysis.mockResolvedValue({
      characters: [{ name: 'Hero', bio: 'Main', arc: 'Growth', arcStages: [], relationships: [], plotThreads: [], inconsistencies: [], developmentSuggestion: 'Add depth' }],
    });
    mockFetchPlotAnalysis.mockResolvedValue({
      summary: 'Great adventure',
      strengths: ['Compelling hook'],
      weaknesses: ['Needs tighter middle'],
      plotIssues: [{ issue: 'Loose end', location: 'Chapter 2', suggestion: 'Resolve subplot', quote: '...' }],
    });
    mockFetchSettingAnalysis.mockResolvedValue({
      settingAnalysis: { score: 7, analysis: 'Immersive', issues: [] },
    });
  });

  it('runs incremental analysis and merges section results', async () => {
    const { result } = renderHook(() => useAnalysis(), { wrapper });

    await act(async () => {
      await result.current.analyzePlot('Story text');
      await result.current.analyzeCharacters('Story text');
      await result.current.analyzePacing('Story text', { timePeriod: 'Future', location: 'Mars' });
      await result.current.analyzeSetting('Story text', { timePeriod: 'Future', location: 'Mars' });
    });

    await waitFor(() => {
      expect(result.current.analysisStatus.plot).toBe('complete');
      expect(result.current.analysisStatus.characters).toBe('complete');
      expect(result.current.analysisStatus.pacing).toBe('complete');
      expect(result.current.analysisStatus.setting).toBe('complete');
      expect(result.current.analysisStatus.summary).toBe('complete');
    });

    expect(result.current.incrementalAnalysis.summary).toBe('Great adventure');
    expect(result.current.incrementalAnalysis.characters?.[0].name).toBe('Hero');
    expect(result.current.incrementalAnalysis.pacing?.analysis).toBe('Steady');
    expect(result.current.incrementalAnalysis.settingAnalysis?.analysis).toBe('Immersive');
    expect(result.current.incrementalAnalysis.generalSuggestions).toContain('Tighten transitions');
  });
});
