import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEngine, findQuoteRange, useManuscriptIntelligence } from '@/features/shared';
import { useEditorState, useEditorActions } from '@/features/core/context/EditorContext';
import { useProjectStore } from '@/features/project';
import { RichTextEditor } from './RichTextEditor';
import { MagicBar } from './MagicBar';
import { FindReplaceModal } from './FindReplaceModal';
import { VisualDiff } from './VisualDiff';
import { AnalysisResult } from '@/types';
import { CommentCard } from './CommentCard';
import { InlineComment } from '@/types/schema';
import { useLayoutStore } from '@/features/layout/store/useLayoutStore';

/**
 * EditorWorkspace
 * 
 * Main editor surface that consumes all data from contexts directly.
 * No props required - eliminates prop drilling from parent layouts.
 */

const Icons = {
  Wand: () => (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14.5 2.5l5 5" />
      <path d="M2.5 19.5l9.5-9.5" />
      <path d="M7 6l1 1" />
      <path d="M14 4l.5.5" />
      <path d="M17 7l-.5.5" />
      <path d="M4 9l.5.5" />
    </svg>
  ),
  Close: () => (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
};

interface WorkspaceHeaderProps {
  isZenMode: boolean;
  isHeaderHovered: boolean;
  onHeaderHoverChange: (hovered: boolean) => void;
  activeChapterTitle?: string;
  projectSetting?: { timePeriod: string; location: string } | null;
  instantWordCount: number;
  isIntelligenceProcessing: boolean;
  isAnalyzing: boolean;
  onRunAnalysis: () => void;
}

const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = React.memo(({
  isZenMode,
  onHeaderHoverChange,
  activeChapterTitle,
  projectSetting,
  instantWordCount,
  isIntelligenceProcessing,
  isAnalyzing,
  onRunAnalysis,
}) => (
  <motion.header
    initial={isZenMode ? { y: -60, opacity: 0 } : false}
    animate={{ y: 0, opacity: 1 }}
    exit={{ y: -60, opacity: 0 }}
    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    className={`h-14 border-b border-[var(--ink-100)] flex items-center justify-between px-6 bg-[var(--parchment-50)] shrink-0 w-full ${
      isZenMode ? 'fixed top-0 left-0 right-0 z-50' : ''
    }`}
    onMouseEnter={() => isZenMode && onHeaderHoverChange(true)}
    onMouseLeave={() => onHeaderHoverChange(false)}
  >
    <div className="flex items-center gap-3">
      <h2 className="font-serif font-medium text-[var(--text-lg)] text-[var(--ink-900)]">
        {activeChapterTitle || 'No Active Chapter'}
      </h2>
      {projectSetting && (
        <span className="text-[var(--text-xs)] px-2 py-0.5 rounded bg-[var(--magic-100)] text-[var(--magic-500)] font-medium">
          {projectSetting.timePeriod} 
          {" "}
          •
          {" "}
          {projectSetting.location}
        </span>
      )}
    </div>

    <div className="flex items-center gap-4">
      <span className="text-[var(--text-sm)] text-[var(--ink-400)] font-medium">
        {instantWordCount}
        {" "}
        words
      </span>
      {isIntelligenceProcessing && (
        <span className="text-[var(--text-xs)] text-[var(--magic-500)]">
          analyzing...
        </span>
      )}
      <button
        onClick={onRunAnalysis}
        disabled={isAnalyzing}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--ink-900)] text-[var(--parchment-50)] text-[var(--text-sm)] font-medium hover:bg-[var(--ink-800)] disabled:opacity-70 transition-colors shadow-sm"
      >
        {isAnalyzing ? (
          <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : (
          <Icons.Wand />
        )}
        Deep Analysis
      </button>
    </div>
  </motion.header>
));

const MemoFindReplaceModal = React.memo(
  FindReplaceModal,
  (prev, next) => {
    if (!prev.isOpen && !next.isOpen) {
      return true;
    }
    return false;
  }
);

export const EditorWorkspace: React.FC = () => {
  // Consume editor state and actions from split contexts
  const {
    currentText,
    selectionRange,
    selectionPos,
    activeHighlight,
    editor,
    isZenMode,
    visibleComments,
  } = useEditorState();

  const {
    updateText,
    setSelectionState,
    setEditor,
    clearSelection,
    toggleZenMode,
    dismissComment,
  } = useEditorActions();

  const { getActiveChapter, currentProject } = useProjectStore((state) => ({
    getActiveChapter: state.getActiveChapter,
    currentProject: state.currentProject,
  }));
  const { state: engineState, actions: engineActions } = useEngine();
  const handleFixRequest = useLayoutStore((state) => state.handleFixRequest);

  const activeChapter = getActiveChapter();

  // Intelligence layer - provides deterministic context to AI
  const {
    intelligence,
    hud,
    instantMetrics,
    isProcessing: isIntelligenceProcessing,
    updateText: updateIntelligenceText,
    updateCursor,
  } = useManuscriptIntelligence({
    chapterId: activeChapter?.id || 'default',
    initialText: currentText,
  });

  // Sync text changes to intelligence layer
  const handleTextUpdate = useCallback((newText: string) => {
    updateText(newText);
    updateIntelligenceText(newText, 0); // Cursor offset updated separately
  }, [updateText, updateIntelligenceText]);

  const [isFindReplaceOpen, setIsFindReplaceOpen] = useState(false);
  const [isHeaderHovered, setIsHeaderHovered] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setIsFindReplaceOpen(true);
      }
      // Ctrl/Cmd + Shift + Z to toggle Zen Mode
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "z") {
        e.preventDefault();
        toggleZenMode();
      }
      // Escape to exit Zen Mode
      if (e.key === "Escape" && isZenMode) {
        e.preventDefault();
        toggleZenMode();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleZenMode, isZenMode]);

  const analysisHighlights = useMemo(() => {
    const highlights: Array<{
      start: number;
      end: number;
      color: string;
      title: string;
    }> = [];
    
    // Use intelligence heatmap hotspots for highlighting
    if (hud.prioritizedIssues.length > 0) {
      hud.prioritizedIssues.forEach((issue) => {
        const color = issue.severity > 0.7 
          ? "var(--error-500)" 
          : issue.severity > 0.4 
            ? "var(--warning-500)" 
            : "var(--magic-500)";
        highlights.push({
          start: issue.offset,
          end: issue.offset + 100, // Approximate range
          color,
          title: issue.description,
        });
      });
    }
    
    // Fallback to legacy analysis if available and no intelligence highlights
    const analysis: AnalysisResult = activeChapter?.lastAnalysis;
    if (highlights.length === 0 && analysis) {
      analysis.plotIssues?.forEach((issue) => {
        if (issue.quote) {
          const range = findQuoteRange(currentText, issue.quote);
          if (range)
            highlights.push({
              ...range,
              color: "var(--error-500)",
              title: issue.issue,
            });
        }
      });
      analysis.pacing?.slowSections?.forEach((section) => {
        const range = findQuoteRange(currentText, section);
        if (range)
          highlights.push({
            ...range,
            color: "var(--warning-500)",
            title: "Slow Pacing",
          });
      });
      analysis.settingAnalysis?.issues?.forEach((issue) => {
        const range = findQuoteRange(currentText, issue.quote);
        if (range)
          highlights.push({
            ...range,
            color: "var(--magic-500)",
            title: issue.issue,
          });
      });
    }

    if (engineState.grammarHighlights.length > 0) {
      highlights.push(...engineState.grammarHighlights.map(h => ({
        start: h.start,
        end: h.end,
        color: h.color,
        title: h.title || 'Grammar',
      })));
    }
    return highlights;
  }, [hud.prioritizedIssues, activeChapter, currentText, engineState.grammarHighlights]);

  const [activeComment, setActiveComment] = useState<
    (InlineComment & { position: { top: number; left: number } }) | null
  >(null);

  const handleCommentClick = (
    comment: InlineComment,
    position: { top: number; left: number }
  ) => {
    setActiveComment({ ...comment, position });
  };

  const handleCloseComment = () => {
    setActiveComment(null);
  };

  const handleFixWithAgent = useCallback(
    (issue: string, suggestion: string, quote?: string) => {
      setActiveComment(null);
      const context = quote ? `${issue} — "${quote}"` : issue;
      handleFixRequest(context, suggestion);
    },
    [handleFixRequest]
  );

  const handleDismissComment = (commentId: string) => {
    setActiveComment(null);
    dismissComment(commentId);
  };

  return (
    <div
      className={`flex-1 flex flex-col min-w-0 bg-[var(--parchment-200)] relative transition-all duration-500 ${
        isZenMode ? "items-center" : ""
      }`}
    >
      {/* Header - Auto-hide in Zen Mode */}
      <AnimatePresence>
        {(!isZenMode || isHeaderHovered) && (
          <WorkspaceHeader
            isZenMode={isZenMode}
            isHeaderHovered={isHeaderHovered}
            onHeaderHoverChange={setIsHeaderHovered}
            activeChapterTitle={activeChapter?.title}
            projectSetting={currentProject?.setting || null}
            instantWordCount={instantMetrics.wordCount}
            isIntelligenceProcessing={isIntelligenceProcessing}
            isAnalyzing={engineState.isAnalyzing}
            onRunAnalysis={engineActions.runAnalysis}
          />
        )}
      </AnimatePresence>

      {/* Invisible hover zone at top for Zen Mode header */}
      {isZenMode && (
        <div
          className="fixed top-0 left-0 right-0 h-8 z-40"
          onMouseEnter={() => setIsHeaderHovered(true)}
        />
      )}

      <div
        className={`flex-1 overflow-y-auto p-8 relative transition-all duration-500 w-full ${
          isZenMode ? "pt-12" : ""
        }`}
        onClick={clearSelection}
      >
        <div
          className={`mx-auto min-h-[calc(100vh-10rem)] relative transition-all duration-500 ${
            isZenMode ? "max-w-4xl" : "max-w-3xl"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <MemoFindReplaceModal
            isOpen={isFindReplaceOpen}
            onClose={() => setIsFindReplaceOpen(false)}
            currentText={currentText}
            onTextChange={updateText}
            editor={editor}
          />

          <RichTextEditor
            key={activeChapter?.id || "editor"}
            content={currentText}
            onUpdate={handleTextUpdate}
            onSelectionChange={setSelectionState}
            setEditorRef={setEditor}
            activeHighlight={activeHighlight}
            analysisHighlights={analysisHighlights}
            inlineComments={visibleComments}
            onDismissComment={dismissComment}
            isZenMode={isZenMode}
            onCommentClick={handleCommentClick}
          />

          {selectionRange && selectionPos && (
            <MagicBar
              isLoading={engineState.isMagicLoading}
              variations={engineState.magicVariations}
              helpResult={engineState.magicHelpResult || undefined}
              helpType={engineState.magicHelpType}
              activeMode={engineState.activeMagicMode}
              grammarSuggestions={engineState.grammarSuggestions}
              onRewrite={engineActions.handleRewrite}
              onHelp={engineActions.handleHelp}
              onApply={engineActions.applyVariation}
              onGrammarCheck={engineActions.handleGrammarCheck}
              onApplyGrammar={engineActions.applyGrammarSuggestion}
              onApplyAllGrammar={engineActions.applyAllGrammarSuggestions}
              onDismissGrammar={engineActions.dismissGrammarSuggestion}
              onClose={engineActions.closeMagicBar}
              position={selectionPos}
            />
          )}
        </div>
      </div>

      {/* Diff Modal */}
      {engineState.pendingDiff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink-900)]/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[80vh] flex flex-col overflow-hidden animate-scale-in">
            <div className="p-4 border-b border-[var(--ink-100)] flex justify-between items-center bg-[var(--parchment-50)]">
              <h3 className="font-serif font-bold text-[var(--ink-800)]">
                Review Agent Suggestions
              </h3>
              <button
                onClick={engineActions.rejectDiff}
                className="text-[var(--ink-400)] hover:text-[var(--ink-600)]"
              >
                <Icons.Close />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 bg-white">
              <VisualDiff
                original={engineState.pendingDiff.original}
                modified={engineState.pendingDiff.modified}
              />
            </div>
            <div className="p-4 border-t border-[var(--ink-100)] bg-[var(--parchment-50)] flex justify-end gap-3">
              <button
                onClick={engineActions.rejectDiff}
                className="px-4 py-2 rounded-lg border border-[var(--ink-200)] text-[var(--ink-600)] hover:bg-[var(--parchment-100)]"
              >
                Reject
              </button>
              <button
                onClick={engineActions.acceptDiff}
                className="px-4 py-2 rounded-lg bg-[var(--ink-900)] text-[var(--parchment-50)] hover:bg-[var(--ink-800)]"
              >
                Accept
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Comment Card */}
      {activeComment && (
        <CommentCard
          comment={{
            commentId: activeComment.id,
            type: activeComment.type,
            issue: activeComment.issue,
            suggestion: activeComment.suggestion,
            severity: activeComment.severity,
            quote: activeComment.quote,
          }}
          position={activeComment.position}
          onClose={handleCloseComment}
          onFixWithAgent={handleFixWithAgent}
          onDismiss={handleDismissComment}
        />
      )}
    </div>
  );
};
