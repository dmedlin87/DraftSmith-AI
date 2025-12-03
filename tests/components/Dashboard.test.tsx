import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { Dashboard } from '@/features/analysis/components/Dashboard';
import { createAnalysisResult } from '@/tests/factories/analysisResultFactory';

const mockFindQuoteRange = vi.fn();
const mockHandleNavigateToIssue = vi.fn();

vi.mock('@/features/shared', () => ({
  findQuoteRange: (...args: unknown[]) => mockFindQuoteRange(...args),
}));

vi.mock('@/features/core/context/EditorContext', () => ({
  useEditorActions: () => ({
    handleNavigateToIssue: (...args: unknown[]) => mockHandleNavigateToIssue(...args),
  }),
}));

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state via AnalysisPanel', () => {
    render(
      <Dashboard
        isLoading
        analysis={null}
        currentText=""
      />
    );

    expect(screen.getByText('Consulting the muse...')).toBeInTheDocument();
  });

  it('renders empty state when analysis is null and not loading', () => {
    render(
      <Dashboard
        isLoading={false}
        analysis={null}
        currentText=""
      />
    );

    expect(screen.getByText('Run an analysis to reveal insights.')).toBeInTheDocument();
  });

  it('renders populated state and passes navigation handler to child', () => {
    const analysis = createAnalysisResult({
      summary: 'Dashboard summary',
    });

    mockFindQuoteRange.mockReturnValue({ start: 10, end: 25 });

    render(
      <Dashboard
        isLoading={false}
        analysis={analysis}
        currentText={'Without another word, he packed his bags and walked into the storm.'}
      />
    );

    // Summary from AnalysisPanel / ExecutiveSummary
    expect(screen.getByText('Dashboard summary')).toBeInTheDocument();

    // Clicking a plot issue title should use the editor navigation handler
    fireEvent.click(screen.getByText('Motivation for leaving home is unclear.'));

    expect(mockFindQuoteRange).toHaveBeenCalled();
    expect(mockHandleNavigateToIssue).toHaveBeenCalledWith(10, 25);
  });

  it('shows analysis warning when provided', () => {
    const analysis = createAnalysisResult();

    render(
      <Dashboard
        isLoading={false}
        analysis={analysis}
        currentText="Sample text"
        warning={{ message: 'Text truncated for analysis', removedChars: 10, removedPercent: 5, originalLength: 200 }}
        onAnalyzeSelection={vi.fn()}
        hasSelection
      />
    );

    expect(screen.getByText('Analysis Warning')).toBeInTheDocument();
    expect(screen.getByText('Text truncated for analysis')).toBeInTheDocument();
    expect(screen.getByText('Analyze selection only')).toBeInTheDocument();
  });
});
