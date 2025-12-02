import { describe, it, expect } from 'vitest';
import { enrichAnalysisWithPositions, findQuoteRange } from '@/features/shared/utils/textLocator';

const sampleText = 'First line.  Second line with   extra spaces.';

describe('findQuoteRange', () => {
  it('finds exact and trimmed matches', () => {
    expect(findQuoteRange(sampleText, 'Second line')).toEqual({ start: 13, end: 24 });
    expect(findQuoteRange(sampleText, '  Second line ')).toEqual({ start: 11, end: 25 });
  });

  it('handles normalized whitespace and partial fallbacks', () => {
    expect(findQuoteRange(sampleText, 'Second line with extra spaces')).toEqual({ start: 13, end: 42 });
    expect(findQuoteRange(sampleText, 'First line.  Second')).toEqual({ start: 0, end: 19 });
  });

  it('returns the first match when multiple occurrences exist', () => {
    const text = 'repeat here and repeat over there';
    expect(findQuoteRange(text, 'repeat')).toEqual({ start: 0, end: 6 });
  });

  it('falls back to fuzzy search when exact matching fails', () => {
    const text = 'abcdefg hijkl';
    // Missing the "d" would normally fail an exact match, so this exercises the fuzzy matcher path.
    expect(findQuoteRange(text, 'abcefg')).toEqual({ start: 0, end: 6 });
  });

  it('handles normalized whitespace mapping back to original indices', () => {
    const text = 'A  B\tC';
    expect(findQuoteRange(text, 'A B C')).toEqual({ start: 0, end: 5 });
  });

  it('returns null when no match can be found', () => {
    expect(findQuoteRange(sampleText, 'Nonexistent quote')).toBeNull();
    expect(findQuoteRange('', 'anything')).toBeNull();
  });
});

describe('enrichAnalysisWithPositions', () => {
  it('populates indices for nested analysis structures', () => {
    const enriched = enrichAnalysisWithPositions({
      summary: '',
      strengths: [],
      weaknesses: [],
      pacing: { score: 0, analysis: '', slowSections: [], fastSections: [] },
      plotIssues: [
        { issue: 'Plot hole', location: 'chap', suggestion: 'fix', quote: 'Second line with   extra spaces.' },
      ],
      characters: [
        {
          name: 'A',
          bio: '',
          arc: '',
          arcStages: [],
          relationships: [],
          plotThreads: [],
          inconsistencies: [{ issue: 'conflict', quote: 'First line.' }],
          developmentSuggestion: '',
          voiceTraits: '',
        },
      ],
      generalSuggestions: [],
      settingAnalysis: { score: 0, analysis: '', issues: [{ issue: 's', suggestion: '', quote: 'Second line' }] },
    }, sampleText);

    expect(enriched.plotIssues[0]).toMatchObject({ startIndex: 13, endIndex: 45 });
    expect(enriched.settingAnalysis?.issues?.[0]).toMatchObject({ startIndex: 13, endIndex: 24 });
    expect(enriched.characters[0].inconsistencies[0]).toMatchObject({ startIndex: 0, endIndex: 11 });
  });

  it('leaves issues untouched when positions cannot be resolved', () => {
    const analysis = {
      summary: '',
      strengths: [],
      weaknesses: [],
      pacing: { score: 0, analysis: '', slowSections: [], fastSections: [] },
      plotIssues: [{ issue: 'Missing quote', location: '', suggestion: '', quote: 'nowhere' }],
      settingAnalysis: { score: 0, analysis: '', issues: [{ issue: 'missing', suggestion: '', quote: 'absent' }] },
      characters: [
        {
          name: 'A',
          bio: '',
          arc: '',
          arcStages: [],
          relationships: [],
          plotThreads: [],
          inconsistencies: [{ issue: 'no quote', quote: '' }],
          developmentSuggestion: '',
          voiceTraits: '',
        },
      ],
      generalSuggestions: [],
    } as const;

    const enriched = enrichAnalysisWithPositions(analysis, 'short text');

    expect(enriched.plotIssues[0]).not.toHaveProperty('startIndex');
    expect(enriched.settingAnalysis?.issues?.[0]).not.toHaveProperty('startIndex');
    expect(enriched.characters[0].inconsistencies[0]).not.toHaveProperty('startIndex');
  });
});
