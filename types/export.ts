import { AnalysisResult } from './types';
import { Lore } from './schema';

/**
 * High-level sections that can be assembled into a smart export package.
 * Additional entries (e.g., StoryBible, QueryLetter) can be added without
 * impacting downstream interfaces.
 */
export enum ExportSection {
  Manuscript = 'MANUSCRIPT',
  Characters = 'CHARACTERS',
  WorldRules = 'WORLD_RULES',
  AnalysisReport = 'ANALYSIS_REPORT',
}

export interface ExportConfig {
  sections: ExportSection[];
  manuscriptOptions: {
    includeChapterTitles: boolean;
    fontScale: number;
  };
  analysisOptions: {
    includeCharts: boolean;
    detailedBreakdown: boolean;
  };
}

export interface ExportData {
  title: string;
  author: string;
  content: string;
  lore: Lore;
  analysis: AnalysisResult;
}
