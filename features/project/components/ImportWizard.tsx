import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ParsedChapter } from '@/services/manuscriptParser';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

type ChapterType = 'prologue' | 'chapter' | 'interlude' | 'part' | 'epilogue' | 'appendix' | 'unknown';

interface EnhancedChapter extends ParsedChapter {
  id: string;
  type: ChapterType;
  wordCount: number;
  charCount: number;
  paragraphCount: number;
  estimatedReadTime: number; // minutes
  qualityScore: number; // 0-100
  issues: ChapterIssue[];
  aiSummary?: string;
  suggestedTitle?: string;
  isSelected: boolean;
  collapsed: boolean;
}

interface ChapterIssue {
  type: 'warning' | 'error' | 'suggestion';
  code: string;
  message: string;
  autoFixable: boolean;
  fixAction?: () => void;
}

interface WizardStep {
  id: string;
  title: string;
  description: string;
  icon: string;
  isComplete: boolean;
  isActive: boolean;
}

interface HistoryEntry {
  chapters: EnhancedChapter[];
  description: string;
  timestamp: number;
}

interface ImportStats {
  totalChapters: number;
  totalWords: number;
  totalChars: number;
  avgWordsPerChapter: number;
  estimatedTotalReadTime: number;
  qualityScore: number;
  issueCount: number;
  autoFixableIssues: number;
}

interface Props {
  initialChapters: ParsedChapter[];
  onConfirm: (chapters: ParsedChapter[]) => void;
  onCancel: () => void;
  onAIEnhance?: (text: string) => Promise<{ summary: string; suggestedTitle: string }>;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const generateId = () => crypto.randomUUID();

const detectChapterType = (title: string, content: string, index: number, total: number): ChapterType => {
  const lowerTitle = title.toLowerCase();
  
  if (/^(prologue|prol\.?|preface|introduction|intro)/.test(lowerTitle)) return 'prologue';
  if (/^(epilogue|epil\.?|afterword|conclusion)/.test(lowerTitle)) return 'epilogue';
  if (/^(part|book|volume|act)\s+/i.test(lowerTitle)) return 'part';
  if (/^(interlude|intermission|intermezzo)/.test(lowerTitle)) return 'interlude';
  if (/^(appendix|appendices|addendum|glossary|notes)/.test(lowerTitle)) return 'appendix';
  if (/^(chapter|\d+|[ivxlcdm]+[.:\s])/i.test(lowerTitle)) return 'chapter';
  
  // Position-based inference
  if (index === 0 && total > 3) {
    const hasShortContent = content.length < 2000;
    if (hasShortContent) return 'prologue';
  }
  if (index === total - 1 && total > 3) {
    const hasShortContent = content.length < 2000;
    if (hasShortContent) return 'epilogue';
  }
  
  return 'chapter';
};

const calculateWordCount = (text: string): number => {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
};

const calculateParagraphCount = (text: string): number => {
  return text.split(/\n\s*\n/).filter(p => p.trim().length > 0).length;
};

const calculateReadTime = (wordCount: number): number => {
  return Math.ceil(wordCount / 250); // 250 wpm average
};

const analyzeChapterIssues = (chapter: EnhancedChapter, allChapters: EnhancedChapter[]): ChapterIssue[] => {
  const issues: ChapterIssue[] = [];
  
  // Check for very short content
  if (chapter.wordCount < 100) {
    issues.push({
      type: 'warning',
      code: 'SHORT_CONTENT',
      message: 'Chapter has very little content (< 100 words)',
      autoFixable: false
    });
  }
  
  // Check for very long content
  if (chapter.wordCount > 15000) {
    issues.push({
      type: 'suggestion',
      code: 'LONG_CONTENT',
      message: 'Chapter is very long. Consider splitting.',
      autoFixable: false
    });
  }
  
  // Check for duplicate titles
  const duplicateTitles = allChapters.filter(c => 
    c.id !== chapter.id && c.title.toLowerCase() === chapter.title.toLowerCase()
  );
  if (duplicateTitles.length > 0) {
    issues.push({
      type: 'error',
      code: 'DUPLICATE_TITLE',
      message: 'Duplicate chapter title detected',
      autoFixable: true
    });
  }
  
  // Check for generic title
  if (/^(chapter\s+\d+|untitled|new chapter)$/i.test(chapter.title.trim())) {
    issues.push({
      type: 'suggestion',
      code: 'GENERIC_TITLE',
      message: 'Consider adding a descriptive title',
      autoFixable: false
    });
  }
  
  // Check for orphaned content (very short, no real structure)
  if (chapter.paragraphCount < 2 && chapter.wordCount < 50) {
    issues.push({
      type: 'warning',
      code: 'ORPHANED_CONTENT',
      message: 'Appears to be orphaned content. Consider merging.',
      autoFixable: false
    });
  }
  
  // Check for leading/trailing whitespace issues
  if (chapter.content.startsWith('\n\n\n') || chapter.content.endsWith('\n\n\n')) {
    issues.push({
      type: 'suggestion',
      code: 'EXCESS_WHITESPACE',
      message: 'Excessive whitespace at start/end',
      autoFixable: true
    });
  }
  
  // Check for potential page numbers or artifacts left in text
  const artifactPattern = /^\s*\d{1,4}\s*$/gm;
  const artifactMatches = chapter.content.match(artifactPattern);
  if (artifactMatches && artifactMatches.length > 3) {
    issues.push({
      type: 'warning',
      code: 'PAGE_ARTIFACTS',
      message: `${artifactMatches.length} potential page number artifacts detected`,
      autoFixable: true
    });
  }
  
  return issues;
};

const calculateQualityScore = (chapter: EnhancedChapter): number => {
  let score = 100;
  
  // Deduct for issues
  for (const issue of chapter.issues) {
    if (issue.type === 'error') score -= 20;
    if (issue.type === 'warning') score -= 10;
    if (issue.type === 'suggestion') score -= 5;
  }
  
  // Bonus for good structure
  if (chapter.paragraphCount >= 5 && chapter.paragraphCount <= 50) score += 5;
  if (chapter.wordCount >= 1000 && chapter.wordCount <= 8000) score += 5;
  if (chapter.title.length > 3 && chapter.title.length < 100) score += 5;
  
  return Math.max(0, Math.min(100, score));
};

const enhanceChapter = (
  chapter: ParsedChapter, 
  index: number, 
  total: number,
  allChapters: EnhancedChapter[]
): EnhancedChapter => {
  const wordCount = calculateWordCount(chapter.content);
  const charCount = chapter.content.length;
  const paragraphCount = calculateParagraphCount(chapter.content);
  
  const enhanced: EnhancedChapter = {
    ...chapter,
    id: generateId(),
    type: detectChapterType(chapter.title, chapter.content, index, total),
    wordCount,
    charCount,
    paragraphCount,
    estimatedReadTime: calculateReadTime(wordCount),
    qualityScore: 0,
    issues: [],
    isSelected: false,
    collapsed: false
  };
  
  enhanced.issues = analyzeChapterIssues(enhanced, allChapters);
  enhanced.qualityScore = calculateQualityScore(enhanced);
  
  return enhanced;
};

const calculateStats = (chapters: EnhancedChapter[]): ImportStats => {
  const totalWords = chapters.reduce((sum, c) => sum + c.wordCount, 0);
  const totalChars = chapters.reduce((sum, c) => sum + c.charCount, 0);
  const allIssues = chapters.flatMap(c => c.issues);
  const avgQuality = chapters.length > 0 
    ? chapters.reduce((sum, c) => sum + c.qualityScore, 0) / chapters.length 
    : 0;
  
  return {
    totalChapters: chapters.length,
    totalWords,
    totalChars,
    avgWordsPerChapter: chapters.length > 0 ? Math.round(totalWords / chapters.length) : 0,
    estimatedTotalReadTime: calculateReadTime(totalWords),
    qualityScore: Math.round(avgQuality),
    issueCount: allIssues.length,
    autoFixableIssues: allIssues.filter(i => i.autoFixable).length
  };
};

// ============================================================================
// ICON COMPONENTS
// ============================================================================

const Icons = {
  Upload: () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
    </svg>
  ),
  Structure: () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
    </svg>
  ),
  Review: () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Drag: () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  ),
  Trash: () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
    </svg>
  ),
  Merge: () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
    </svg>
  ),
  Split: () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M12 17.25h8.25" />
    </svg>
  ),
  Undo: () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
    </svg>
  ),
  Redo: () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 000 12h3" />
    </svg>
  ),
  Search: () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
    </svg>
  ),
  Warning: () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
    </svg>
  ),
  Error: () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
    </svg>
  ),
  Suggestion: () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
    </svg>
  ),
  Check: () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  ),
  ChevronDown: () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
    </svg>
  ),
  ChevronRight: () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
    </svg>
  ),
  Sparkles: () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
    </svg>
  ),
  Fix: () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l5.653-4.655m1.167-.459 5.866-5.866A2.652 2.652 0 0 0 17.25 3 2.652 2.652 0 0 0 14.1 5.88l-4.66 4.66" />
    </svg>
  ),
  Keyboard: () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
    </svg>
  ),
  Copy: () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
    </svg>
  ),
  SelectAll: () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
    </svg>
  )
};

// ============================================================================
// CHAPTER TYPE BADGE COMPONENT
// ============================================================================

const ChapterTypeBadge: React.FC<{ type: ChapterType }> = ({ type }) => {
  const config: Record<ChapterType, { bg: string; text: string; label: string }> = {
    prologue: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Prologue' },
    chapter: { bg: 'bg-indigo-100', text: 'text-indigo-700', label: 'Chapter' },
    interlude: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Interlude' },
    part: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Part' },
    epilogue: { bg: 'bg-rose-100', text: 'text-rose-700', label: 'Epilogue' },
    appendix: { bg: 'bg-slate-100', text: 'text-slate-700', label: 'Appendix' },
    unknown: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Unknown' }
  };

  const c = config[type];
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
};

// ============================================================================
// QUALITY SCORE BADGE
// ============================================================================

const QualityBadge: React.FC<{ score: number }> = ({ score }) => {
  const getColor = (s: number) => {
    if (s >= 80) return 'bg-green-500';
    if (s >= 60) return 'bg-yellow-500';
    if (s >= 40) return 'bg-orange-500';
    return 'bg-red-500';
  };

  return (
    <div className="flex items-center gap-1.5" title={`Quality Score: ${score}/100`}>
      <div className="w-12 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${getColor(score)}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-[10px] font-mono text-gray-500">{score}</span>
    </div>
  );
};

// ============================================================================
// ISSUE BADGE
// ============================================================================

const IssueBadge: React.FC<{ issues: ChapterIssue[] }> = ({ issues }) => {
  if (issues.length === 0) return null;

  const errors = issues.filter(i => i.type === 'error').length;
  const warnings = issues.filter(i => i.type === 'warning').length;
  const suggestions = issues.filter(i => i.type === 'suggestion').length;

  return (
    <div className="flex items-center gap-1">
      {errors > 0 && (
        <span className="flex items-center gap-0.5 text-red-600 text-[10px] font-medium">
          <Icons.Error /> {errors}
        </span>
      )}
      {warnings > 0 && (
        <span className="flex items-center gap-0.5 text-amber-600 text-[10px] font-medium">
          <Icons.Warning /> {warnings}
        </span>
      )}
      {suggestions > 0 && (
        <span className="flex items-center gap-0.5 text-blue-600 text-[10px] font-medium">
          <Icons.Suggestion /> {suggestions}
        </span>
      )}
    </div>
  );
};

// ============================================================================
// KEYBOARD SHORTCUTS MODAL
// ============================================================================

const KeyboardShortcutsModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const shortcuts = [
    { keys: ['⌘/Ctrl', 'Z'], action: 'Undo' },
    { keys: ['⌘/Ctrl', 'Shift', 'Z'], action: 'Redo' },
    { keys: ['⌘/Ctrl', 'A'], action: 'Select All Chapters' },
    { keys: ['⌘/Ctrl', 'F'], action: 'Search Chapters' },
    { keys: ['Delete/Backspace'], action: 'Delete Selected' },
    { keys: ['⌘/Ctrl', 'M'], action: 'Merge Selected' },
    { keys: ['↑', '↓'], action: 'Navigate Chapters' },
    { keys: ['Space'], action: 'Toggle Selection' },
    { keys: ['Enter'], action: 'Edit Selected Chapter' },
    { keys: ['Escape'], action: 'Clear Selection / Close' }
  ];

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2">
            <Icons.Keyboard /> Keyboard Shortcuts
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">×</button>
        </div>
        <div className="space-y-2">
          {shortcuts.map((s, i) => (
            <div key={i} className="flex justify-between items-center py-1.5 border-b border-gray-100 last:border-0">
              <span className="text-sm text-gray-600">{s.action}</span>
              <div className="flex items-center gap-1">
                {s.keys.map((k, j) => (
                  <React.Fragment key={j}>
                    <kbd className="px-2 py-1 bg-gray-100 rounded text-xs font-mono text-gray-700 border border-gray-200">{k}</kbd>
                    {j < s.keys.length - 1 && <span className="text-gray-400 text-xs">+</span>}
                  </React.Fragment>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// STATS DASHBOARD
// ============================================================================

const StatsDashboard: React.FC<{ stats: ImportStats }> = ({ stats }) => {
  const statItems = [
    { label: 'Chapters', value: stats.totalChapters, icon: '📚' },
    { label: 'Words', value: stats.totalWords.toLocaleString(), icon: '📝' },
    { label: 'Avg/Chapter', value: stats.avgWordsPerChapter.toLocaleString(), icon: '📊' },
    { label: 'Read Time', value: `${stats.estimatedTotalReadTime}m`, icon: '⏱️' },
    { label: 'Quality', value: `${stats.qualityScore}%`, icon: stats.qualityScore >= 70 ? '✅' : '⚠️' },
    { label: 'Issues', value: stats.issueCount, icon: stats.issueCount > 0 ? '🔧' : '✨' }
  ];

  return (
    <div className="grid grid-cols-6 gap-2 p-3 bg-gradient-to-r from-slate-50 to-white border-b border-gray-200">
      {statItems.map((item, i) => (
        <div key={i} className="text-center">
          <div className="text-lg mb-0.5">{item.icon}</div>
          <div className="text-sm font-bold text-gray-900">{item.value}</div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">{item.label}</div>
        </div>
      ))}
    </div>
  );
};

// ============================================================================
// CHAPTER LIST ITEM
// ============================================================================

interface ChapterItemProps {
  chapter: EnhancedChapter;
  index: number;
  isActive: boolean;
  onSelect: () => void;
  onToggleSelection: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  isDragging: boolean;
  isDragOver: boolean;
}

const ChapterListItem: React.FC<ChapterItemProps> = ({
  chapter,
  index,
  isActive,
  onSelect,
  onToggleSelection,
  onDragStart,
  onDragOver,
  onDrop,
  isDragging,
  isDragOver
}) => {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onSelect}
      className={`
        group relative flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-all border-l-2
        ${isActive 
          ? 'bg-white border-l-indigo-600 shadow-sm' 
          : chapter.isSelected
            ? 'bg-indigo-50 border-l-indigo-300'
            : 'bg-transparent border-l-transparent hover:bg-gray-50 hover:border-l-gray-300'
        }
        ${isDragging ? 'opacity-50 scale-95' : ''}
        ${isDragOver ? 'border-t-2 border-t-indigo-400' : ''}
      `}
    >
      {/* Drag Handle */}
      <div className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">
        <Icons.Drag />
      </div>

      {/* Selection Checkbox */}
      <button
        onClick={onToggleSelection}
        className={`
          w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors
          ${chapter.isSelected 
            ? 'bg-indigo-600 border-indigo-600 text-white' 
            : 'border-gray-300 hover:border-indigo-400'
          }
        `}
      >
        {chapter.isSelected && <Icons.Check />}
      </button>

      {/* Chapter Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-mono text-gray-400">{String(index + 1).padStart(2, '0')}</span>
          <ChapterTypeBadge type={chapter.type} />
          <IssueBadge issues={chapter.issues} />
        </div>
        <div className="font-medium text-gray-900 text-sm truncate">{chapter.title}</div>
        <div className="flex items-center gap-3 text-[10px] text-gray-500 mt-0.5">
          <span>{chapter.wordCount.toLocaleString()} words</span>
          <span>{chapter.paragraphCount} ¶</span>
          <span>{chapter.estimatedReadTime}m read</span>
        </div>
      </div>

      {/* Quality Score */}
      <QualityBadge score={chapter.qualityScore} />
    </div>
  );
};

// ============================================================================
// CHAPTER EDITOR PANEL
// ============================================================================

interface ChapterEditorProps {
  chapter: EnhancedChapter;
  onTitleChange: (title: string) => void;
  onContentChange: (content: string) => void;
  onTypeChange: (type: ChapterType) => void;
  onSplit: (cursorPos: number) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
}

const ChapterEditor: React.FC<ChapterEditorProps> = ({
  chapter,
  onTitleChange,
  onContentChange,
  onTypeChange,
  onSplit,
  textareaRef
}) => {
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);

  const chapterTypes: ChapterType[] = ['prologue', 'chapter', 'interlude', 'part', 'epilogue', 'appendix'];

  const handleSplitAtCursor = () => {
    if (textareaRef.current) {
      onSplit(textareaRef.current.selectionStart);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Editor Toolbar */}
      <div className="h-14 border-b border-gray-100 flex items-center justify-between px-6 bg-gray-50/50 shrink-0">
        <div className="flex items-center gap-4 flex-1">
          {/* Type Selector */}
          <div className="relative">
            <button
              onClick={() => setShowTypeDropdown(!showTypeDropdown)}
              className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm hover:border-gray-300 transition-colors"
            >
              <ChapterTypeBadge type={chapter.type} />
              <Icons.ChevronDown />
            </button>
            {showTypeDropdown && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1 min-w-[140px]">
                {chapterTypes.map(type => (
                  <button
                    key={type}
                    onClick={() => {
                      onTypeChange(type);
                      setShowTypeDropdown(false);
                    }}
                    className={`w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50 flex items-center gap-2 ${type === chapter.type ? 'bg-indigo-50' : ''}`}
                  >
                    <ChapterTypeBadge type={type} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Title Input */}
          <input
            type="text"
            value={chapter.title}
            onChange={(e) => onTitleChange(e.target.value)}
            className="bg-transparent font-serif text-lg font-bold text-gray-800 focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 rounded px-2 py-1 transition-all flex-1 max-w-md"
            placeholder="Chapter Title..."
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Split Button */}
          <button
            onClick={handleSplitAtCursor}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors"
          >
            <Icons.Split /> Split at Cursor
          </button>
        </div>
      </div>

      {/* Issues Panel (if any) */}
      {chapter.issues.length > 0 && (
        <div className="px-6 py-3 bg-amber-50 border-b border-amber-100">
          <div className="flex items-start gap-2">
            <Icons.Warning />
            <div className="flex-1">
              <div className="text-xs font-bold text-amber-800 mb-1">{chapter.issues.length} Issue(s) Detected</div>
              <div className="flex flex-wrap gap-2">
                {chapter.issues.slice(0, 3).map((issue, i) => (
                  <span key={i} className={`text-xs px-2 py-0.5 rounded ${
                    issue.type === 'error' ? 'bg-red-100 text-red-700' :
                    issue.type === 'warning' ? 'bg-amber-100 text-amber-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {issue.message}
                  </span>
                ))}
                {chapter.issues.length > 3 && (
                  <span className="text-xs text-amber-600">+{chapter.issues.length - 3} more</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Content Editor */}
      <div className="flex-1 p-6 overflow-hidden relative">
        <textarea
          ref={textareaRef}
          value={chapter.content}
          onChange={(e) => onContentChange(e.target.value)}
          className="w-full h-full resize-none outline-none border-none text-lg font-serif text-gray-800 leading-relaxed bg-transparent"
          placeholder="Chapter content..."
        />
        <div className="absolute bottom-4 right-6 text-xs text-gray-400 pointer-events-none font-mono">
          {chapter.charCount.toLocaleString()} chars · {chapter.wordCount.toLocaleString()} words · {chapter.paragraphCount} ¶
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// WIZARD STEPS
// ============================================================================

const WizardSteps: React.FC<{ steps: WizardStep[]; currentStep: number }> = ({ steps, currentStep }) => {
  return (
    <div className="flex items-center justify-center gap-0 py-4 bg-white border-b border-gray-100">
      {steps.map((step, index) => (
        <React.Fragment key={step.id}>
          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
            step.isActive 
              ? 'bg-indigo-50 text-indigo-700' 
              : step.isComplete 
                ? 'text-green-600' 
                : 'text-gray-400'
          }`}>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${
              step.isActive 
                ? 'bg-indigo-600 text-white' 
                : step.isComplete 
                  ? 'bg-green-500 text-white' 
                  : 'bg-gray-200 text-gray-500'
            }`}>
              {step.isComplete ? <Icons.Check /> : index + 1}
            </div>
            <div className="hidden sm:block">
              <div className="text-sm font-medium">{step.title}</div>
              <div className="text-[10px] opacity-70">{step.description}</div>
            </div>
          </div>
          {index < steps.length - 1 && (
            <div className={`w-12 h-0.5 ${index < currentStep ? 'bg-green-500' : 'bg-gray-200'}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

// ============================================================================
// MAIN IMPORT WIZARD COMPONENT
// ============================================================================

export const ImportWizard: React.FC<Props> = ({ 
  initialChapters, 
  onConfirm, 
  onCancel,
  onAIEnhance 
}) => {
  // ==================== STATE ====================
  
  // Core Data
  const [chapters, setChapters] = useState<EnhancedChapter[]>(() => {
    const enhanced: EnhancedChapter[] = [];
    initialChapters.forEach((ch, idx) => {
      enhanced.push(enhanceChapter(ch, idx, initialChapters.length, enhanced));
    });
    return enhanced;
  });
  
  // UI State
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Drag & Drop
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  
  // History (Undo/Redo)
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  
  // Refs
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // ==================== COMPUTED VALUES ====================
  
  const selectedChapter = chapters[selectedIndex];
  const selectedChapterIds = useMemo(() => 
    chapters.filter(c => c.isSelected).map(c => c.id), 
    [chapters]
  );
  const hasSelection = selectedChapterIds.length > 0;
  
  const stats = useMemo(() => calculateStats(chapters), [chapters]);
  
  const filteredChapters = useMemo(() => {
    if (!searchQuery.trim()) return chapters;
    const q = searchQuery.toLowerCase();
    return chapters.filter(c => 
      c.title.toLowerCase().includes(q) || 
      c.content.toLowerCase().includes(q)
    );
  }, [chapters, searchQuery]);
  
  const wizardSteps: WizardStep[] = useMemo(() => [
    { 
      id: 'detect', 
      title: 'Detection', 
      description: 'AI parses chapters',
      icon: 'upload',
      isComplete: currentStep > 0,
      isActive: currentStep === 0
    },
    { 
      id: 'structure', 
      title: 'Structure', 
      description: 'Organize & edit',
      icon: 'structure',
      isComplete: currentStep > 1,
      isActive: currentStep === 1
    },
    { 
      id: 'review', 
      title: 'Review', 
      description: 'Final check',
      icon: 'review',
      isComplete: false,
      isActive: currentStep === 2
    }
  ], [currentStep]);

  const canUndo = historyIndex >= 0;
  const canRedo = historyIndex < history.length - 1;

  // ==================== HISTORY MANAGEMENT ====================
  
  const pushHistory = useCallback((description: string) => {
    const entry: HistoryEntry = {
      chapters: JSON.parse(JSON.stringify(chapters)),
      description,
      timestamp: Date.now()
    };
    
    setHistory(prev => {
      // Remove any future history if we branched
      const newHistory = prev.slice(0, historyIndex + 1);
      return [...newHistory, entry].slice(-50); // Keep last 50 entries
    });
    setHistoryIndex(prev => Math.min(prev + 1, 49));
  }, [chapters, historyIndex]);

  const undo = useCallback(() => {
    if (!canUndo) return;
    
    const entry = history[historyIndex];
    setChapters(entry.chapters);
    setHistoryIndex(prev => prev - 1);
  }, [canUndo, history, historyIndex]);

  const redo = useCallback(() => {
    if (!canRedo) return;
    
    const entry = history[historyIndex + 1];
    if (entry) {
      setChapters(entry.chapters);
      setHistoryIndex(prev => prev + 1);
    }
  }, [canRedo, history, historyIndex]);

  // ==================== CHAPTER OPERATIONS ====================
  
  const updateChapter = useCallback((id: string, updates: Partial<EnhancedChapter>) => {
    pushHistory('Update chapter');
    setChapters(prev => {
      const newChapters = prev.map(c => {
        if (c.id !== id) return c;
        
        const updated = { ...c, ...updates };
        
        // Recalculate derived values if content changed
        if (updates.content !== undefined) {
          updated.wordCount = calculateWordCount(updates.content);
          updated.charCount = updates.content.length;
          updated.paragraphCount = calculateParagraphCount(updates.content);
          updated.estimatedReadTime = calculateReadTime(updated.wordCount);
        }
        
        return updated;
      });
      
      // Recalculate issues for all chapters
      return newChapters.map(c => ({
        ...c,
        issues: analyzeChapterIssues(c, newChapters),
        qualityScore: calculateQualityScore(c)
      }));
    });
  }, [pushHistory]);

  const deleteChapters = useCallback((ids: string[]) => {
    if (chapters.length <= 1) {
      alert("Cannot delete the only chapter.");
      return;
    }
    
    if (!confirm(`Delete ${ids.length} chapter(s)?`)) return;
    
    pushHistory(`Delete ${ids.length} chapter(s)`);
    setChapters(prev => {
      const remaining = prev.filter(c => !ids.includes(c.id));
      return remaining;
    });
    setSelectedIndex(prev => Math.min(prev, chapters.length - ids.length - 1));
  }, [chapters.length, pushHistory]);

  const mergeChapters = useCallback((ids: string[]) => {
    if (ids.length < 2) return;
    
    pushHistory(`Merge ${ids.length} chapters`);
    
    setChapters(prev => {
      const toMerge = prev.filter(c => ids.includes(c.id));
      const others = prev.filter(c => !ids.includes(c.id));
      
      // Sort by original order
      toMerge.sort((a, b) => {
        const aIdx = prev.findIndex(c => c.id === a.id);
        const bIdx = prev.findIndex(c => c.id === b.id);
        return aIdx - bIdx;
      });
      
      const mergedContent = toMerge.map(c => c.content).join('\n\n');
      const merged: EnhancedChapter = {
        ...toMerge[0],
        id: generateId(),
        title: toMerge[0].title + ' (Merged)',
        content: mergedContent,
        wordCount: calculateWordCount(mergedContent),
        charCount: mergedContent.length,
        paragraphCount: calculateParagraphCount(mergedContent),
        estimatedReadTime: calculateReadTime(calculateWordCount(mergedContent)),
        isSelected: false,
        issues: []
      };
      
      // Insert at the position of first merged chapter
      const insertIdx = prev.findIndex(c => c.id === toMerge[0].id);
      others.splice(insertIdx, 0, merged);
      
      return others.map(c => ({
        ...c,
        issues: analyzeChapterIssues(c, others),
        qualityScore: calculateQualityScore(c)
      }));
    });
  }, [pushHistory]);

  const splitChapter = useCallback((id: string, cursorPos: number) => {
    const chapter = chapters.find(c => c.id === id);
    if (!chapter || cursorPos <= 0 || cursorPos >= chapter.content.length) {
      alert("Place cursor inside text to split.");
      return;
    }
    
    pushHistory('Split chapter');
    
    setChapters(prev => {
      const idx = prev.findIndex(c => c.id === id);
      if (idx === -1) return prev;
      
      const chapter = prev[idx];
      const firstPart = chapter.content.substring(0, cursorPos).trim();
      const secondPart = chapter.content.substring(cursorPos).trim();
      
      const updatedFirst: EnhancedChapter = {
        ...chapter,
        content: firstPart,
        wordCount: calculateWordCount(firstPart),
        charCount: firstPart.length,
        paragraphCount: calculateParagraphCount(firstPart),
        estimatedReadTime: calculateReadTime(calculateWordCount(firstPart))
      };
      
      const newSecond: EnhancedChapter = {
        ...chapter,
        id: generateId(),
        title: `${chapter.title} (Part 2)`,
        content: secondPart,
        wordCount: calculateWordCount(secondPart),
        charCount: secondPart.length,
        paragraphCount: calculateParagraphCount(secondPart),
        estimatedReadTime: calculateReadTime(calculateWordCount(secondPart)),
        isSelected: false
      };
      
      const newChapters = [...prev];
      newChapters[idx] = updatedFirst;
      newChapters.splice(idx + 1, 0, newSecond);
      
      return newChapters.map(c => ({
        ...c,
        issues: analyzeChapterIssues(c, newChapters),
        qualityScore: calculateQualityScore(c)
      }));
    });
    
    setSelectedIndex(prev => prev + 1);
  }, [chapters, pushHistory]);

  const reorderChapters = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    
    pushHistory('Reorder chapters');
    
    setChapters(prev => {
      const newChapters = [...prev];
      const [moved] = newChapters.splice(fromIndex, 1);
      newChapters.splice(toIndex, 0, moved);
      return newChapters;
    });
    
    setSelectedIndex(toIndex);
  }, [pushHistory]);

  const toggleChapterSelection = useCallback((id: string) => {
    setChapters(prev => prev.map(c => 
      c.id === id ? { ...c, isSelected: !c.isSelected } : c
    ));
  }, []);

  const selectAllChapters = useCallback(() => {
    setChapters(prev => prev.map(c => ({ ...c, isSelected: true })));
  }, []);

  const clearAllSelections = useCallback(() => {
    setChapters(prev => prev.map(c => ({ ...c, isSelected: false })));
  }, []);

  // ==================== AUTO-FIX ====================
  
  const autoFixAll = useCallback(() => {
    pushHistory('Auto-fix all issues');
    
    setChapters(prev => {
      return prev.map((chapter, idx, arr) => {
        let content = chapter.content;
        let title = chapter.title;
        
        // Fix excess whitespace
        content = content.replace(/^\n{3,}/, '\n\n').replace(/\n{3,}$/, '\n\n');
        
        // Fix page artifacts
        content = content.replace(/^\s*\d{1,4}\s*$/gm, '');
        
        // Normalize any remaining runs of 3+ newlines (including those introduced by artifact removal)
        content = content.replace(/\n{3,}/g, '\n\n');
        
        // Fix duplicate title - append number
        const duplicates = arr.filter((c, i) => 
          i !== idx && c.title.toLowerCase() === title.toLowerCase()
        );
        if (duplicates.length > 0) {
          title = `${title} (${idx + 1})`;
        }
        
        return {
          ...chapter,
          content,
          title,
          wordCount: calculateWordCount(content),
          charCount: content.length,
          paragraphCount: calculateParagraphCount(content)
        };
      }).map(c => ({
        ...c,
        issues: analyzeChapterIssues(c, prev),
        qualityScore: calculateQualityScore(c)
      }));
    });
  }, [pushHistory]);

  // ==================== AI ENHANCEMENT ====================
  
  const enhanceWithAI = useCallback(async () => {
    if (!onAIEnhance) return;
    
    setIsProcessing(true);
    try {
      // Enhance each chapter with AI
      const enhanced = await Promise.all(chapters.map(async (chapter) => {
        const result = await onAIEnhance(chapter.content.substring(0, 2000));
        return {
          ...chapter,
          aiSummary: result.summary,
          suggestedTitle: result.suggestedTitle
        };
      }));
      
      pushHistory('AI enhancement');
      setChapters(enhanced);
    } catch (e) {
      console.error('AI enhancement failed:', e);
    } finally {
      setIsProcessing(false);
    }
  }, [chapters, onAIEnhance, pushHistory]);

  // ==================== KEYBOARD SHORTCUTS ====================
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for meta/ctrl key combinations
      const isMeta = e.metaKey || e.ctrlKey;
      
      // Undo: Cmd/Ctrl + Z
      if (isMeta && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      
      // Redo: Cmd/Ctrl + Shift + Z or Cmd/Ctrl + Y
      if (isMeta && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
        e.preventDefault();
        redo();
        return;
      }
      
      // Select All: Cmd/Ctrl + A (when not in textarea)
      if (isMeta && e.key === 'a' && document.activeElement !== textareaRef.current) {
        e.preventDefault();
        selectAllChapters();
        return;
      }
      
      // Search: Cmd/Ctrl + F
      if (isMeta && e.key === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      
      // Merge: Cmd/Ctrl + M
      if (isMeta && e.key === 'm' && hasSelection) {
        e.preventDefault();
        mergeChapters(selectedChapterIds);
        return;
      }
      
      // Delete: Backspace/Delete when not in textarea
      if ((e.key === 'Backspace' || e.key === 'Delete') && 
          document.activeElement !== textareaRef.current &&
          hasSelection) {
        e.preventDefault();
        deleteChapters(selectedChapterIds);
        return;
      }
      
      // Navigation: Arrow keys when not in textarea
      if (document.activeElement !== textareaRef.current) {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex(prev => Math.max(0, prev - 1));
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex(prev => Math.min(chapters.length - 1, prev + 1));
        }
        if (e.key === ' ') {
          e.preventDefault();
          if (selectedChapter) toggleChapterSelection(selectedChapter.id);
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          textareaRef.current?.focus();
        }
      }
      
      // Escape: Clear selection or close modals
      if (e.key === 'Escape') {
        if (showKeyboardShortcuts) {
          setShowKeyboardShortcuts(false);
        } else if (hasSelection) {
          clearAllSelections();
        } else if (document.activeElement === textareaRef.current) {
          textareaRef.current?.blur();
        }
      }
      
      // Show shortcuts: ?
      if (e.key === '?' && !isMeta) {
        setShowKeyboardShortcuts(true);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    undo, redo, selectAllChapters, mergeChapters, deleteChapters, 
    toggleChapterSelection, clearAllSelections, hasSelection, 
    selectedChapterIds, selectedChapter, chapters.length, showKeyboardShortcuts
  ]);

  // ==================== DRAG & DROP HANDLERS ====================
  
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== dropIndex) {
      reorderChapters(draggedIndex, dropIndex);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // ==================== FINAL CONFIRM ====================
  
  const handleConfirm = () => {
    // Convert back to ParsedChapter format
    const output: ParsedChapter[] = chapters.map(c => ({
      title: c.title,
      content: c.content
    }));
    onConfirm(output);
  };

  // ==================== RENDER ====================
  
  return (
    <div className="fixed inset-0 z-50 bg-gray-100 flex flex-col" onDragEnd={handleDragEnd}>
      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal 
        isOpen={showKeyboardShortcuts} 
        onClose={() => setShowKeyboardShortcuts(false)} 
      />

      {/* Header */}
      <header className="bg-white border-b border-gray-200 h-16 flex items-center justify-between px-6 shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-lg">
            📖
          </div>
          <div>
            <h2 className="text-lg font-serif font-bold text-gray-800">Import Wizard</h2>
            <p className="text-xs text-gray-500">
              {chapters.length} chapters detected · {stats.totalWords.toLocaleString()} words
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Undo/Redo */}
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={undo}
              disabled={!canUndo}
              className="p-2 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed text-gray-600"
              title="Undo (⌘Z)"
            >
              <Icons.Undo />
            </button>
            <div className="w-px h-6 bg-gray-200" />
            <button
              onClick={redo}
              disabled={!canRedo}
              className="p-2 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed text-gray-600"
              title="Redo (⌘⇧Z)"
            >
              <Icons.Redo />
            </button>
          </div>

          {/* Keyboard Shortcuts */}
          <button
            onClick={() => setShowKeyboardShortcuts(true)}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title="Keyboard Shortcuts (?)"
          >
            <Icons.Keyboard />
          </button>

          <div className="w-px h-8 bg-gray-200" />

          <button
            onClick={onCancel}
            className="text-sm font-medium text-gray-500 hover:text-gray-800 px-4 py-2"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={chapters.length === 0}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg text-sm font-semibold shadow-md transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            <Icons.Check />
            Finish Import
          </button>
        </div>
      </header>

      {/* Wizard Steps */}
      <WizardSteps steps={wizardSteps} currentStep={currentStep} />

      {/* Stats Dashboard */}
      <StatsDashboard stats={stats} />

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Chapter List */}
        <aside className="w-80 bg-white border-r border-gray-200 flex flex-col shrink-0">
          {/* Search & Actions */}
          <div className="p-3 border-b border-gray-100 space-y-2">
            {/* Search */}
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <Icons.Search />
              </div>
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search chapters... (⌘F)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            {/* Batch Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={selectAllChapters}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded hover:bg-gray-100 transition-colors"
                title="Select All (⌘A)"
              >
                <Icons.SelectAll /> Select All
              </button>
              {hasSelection && (
                <>
                  <button
                    onClick={() => mergeChapters(selectedChapterIds)}
                    disabled={selectedChapterIds.length < 2}
                    className="flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded hover:bg-indigo-100 transition-colors disabled:opacity-50"
                    title="Merge Selected (⌘M)"
                  >
                    <Icons.Merge /> Merge
                  </button>
                  <button
                    onClick={() => deleteChapters(selectedChapterIds)}
                    className="flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded hover:bg-red-100 transition-colors"
                    title="Delete Selected (⌫)"
                  >
                    <Icons.Trash />
                  </button>
                </>
              )}
            </div>

            {/* Auto-Fix & AI */}
            {stats.autoFixableIssues > 0 && (
              <button
                onClick={autoFixAll}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
              >
                <Icons.Fix /> Auto-Fix {stats.autoFixableIssues} Issues
              </button>
            )}

            {onAIEnhance && (
              <button
                onClick={enhanceWithAI}
                disabled={isProcessing}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors disabled:opacity-50"
              >
                <Icons.Sparkles /> {isProcessing ? 'Processing...' : 'Enhance with AI'}
              </button>
            )}
          </div>

          {/* Chapter List */}
          <div className="flex-1 overflow-y-auto">
            {filteredChapters.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <p className="text-sm">No chapters found</p>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="mt-2 text-xs text-indigo-600 hover:underline"
                  >
                    Clear search
                  </button>
                )}
              </div>
            ) : (
              filteredChapters.map((chapter, index) => {
                const originalIndex = chapters.findIndex(c => c.id === chapter.id);
                return (
                  <ChapterListItem
                    key={chapter.id}
                    chapter={chapter}
                    index={originalIndex}
                    isActive={originalIndex === selectedIndex}
                    onSelect={() => setSelectedIndex(originalIndex)}
                    onToggleSelection={(e) => {
                      e.stopPropagation();
                      toggleChapterSelection(chapter.id);
                    }}
                    onDragStart={(e) => handleDragStart(e, originalIndex)}
                    onDragOver={(e) => handleDragOver(e, originalIndex)}
                    onDrop={(e) => handleDrop(e, originalIndex)}
                    isDragging={draggedIndex === originalIndex}
                    isDragOver={dragOverIndex === originalIndex}
                  />
                );
              })
            )}
          </div>

          {/* Selection Info */}
          {hasSelection && (
            <div className="p-3 bg-indigo-50 border-t border-indigo-100 text-xs text-indigo-700">
              <div className="flex items-center justify-between">
                <span className="font-medium">{selectedChapterIds.length} selected</span>
                <button onClick={clearAllSelections} className="hover:underline">Clear</button>
              </div>
            </div>
          )}
        </aside>

        {/* Main Editor */}
        <main className="flex-1 flex flex-col min-w-0">
          {selectedChapter ? (
            <ChapterEditor
              chapter={selectedChapter}
              onTitleChange={(title) => updateChapter(selectedChapter.id, { title })}
              onContentChange={(content) => updateChapter(selectedChapter.id, { content })}
              onTypeChange={(type) => updateChapter(selectedChapter.id, { type })}
              onSplit={(cursorPos) => splitChapter(selectedChapter.id, cursorPos)}
              textareaRef={textareaRef}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <p>Select a chapter to edit</p>
            </div>
          )}
        </main>

        {/* Right Panel - AI Summary & Details */}
        {selectedChapter && (
          <aside className="w-72 bg-gray-50 border-l border-gray-200 flex flex-col shrink-0 overflow-y-auto">
            <div className="p-4 space-y-4">
              {/* Chapter Stats */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Chapter Stats</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-lg font-bold text-gray-900">{selectedChapter.wordCount.toLocaleString()}</div>
                    <div className="text-[10px] text-gray-500 uppercase">Words</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-gray-900">{selectedChapter.paragraphCount}</div>
                    <div className="text-[10px] text-gray-500 uppercase">Paragraphs</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-gray-900">{selectedChapter.estimatedReadTime}m</div>
                    <div className="text-[10px] text-gray-500 uppercase">Read Time</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-gray-900">{selectedChapter.charCount.toLocaleString()}</div>
                    <div className="text-[10px] text-gray-500 uppercase">Characters</div>
                  </div>
                </div>
              </div>

              {/* Quality Score */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Quality Score</h4>
                <div className="flex items-center gap-3">
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold ${
                    selectedChapter.qualityScore >= 80 ? 'bg-green-100 text-green-700' :
                    selectedChapter.qualityScore >= 60 ? 'bg-yellow-100 text-yellow-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {selectedChapter.qualityScore}
                  </div>
                  <div className="flex-1">
                    <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full ${
                          selectedChapter.qualityScore >= 80 ? 'bg-green-500' :
                          selectedChapter.qualityScore >= 60 ? 'bg-yellow-500' :
                          'bg-red-500'
                        }`} 
                        style={{ width: `${selectedChapter.qualityScore}%` }} 
                      />
                    </div>
                    <p className="text-[10px] text-gray-500 mt-1">
                      {selectedChapter.qualityScore >= 80 ? 'Excellent' :
                       selectedChapter.qualityScore >= 60 ? 'Good' :
                       selectedChapter.qualityScore >= 40 ? 'Needs Work' : 'Poor'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Issues */}
              {selectedChapter.issues.length > 0 && (
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                    Issues ({selectedChapter.issues.length})
                  </h4>
                  <div className="space-y-2">
                    {selectedChapter.issues.map((issue, i) => (
                      <div key={i} className={`text-xs p-2 rounded ${
                        issue.type === 'error' ? 'bg-red-50 text-red-700' :
                        issue.type === 'warning' ? 'bg-amber-50 text-amber-700' :
                        'bg-blue-50 text-blue-700'
                      }`}>
                        <div className="flex items-start gap-2">
                          {issue.type === 'error' && <Icons.Error />}
                          {issue.type === 'warning' && <Icons.Warning />}
                          {issue.type === 'suggestion' && <Icons.Suggestion />}
                          <span>{issue.message}</span>
                        </div>
                        {issue.autoFixable && (
                          <div className="mt-1 text-[10px] opacity-70">Auto-fixable</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* AI Summary */}
              {selectedChapter.aiSummary && (
                <div className="bg-white rounded-lg border border-purple-200 p-4">
                  <h4 className="text-xs font-bold text-purple-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <Icons.Sparkles /> AI Summary
                  </h4>
                  <p className="text-sm text-gray-700 leading-relaxed">{selectedChapter.aiSummary}</p>
                  {selectedChapter.suggestedTitle && selectedChapter.suggestedTitle !== selectedChapter.title && (
                    <div className="mt-3 pt-3 border-t border-purple-100">
                      <p className="text-[10px] text-purple-600 uppercase font-bold mb-1">Suggested Title</p>
                      <button
                        onClick={() => updateChapter(selectedChapter.id, { title: selectedChapter.suggestedTitle! })}
                        className="text-sm text-purple-700 hover:text-purple-900 hover:underline"
                      >
                        {selectedChapter.suggestedTitle}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Preview */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Preview</h4>
                <p className="text-xs text-gray-600 leading-relaxed line-clamp-6">
                  {selectedChapter.content.substring(0, 300)}
                  {selectedChapter.content.length > 300 && '...'}
                </p>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Processing Overlay */}
      {isProcessing && (
        <div className="fixed inset-0 z-[70] bg-white/80 backdrop-blur-sm flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-indigo-700 font-medium animate-pulse">Enhancing with AI...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImportWizard;