import type { Chapter, Lore, ManuscriptIndex } from '@/types/schema';
import type { ManuscriptIntelligence } from '@/services/intelligence';

export interface AppBrainCommand<TParams, TResult, TDependencies = void> {
  execute(params: TParams, dependencies: TDependencies): Promise<TResult> | TResult;
}

export type ExclusiveEditRunner = <T>(fn: () => Promise<T>) => Promise<T>;

export interface NavigationDependencies {
  currentText: string;
  activeChapterId: string | null;
  chapters: Chapter[];
  selectChapter: (chapterId: string) => void;
  cursorPosition: number;
  scrollToPosition: (position: number) => void;
  navigateToRange: (start: number, end: number) => void;
  intelligence: ManuscriptIntelligence | null | undefined;
}

export interface EditingDependencies {
  currentText: string;
  commitEdit: (text: string, description: string, author: 'User' | 'Agent') => void;
  runExclusiveEdit: ExclusiveEditRunner;
}

export interface AnalysisDependencies {
  selection: { start: number; end: number; text: string } | null;
  currentText: string;
  setting?: { timePeriod: string; location: string };
  manuscriptIndex?: ManuscriptIndex;
  analyzePacing: (text: string, setting?: { timePeriod: string; location: string }) => Promise<void>;
  analyzeCharacters: (text: string, manuscriptIndex?: ManuscriptIndex) => Promise<void>;
  analyzePlot: (text: string) => Promise<void>;
  analyzeSetting: (text: string, setting: { timePeriod: string; location: string }) => Promise<void>;
  runFullAnalysis: (
    text: string,
    setting?: { timePeriod: string; location: string },
    manuscriptIndex?: ManuscriptIndex
  ) => Promise<unknown>;
}

export interface KnowledgeDependencies {
  lore: Lore | undefined | null;
}

export interface UIDependencies {
  switchPanel: (panel: string) => void;
  toggleZenMode: () => void;
  highlightText: (start: number, end: number, style: string) => void;
  setSelection: (start: number, end: number) => void;
  isZenMode: boolean;
  activePanel: string | null;
}

export interface GenerationDependencies {
  selection: { start: number; end: number; text: string } | null;
  currentText: string;
  commitEdit: (text: string, description: string, author: 'User' | 'Agent') => void;
  runExclusiveEdit: ExclusiveEditRunner;
  generateRewrite: (text: string, mode: string, tone?: string) => Promise<string>;
  generateContinuation: (params: { context: string; selection?: string | null }) => Promise<string>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Command History Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ExecutedCommand {
  id: string;
  toolName: string;
  params: Record<string, unknown>;
  timestamp: number;
  result: string;
  success: boolean;
  reversible: boolean;
}
