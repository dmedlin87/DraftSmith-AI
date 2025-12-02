import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('jspdf', () => ({
  jsPDF: vi.fn(() => ({
    internal: { pageSize: { getHeight: vi.fn(() => 297), getWidth: vi.fn(() => 210) } },
    text: vi.fn(),
    addPage: vi.fn(),
    splitTextToSize: vi.fn((text: string) => [text]),
    setFont: vi.fn(),
    setFontSize: vi.fn(),
    setTextColor: vi.fn(),
    save: vi.fn(),
  })),
}));

import { jsPDF } from 'jspdf';
import { PDFExportService } from '@/services/pdfExport';
import { ExportSection, ExportConfig, ExportData } from '@/types/export';
import { AnalysisResult } from '@/types';
import { createAnalysisResult, createCharacter } from '../factories/analysisResultFactory';

const baseConfig: ExportConfig = {
  sections: [ExportSection.Manuscript],
  manuscriptOptions: {
    includeChapterTitles: true,
    fontScale: 1,
    lineHeight: 1.5,
  },
  analysisOptions: {
    includeCharts: false,
    detailedBreakdown: false,
  },
};

const exportData: ExportData = {
  title: 'Test Book',
  author: 'Author Name',
  content: 'Chapter 1 text...',
  lore: { characters: [], worldRules: [] },
  analysis: null,
};

describe('PDFExportService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).HTMLCanvasElement = class {
      toDataURL() {
        return 'data:image/png;base64,fake';
      }
    };
    (globalThis as any).document = {
      createElement: vi.fn((tag: string) =>
        tag === 'canvas' ? new (globalThis as any).HTMLCanvasElement() : ({})
      ),
    } as any;
  });

  const currentInstance = () => {
    const mock = vi.mocked(jsPDF);
    const lastResult = mock.mock.results[mock.mock.results.length - 1];
    if (!lastResult) {
      throw new Error('jsPDF was not instantiated');
    }
    return lastResult.value;
  };

  it('renders title page and saves to filename', async () => {
    const service = new PDFExportService();
    await service.generatePdf(exportData, { ...baseConfig, filename: 'custom.pdf' });

    const instance = currentInstance();
    expect(instance.text).toHaveBeenCalledWith('Test Book', expect.any(Number), expect.any(Number), expect.objectContaining({ align: 'center' }));
    expect(instance.text).toHaveBeenCalledWith('By Author Name', expect.any(Number), expect.any(Number), expect.objectContaining({ align: 'center' }));
    expect(instance.save).toHaveBeenCalledWith('custom.pdf');
  });

  it('renders manuscript header and body', async () => {
    const service = new PDFExportService();
    await service.generatePdf(exportData, baseConfig);

    const instance = currentInstance();
    expect(instance.text).toHaveBeenCalledWith('Manuscript', 20, 20);
    expect(instance.text).toHaveBeenCalledWith('Chapter 1 text...', 20, expect.any(Number));
  });

  it('adds a page per configured section', async () => {
    const service = new PDFExportService();
    await service.generatePdf(exportData, {
      ...baseConfig,
      sections: [ExportSection.Manuscript, ExportSection.WorldRules, ExportSection.AnalysisReport],
    });

    const instance = currentInstance();
    expect(instance.addPage).toHaveBeenCalledTimes(3);
  });

  it('falls back when character list is empty', async () => {
    const service = new PDFExportService();
    await service.generatePdf(exportData, { ...baseConfig, sections: [ExportSection.Characters] });

    const instance = currentInstance();
    expect(instance.text).toHaveBeenCalledWith('Character Profiles', 20, 20);
    expect(instance.text).toHaveBeenCalledWith('No characters defined.', 20, expect.any(Number));
  });

  it('strips chapter titles when disabled in manuscript options', async () => {
    const service = new PDFExportService();
    const dataWithChapters: ExportData = {
      ...exportData,
      content: 'Chapter 1: The Beginning\nActual story content.',
    };

    await service.generatePdf(dataWithChapters, {
      ...baseConfig,
      manuscriptOptions: {
        ...baseConfig.manuscriptOptions,
        includeChapterTitles: false,
      },
    });

    const instance = currentInstance();
    const firstCall = instance.splitTextToSize.mock.calls[0];
    expect(firstCall[0]).toBe('Actual story content.');
  });

  it('renders character profiles with arcs and biographies', async () => {
    const characters = [createCharacter(), createCharacter({ arc: '' })];
    const service = new PDFExportService();

    await service.generatePdf(
      {
        ...exportData,
        lore: { characters, worldRules: [] },
      },
      { ...baseConfig, sections: [ExportSection.Characters] },
    );

    const instance = currentInstance();
    expect(instance.text).toHaveBeenCalledWith(characters[0].name, 20, expect.any(Number));
    expect(instance.text).toHaveBeenCalledWith(`Arc: ${characters[0].arc}`, 20, expect.any(Number));
    expect(instance.text).toHaveBeenCalledWith(characters[0].bio, 20, expect.any(Number));
  });

  it('renders world rules as a bulleted list', async () => {
    const service = new PDFExportService();

    await service.generatePdf(
      {
        ...exportData,
        lore: { characters: [], worldRules: ['Magic has a price.', 'The city never sleeps.'] },
      },
      { ...baseConfig, sections: [ExportSection.WorldRules] },
    );

    const instance = currentInstance();
    expect(instance.text).toHaveBeenCalledWith('World Rules', 20, 20);
    expect(instance.text).toHaveBeenCalledWith('•', 20, expect.any(Number));
    expect(instance.text).toHaveBeenCalledWith('Magic has a price.', 25, expect.any(Number));
    expect(instance.text).toHaveBeenCalledWith('The city never sleeps.', 25, expect.any(Number));
  });

  it('renders a full analysis report with pacing, plot issues, and suggestions', async () => {
    const analysis = createAnalysisResult();
    const service = new PDFExportService();

    await service.generatePdf(
      {
        ...exportData,
        analysis,
      },
      { ...baseConfig, sections: [ExportSection.AnalysisReport] },
    );

    const instance = currentInstance();
    expect(instance.text).toHaveBeenCalledWith('Analysis Report', 20, 20);
    expect(instance.text).toHaveBeenCalledWith('Executive Summary', 20, expect.any(Number));
    expect(instance.text).toHaveBeenCalledWith(analysis.summary, 20, expect.any(Number));
    expect(instance.text).toHaveBeenCalledWith('Strengths', 20, expect.any(Number));
    expect(instance.text).toHaveBeenCalledWith(expect.stringContaining('Vivid descriptions'), 20, expect.any(Number));
    expect(instance.text).toHaveBeenCalledWith('Weaknesses', 20, expect.any(Number));
    expect(instance.text).toHaveBeenCalledWith(
      expect.stringContaining('Opening is slightly slow'),
      20,
      expect.any(Number),
    );

    expect(instance.text).toHaveBeenCalledWith('Pacing Score', 20, expect.any(Number));
    expect(instance.text).toHaveBeenCalledWith(`Score: ${analysis.pacing.score}/10`, 20, expect.any(Number));
    expect(instance.text).toHaveBeenCalledWith('Pacing Notes', 20, expect.any(Number));
    expect(instance.text).toHaveBeenCalledWith(analysis.pacing.analysis, 20, expect.any(Number));

    expect(instance.text).toHaveBeenCalledWith('Plot Issues', 20, expect.any(Number));
    const plotIssue = analysis.plotIssues[0];
    expect(instance.text).toHaveBeenCalledWith(plotIssue.issue, 20, expect.any(Number));
    expect(instance.text).toHaveBeenCalledWith(`Location: ${plotIssue.location}`, 20, expect.any(Number));
    expect(instance.text).toHaveBeenCalledWith(`Suggestion: ${plotIssue.suggestion}`, 20, expect.any(Number));

    expect(instance.text).toHaveBeenCalledWith('General Suggestions', 20, expect.any(Number));
    expect(instance.text).toHaveBeenCalledWith(analysis.generalSuggestions[0], 20, expect.any(Number));
  });

  it('handles analysis sections when optional data is missing', async () => {
    const analysis = {
      summary: '',
      strengths: [],
      weaknesses: [],
      pacing: undefined,
      plotIssues: [],
      generalSuggestions: [],
    } as unknown as AnalysisResult;

    const service = new PDFExportService();
    await service.generatePdf(
      {
        ...exportData,
        analysis,
      },
      { ...baseConfig, sections: [ExportSection.AnalysisReport] },
    );

    const instance = currentInstance();
    expect(instance.text).toHaveBeenCalledWith('Executive Summary', 20, expect.any(Number));
    expect(instance.text).toHaveBeenCalledWith('None provided.', 20, expect.any(Number));
    expect(instance.text).not.toHaveBeenCalledWith('Pacing Score', 20, expect.any(Number));
    expect(instance.text).not.toHaveBeenCalledWith('Plot Issues', 20, expect.any(Number));
    expect(instance.text).not.toHaveBeenCalledWith('General Suggestions', 20, expect.any(Number));
  });

  it('uses a sanitized title when no filename is provided', async () => {
    const service = new PDFExportService();
    await service.generatePdf(
      {
        ...exportData,
        title: 'Messy Title!',
      },
      baseConfig,
    );

    const instance = currentInstance();
    expect(instance.save).toHaveBeenCalledWith('messy_title__export.pdf');
  });

  it('falls back to a default filename when title is empty', async () => {
    const service = new PDFExportService();
    await service.generatePdf(
      {
        ...exportData,
        title: '',
      },
      baseConfig,
    );

    const instance = currentInstance();
    expect(instance.save).toHaveBeenCalledWith('quill-export_export.pdf');
  });

  it('adds extra pages when manuscript content overflows the page', async () => {
    const service = new PDFExportService();
    const instance = currentInstance();
    instance.splitTextToSize.mockImplementation(() => Array(60).fill('line'));

    await service.generatePdf(exportData, baseConfig);

    expect(instance.addPage.mock.calls.length).toBeGreaterThan(1);
  });

  it('logs and rethrows a generic error when PDF generation fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const service = new PDFExportService();
    const renderTitleSpy = vi
      .spyOn(PDFExportService.prototype as any, 'renderTitlePage' as any)
      .mockImplementationOnce(() => {
        throw new Error('Render failed');
      });

    await expect(service.generatePdf(exportData, baseConfig)).rejects.toThrow('Failed to generate PDF');
    expect(consoleSpy).toHaveBeenCalledWith('PDF Generation Failed:', expect.any(Error));

    const instance = currentInstance();
    expect(instance.save).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
    renderTitleSpy.mockRestore();
  });

  it('falls back to an empty character array when lore.characters is undefined', async () => {
    const service = new PDFExportService();

    await service.generatePdf(
      {
        ...exportData,
        lore: { characters: undefined as any, worldRules: [] } as any,
      } as any,
      { ...baseConfig, sections: [ExportSection.Characters] },
    );

    const instance = currentInstance();
    expect(instance.text).toHaveBeenCalledWith('Character Profiles', 20, 20);
    expect(instance.text).toHaveBeenCalledWith('No characters defined.', 20, expect.any(Number));
  });

  it('falls back to an empty world rules array when lore.worldRules is undefined', async () => {
    const service = new PDFExportService();

    await service.generatePdf(
      {
        ...exportData,
        lore: { characters: [], worldRules: undefined as any } as any,
      } as any,
      { ...baseConfig, sections: [ExportSection.WorldRules] },
    );

    const instance = currentInstance();
    expect(instance.text).toHaveBeenCalledWith('World Rules', 20, 20);
    expect(instance.text).toHaveBeenCalledWith('No world rules defined.', 20, expect.any(Number));
  });

  it('uses a default biography when character bio is missing', async () => {
    const characterWithoutBio = createCharacter({ bio: '' });
    const service = new PDFExportService();

    await service.generatePdf(
      {
        ...exportData,
        lore: { characters: [characterWithoutBio], worldRules: [] },
      },
      { ...baseConfig, sections: [ExportSection.Characters] },
    );

    const instance = currentInstance();
    expect(instance.text).toHaveBeenCalledWith('No biography.', 20, expect.any(Number));
  });

  it('forces a page break when rendering near the bottom margin', () => {
    const service = new PDFExportService();
    const internal = service as any;
    const instance = currentInstance();

    internal.cursorY = internal.pageHeight - 5;
    internal.checkPageBreak(10);

    expect(instance.addPage).toHaveBeenCalledTimes(1);
    expect(internal.cursorY).toBe(20);
  });

  it('applies heading and body fonts when rendering section titles', () => {
    const service = new PDFExportService();
    const instance = currentInstance();

    (service as any).ensureSectionTitle('Font Embedding');

    expect(instance.setFont).toHaveBeenCalledWith('helvetica', 'bold');
    expect(instance.setFontSize).toHaveBeenCalledWith(13);
    expect(instance.text).toHaveBeenCalledWith('Font Embedding', 20, expect.any(Number));
    expect(instance.setFont).toHaveBeenCalledWith('helvetica', 'normal');
  });

  it('falls back to placeholder content when section text is missing', () => {
    const service = new PDFExportService();
    const instance = currentInstance();

    (service as any).ensureSectionWithText('Missing Section');

    expect(instance.text).toHaveBeenCalledWith('Missing Section', 20, expect.any(Number));
    expect(instance.text).toHaveBeenCalledWith('None provided.', 20, expect.any(Number));
  });
});
