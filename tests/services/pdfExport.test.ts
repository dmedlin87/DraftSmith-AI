import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PDFExportService } from '@/services/pdfExport';
import type { AnalysisResult } from '@/types';
import type { ExportConfig, ExportData } from '@/types/export';
import { ExportSection } from '@/types/export';

const saveMock = vi.fn();
const textMock = vi.fn();
const addPageMock = vi.fn();
const lineMock = vi.fn();
const rectMock = vi.fn();
const splitTextToSizeMock = vi.fn((text: string | string[], width: number) => {
  if (Array.isArray(text)) return text;
  return [String(text)];
});

vi.mock('jspdf', () => ({
  jsPDF: vi.fn().mockImplementation(() => ({
    internal: {
      pageSize: {
        getWidth: vi.fn(() => 210),
        getHeight: vi.fn(() => 297),
      },
    },
    setFont: vi.fn(),
    setFontSize: vi.fn(),
    setTextColor: vi.fn(),
    setDrawColor: vi.fn(),
    setFillColor: vi.fn(),
    setLineWidth: vi.fn(),
    text: textMock,
    addPage: addPageMock,
    line: lineMock,
    rect: rectMock,
    splitTextToSize: splitTextToSizeMock,
    save: saveMock,
  })),
}));

const createBaseAnalysis = (overrides: Partial<AnalysisResult> = {}): AnalysisResult => ({
  summary: 'Overall this is a strong draft with vivid imagery.',
  strengths: ['Strong character voice', 'Vivid worldbuilding'],
  weaknesses: ['Pacing drags in the middle chapters'],
  pacing: {
    score: 7,
    analysis: 'Generally solid pacing with a few slow sections.',
    slowSections: ['Chapter 3 - exposition heavy'],
    fastSections: ['Final battle feels rushed'],
  },
  plotIssues: [
    {
      issue: 'Motivation unclear for antagonist in Act II',
      location: 'Chapter 8, scene 2',
      suggestion: 'Clarify the antagonist\'s long-term goal.',
    },
  ],
  characters: [
    {
      name: 'Ava Thorne',
      bio: 'Reluctant hero with a mysterious past.',
      arc: 'Learns to accept responsibility for her powers.',
      arcStages: [],
      relationships: [],
      plotThreads: [],
      inconsistencies: [],
      developmentSuggestion: 'Show more of her internal conflict early on.',
    },
  ],
  generalSuggestions: ['Tighten middle act pacing.'],
  ...overrides,
});

const createExportData = (overrides: Partial<ExportData> = {}): ExportData => ({
  title: 'The Everwood Chronicles',
  author: 'A.R. Quinn',
  content: 'Chapter 1: Dawn\nThe sun rises over Everwood.',
  lore: {
    characters: [
      {
        name: 'Ava Thorne',
        bio: 'Reluctant hero.',
        arc: 'Learns responsibility.',
        arcStages: [],
        relationships: [],
        plotThreads: [],
        inconsistencies: [],
        developmentSuggestion: 'More internal conflict.',
      },
    ],
    worldRules: ['No magic after midnight', 'The moon dictates travel'],
  },
  analysis: createBaseAnalysis(),
  ...overrides,
});

const flattenTextCalls = () =>
  textMock.mock.calls.flatMap(([value]) => (Array.isArray(value) ? value : [value]));

const defaultConfig: ExportConfig = {
  sections: [
    ExportSection.Manuscript,
    ExportSection.Characters,
    ExportSection.WorldRules,
    ExportSection.AnalysisReport,
  ],
  manuscriptOptions: {
    includeChapterTitles: true,
    fontScale: 1,
  },
  analysisOptions: {
    includeCharts: true,
    detailedBreakdown: true,
  },
};

describe('PDFExportService', () => {
  beforeEach(() => {
    saveMock.mockClear();
    textMock.mockClear();
    addPageMock.mockClear();
    lineMock.mockClear();
    rectMock.mockClear();
    splitTextToSizeMock.mockClear();
  });

  it('renders every configured section and saves with a sanitized filename', async () => {
    const service = new PDFExportService();
    const data = createExportData();

    await expect(service.generatePdf(data, defaultConfig)).resolves.toBeUndefined();

    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenCalledWith(
      'The_Everwood_Chronicles_manuscript-characters-world_rules-analysis_report.pdf',
    );

    const renderedText = flattenTextCalls();
    expect(renderedText).toContain('Quill AI Literary Report');
    expect(renderedText).toContain('Manuscript');
    expect(renderedText).toContain('Character Profiles');
    expect(renderedText).toContain('World Rules');
    expect(renderedText).toContain('Analysis Report');
    expect(renderedText).toContain('Ava Thorne');
  });

  it('handles missing lore entries and empty analysis data without failing', async () => {
    const minimalAnalysis: AnalysisResult = {
      summary: '',
      strengths: [],
      weaknesses: [],
      pacing: {
        score: 0,
        analysis: '',
        slowSections: [],
        fastSections: [],
      },
      settingAnalysis: undefined,
      plotIssues: [],
      characters: [],
      generalSuggestions: [],
    };

    const data = createExportData({
      analysis: minimalAnalysis,
      lore: {
        characters: [],
        worldRules: [],
      },
    });

    const config: ExportConfig = {
      sections: [
        ExportSection.Manuscript,
        ExportSection.Characters,
        ExportSection.WorldRules,
        ExportSection.AnalysisReport,
      ],
      manuscriptOptions: { includeChapterTitles: false, fontScale: 1 },
      analysisOptions: { includeCharts: false, detailedBreakdown: false },
    };

    const service = new PDFExportService();
    await expect(service.generatePdf(data, config)).resolves.toBeUndefined();

    expect(saveMock).toHaveBeenCalledTimes(1);

    const renderedText = flattenTextCalls();
    expect(renderedText).toContain('No character profiles were provided.');
    expect(renderedText).toContain('No strengths were flagged.');
    expect(renderedText).toContain('No weaknesses were flagged.');
    expect(renderedText).toContain('No world rules were submitted.');
  });
});
