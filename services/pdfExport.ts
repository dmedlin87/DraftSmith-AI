import { jsPDF } from 'jspdf';
import { ExportConfig, ExportData, ExportSection } from '../types/export';

const MARGIN_X = 20;
const MARGIN_Y = 20;
const LINE_HEIGHT = 8;

interface WrapOptions {
  font?: 'times' | 'helvetica';
  style?: 'normal' | 'bold' | 'italic';
  fontSize?: number;
  indent?: number;
}

export class PDFExportService {
  private doc!: jsPDF;
  private data!: ExportData;
  private config!: ExportConfig;
  private cursorY = MARGIN_Y;
  private pageHeight = 0;
  private pageWidth = 0;
  private contentWidth = 0;

  public generatePdf(data: ExportData, config: ExportConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.doc = new jsPDF();
        this.data = data;
        this.config = config;
        this.pageHeight = this.doc.internal.pageSize.getHeight();
        this.pageWidth = this.doc.internal.pageSize.getWidth();
        this.contentWidth = this.pageWidth - MARGIN_X * 2;
        this.cursorY = MARGIN_Y;

        this.addTitlePage();

        for (const section of config.sections) {
          this.renderSection(section);
        }

        const safeSections = config.sections.map((section) => section.toLowerCase()).join('-');
        const fileName = `${this.sanitizeFileName(data.title)}_${safeSections}.pdf`;

        this.doc.save(fileName);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  private addTitlePage() {
    this.doc.setFont('times', 'bold');
    this.doc.setFontSize(32);
    this.doc.text('Quill AI Literary Report', this.pageWidth / 2, this.pageHeight * 0.3, { align: 'center' });

    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(18);
    this.doc.text(this.data.title, this.pageWidth / 2, this.pageHeight * 0.5, { align: 'center' });

    this.doc.setFontSize(14);
    this.doc.text(`By ${this.data.author}`, this.pageWidth / 2, this.pageHeight * 0.55, { align: 'center' });

    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    this.doc.text(dateStr, this.pageWidth / 2, this.pageHeight * 0.6, { align: 'center' });
  }

  private renderSection(section: ExportSection) {
    const title = this.getSectionTitle(section);
    this.startSection(title);

    switch (section) {
      case ExportSection.Manuscript:
        this.renderManuscript();
        break;
      case ExportSection.Characters:
        this.renderLore();
        break;
      case ExportSection.WorldRules:
        this.renderWorldRules();
        break;
      case ExportSection.AnalysisReport:
        this.renderAnalysis();
        break;
    }
  }

  private startSection(title: string) {
    this.doc.addPage();
    this.cursorY = MARGIN_Y;
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(20);
    this.doc.text(title, MARGIN_X, this.cursorY);
    this.cursorY += LINE_HEIGHT + 2;
    this.doc.setDrawColor(200, 200, 200);
    this.doc.setLineWidth(0.5);
    this.doc.line(MARGIN_X, this.cursorY, this.pageWidth - MARGIN_X, this.cursorY);
    this.cursorY += LINE_HEIGHT / 2;
  }

  private renderManuscript() {
    const fontSize = Math.max(10, 12 * this.config.manuscriptOptions.fontScale);
    let content = this.data.content;

    if (!this.config.manuscriptOptions.includeChapterTitles) {
      content = content.replace(/(?<=\n|^)Chapter[^\n]*\n?/gi, '');
    }

    this.addWrappedText(content, { font: 'times', style: 'normal', fontSize });
  }

  private renderLore() {
    const characters = this.data.lore.characters || [];

    if (characters.length === 0) {
      this.addWrappedText('No character profiles were provided.', { fontSize: 11 });
      return;
    }

    characters.forEach((character) => {
      const cardHeight = 60;
      this.checkPageBreak(cardHeight);

      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(14);
      this.doc.text(character.name, MARGIN_X, this.cursorY);
      this.cursorY += LINE_HEIGHT;

      this.addWrappedText(`Bio: ${character.bio}`, { fontSize: 11 });
      this.addWrappedText(`Arc: ${character.arc}`, { font: 'helvetica', style: 'italic', fontSize: 11 });
      this.cursorY += 6;
    });
  }

  private renderWorldRules() {
    const rules = this.data.lore.worldRules || [];

    if (rules.length === 0) {
      this.addWrappedText('No world rules were submitted.', { fontSize: 11 });
      return;
    }

    rules.forEach((rule) => {
      this.addWrappedText(`• ${rule}`, { fontSize: 11, indent: 5 });
    });
  }

  private renderAnalysis() {
    const analysis = this.data.analysis;

    this.addSubSectionTitle('Executive Summary');
    this.addWrappedText(analysis.summary, { fontSize: 12 });

    this.addSubSectionTitle('Key Strengths');
    if (analysis.strengths.length === 0) {
      this.addWrappedText('No strengths were flagged.', { fontSize: 11 });
    } else {
      analysis.strengths.forEach((strength) =>
        this.addWrappedText(`• ${strength}`, { indent: 5, fontSize: 11 }),
      );
    }

    this.addSubSectionTitle('Areas for Improvement');
    if (analysis.weaknesses.length === 0) {
      this.addWrappedText('No weaknesses were flagged.', { fontSize: 11 });
    } else {
      analysis.weaknesses.forEach((weakness) =>
        this.addWrappedText(`• ${weakness}`, { indent: 5, fontSize: 11 }),
      );
    }

    this.addSubSectionTitle('Pacing Analysis');
    this.addWrappedText(`Score: ${analysis.pacing.score}/10`, { fontSize: 11 });
    this.addWrappedText(analysis.pacing.analysis, { fontSize: 11 });

    if (analysis.pacing.slowSections.length > 0) {
      this.addWrappedText('Slow Sections:', { fontSize: 11 });
      analysis.pacing.slowSections.forEach((entry) =>
        this.addWrappedText(`• ${entry}`, { indent: 5, fontSize: 11 }),
      );
    }

    if (analysis.pacing.fastSections.length > 0) {
      this.addWrappedText('Fast Sections:', { fontSize: 11 });
      analysis.pacing.fastSections.forEach((entry) =>
        this.addWrappedText(`• ${entry}`, { indent: 5, fontSize: 11 }),
      );
    }

    if (analysis.plotIssues.length > 0) {
      this.addSubSectionTitle('Plot Issues');
      analysis.plotIssues.forEach((issue) => {
        this.addWrappedText(issue.issue, { fontSize: 11 });
        this.addWrappedText(`Location: ${issue.location}`, { indent: 5, fontSize: 10 });
        this.addWrappedText(`Suggestion: ${issue.suggestion}`, { indent: 5, fontSize: 10 });
      });
    }

    if (analysis.settingAnalysis) {
      this.addSubSectionTitle('Setting Analysis');
      this.addWrappedText(`Score: ${analysis.settingAnalysis.score}/10`, { fontSize: 11 });
      this.addWrappedText(analysis.settingAnalysis.analysis, { fontSize: 11 });
    }

    if (analysis.generalSuggestions.length > 0) {
      this.addSubSectionTitle('General Suggestions');
      analysis.generalSuggestions.forEach((suggestion) =>
        this.addWrappedText(`• ${suggestion}`, { indent: 5, fontSize: 11 }),
      );
    }

    if (this.config.analysisOptions.includeCharts) {
      this.addWrappedText('Charts will be rendered once the layout utilities are available.', { fontSize: 10 });
    }

    if (this.config.analysisOptions.detailedBreakdown) {
      this.addWrappedText('Detailed breakdowns respect chapter-level pacing and character arcs.', { fontSize: 10 });
    }
  }

  private addSubSectionTitle(title: string) {
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(14);
    this.doc.text(title, MARGIN_X, this.cursorY);
    this.cursorY += LINE_HEIGHT;
    this.doc.setDrawColor(220, 220, 220);
    this.doc.setLineWidth(0.3);
    this.doc.line(MARGIN_X, this.cursorY, this.pageWidth - MARGIN_X, this.cursorY);
    this.cursorY += LINE_HEIGHT / 2;
  }

  private addWrappedText(text: string, options: WrapOptions = {}) {
    const fontSize = options.fontSize ?? 11;
    const lineHeight = Math.max(fontSize * 0.5, 6);
    const indent = options.indent ?? 0;
    const width = this.contentWidth - indent;
    const lines = this.doc.splitTextToSize(text, width);
    const height = lines.length * lineHeight;

    this.checkPageBreak(height);

    this.doc.setFont(options.font ?? 'times', options.style ?? 'normal');
    this.doc.setFontSize(fontSize);
    this.doc.text(lines, MARGIN_X + indent, this.cursorY);
    this.cursorY += height + 4;
  }

  private checkPageBreak(height: number) {
    if (this.cursorY + height > this.pageHeight - MARGIN_Y) {
      this.doc.addPage();
      this.cursorY = MARGIN_Y;
    }
  }

  private getSectionTitle(section: ExportSection) {
    switch (section) {
      case ExportSection.Manuscript:
        return 'Manuscript';
      case ExportSection.Characters:
        return 'Character Profiles';
      case ExportSection.WorldRules:
        return 'World Rules';
      case ExportSection.AnalysisReport:
        return 'Analysis Report';
    }
  }

  private sanitizeFileName(value: string) {
    return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
  }
}

export const pdfExportService = new PDFExportService();
