import { useState, useRef, useCallback } from 'react';
import { analyzeDraft } from '@/services/gemini/analysis';
import { AnalysisResult, AnalysisWarning } from '@/types';
import { Lore, ManuscriptIndex } from '@/types/schema';
import { useUsage } from '../context/UsageContext';
import { ModelConfig } from '@/config/models';
import { useMagicEditor } from '@/features/editor';
import { isMemoryTool, executeMemoryTool } from '@/services/gemini/memoryToolHandlers';
import { emitAnalysisCompleted } from '@/services/appBrain';

// Define proper types
interface ProjectContext {
  id: string;
  setting?: {
    timePeriod: string;
    location: string;
  };
  manuscriptIndex?: ManuscriptIndex;
}

interface SelectionRange {
  start: number;
  end: number;
  text: string;
}

type AgentAction = 
  | { action: 'update_manuscript'; params: { search_text: string; replacement_text: string; description?: string } }
  | { action: 'append_to_manuscript'; params: { text_to_add: string; description?: string } }
  | { action: 'undo_last_change'; params?: undefined };

interface UseQuillAIEngineProps {
  // Use refs for values that need to be current in async operations
  getCurrentText: () => string;
  currentProject: ProjectContext | null;
  activeChapterId: string | null;
  updateChapterAnalysis: (id: string, result: AnalysisResult) => Promise<void>;
  updateProjectLore: (projectId: string, lore: Lore) => Promise<void>;
  commit: (text: string, desc: string, author: 'User' | 'Agent') => void;
  selectionRange: SelectionRange | null;
  clearSelection: () => void;
}

export interface PendingDiff {
  original: string;
  modified: string;
  description: string;
  author: 'User' | 'Agent';
}

const calculateTextReplacement = (
  originalText: string, 
  searchText: string, 
  replacementText: string
): string => {
  const occurrences = originalText.split(searchText).length - 1;
  if (occurrences === 0) {
    throw new Error("Could not find the exact text to replace. Please be more specific.");
  }
  if (occurrences > 1) {
    throw new Error(`Found ${occurrences} matches for that text. Please provide more context.`);
  }
  return originalText.replace(searchText, replacementText);
};

export function useQuillAIEngine({
  getCurrentText,
  currentProject,
  activeChapterId,
  updateChapterAnalysis,
  updateProjectLore,
  commit,
  selectionRange,
  clearSelection
}: UseQuillAIEngineProps) {
  
  const { trackUsage } = useUsage();

  // Stable ref for project setting
  const projectSetting = currentProject?.setting;
  const projectId = currentProject?.id;
  const manuscriptIndex = currentProject?.manuscriptIndex;

  // Analysis State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisWarning, setAnalysisWarning] = useState<AnalysisWarning | null>(null);
  const analysisAbortRef = useRef<AbortController | null>(null);

  // Magic Editor (delegated to useMagicEditor hook)
  const { state: magicState, actions: magicActions } = useMagicEditor({
    selectionRange,
    clearSelection,
    getCurrentText,
    commit,
    projectSetting
  });

  // Review Mode State
  const [pendingDiff, setPendingDiff] = useState<PendingDiff | null>(null);

  // --- 1. Analysis Logic ---
  const performAnalysis = useCallback(async (
    text: string,
    scope: 'full' | 'selection' = 'full'
  ) => {
    const chapterId = activeChapterId;

    if (!text.trim() || !chapterId) return;

    analysisAbortRef.current?.abort();
    analysisAbortRef.current = new AbortController();
    const signal = analysisAbortRef.current.signal;

    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisWarning(null);

    try {
      const { result, usage, warning } = await analyzeDraft(text, projectSetting, manuscriptIndex, signal);
      trackUsage(usage, ModelConfig.analysis);

      if (signal.aborted) return;

      const combinedWarning: AnalysisWarning | null = (() => {
        if (scope === 'selection') {
          if (warning) {
            return { ...warning, message: `Selection-only analysis: ${warning.message}` };
          }
          return { message: 'Analysis ran on the selected text to avoid token limits.', originalLength: text.length };
        }
        return warning || null;
      })();

      setAnalysisWarning(combinedWarning);

      if (chapterId !== activeChapterId) {
        console.warn('Chapter changed during analysis, discarding result');
        return;
      }

      const resultWithWarning: AnalysisResult = { ...result, warning: combinedWarning };

      await updateChapterAnalysis(chapterId, resultWithWarning);
      emitAnalysisCompleted(chapterId, 'success');

      if (projectId) {
        const worldRules = result.settingAnalysis?.issues.map(i => `Avoid ${i.issue}: ${i.suggestion}`) || [];
        const lore: Lore = {
          characters: result.characters,
          worldRules: worldRules
        };
        await updateProjectLore(projectId, lore);
      }

    } catch (e) {
      if (signal.aborted) return;
      const message = e instanceof Error ? e.message : 'Analysis failed';
      setAnalysisError(message);
      setAnalysisWarning(null);
      console.error("Analysis failed", e);
      emitAnalysisCompleted(chapterId || 'analysis', 'error', message);
    } finally {
      if (!signal.aborted) {
        setIsAnalyzing(false);
      }
    }
  }, [activeChapterId, manuscriptIndex, projectId, projectSetting, trackUsage, updateChapterAnalysis, updateProjectLore]);

  const runAnalysis = useCallback(async () => {
    await performAnalysis(getCurrentText(), 'full');
  }, [getCurrentText, performAnalysis]);

  const runSelectionAnalysis = useCallback(async () => {
    if (!selectionRange?.text?.trim()) {
      setAnalysisWarning({ message: 'Select some text to analyze a smaller section.' });
      return;
    }

    await performAnalysis(selectionRange.text, 'selection');
  }, [performAnalysis, selectionRange]);

  const cancelAnalysis = useCallback(() => {
    analysisAbortRef.current?.abort();
    setIsAnalyzing(false);
  }, []);

  // --- 2. Agent Logic ---
  
  const acceptDiff = useCallback(() => {
    if (pendingDiff) {
        commit(pendingDiff.modified, pendingDiff.description, pendingDiff.author);
        setPendingDiff(null);
    }
  }, [pendingDiff, commit]);

  const rejectDiff = useCallback(() => {
    setPendingDiff(null);
  }, []);

  const handleAgentAction = useCallback(async (
    action: AgentAction['action'] | string, 
    params: AgentAction['params'] | Record<string, unknown>
  ): Promise<string> => {
    // Check if this is a memory tool first
    if (isMemoryTool(action)) {
      if (!projectId) {
        return 'Error: No project loaded. Memory tools require an active project.';
      }
      const result = await executeMemoryTool(
        action, 
        params as Record<string, unknown>, 
        { projectId }
      );
      return result ?? 'Error: Unknown memory tool';
    }

    // Get fresh text for agent operations
    const currentText = getCurrentText();
    
    if (action === 'update_manuscript') {
      const { search_text, replacement_text, description } = params as Extract<AgentAction, { action: 'update_manuscript' }>['params'];
      try {
        const newText = calculateTextReplacement(currentText, search_text, replacement_text);
        
        // Instead of committing, set pending state for review
        setPendingDiff({
          original: currentText,
          modified: newText,
          description: description || "Agent Edit",
          author: 'Agent'
        });
        
        return "Edit proposed. Waiting for user review.";
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        throw new Error(message);
      }
    }

    if (action === 'append_to_manuscript') {
      const { text_to_add, description } = params as Extract<AgentAction, { action: 'append_to_manuscript' }>['params'];
      
      // Smart newline handling
      const separator = currentText.length === 0 
        ? '' 
        : currentText.endsWith('\n') 
          ? '' 
          : '\n';
      
      const newText = currentText + separator + text_to_add;
      
      // Instead of committing, set pending state for review
      setPendingDiff({
          original: currentText,
          modified: newText,
          description: description || "Agent Append",
          author: 'Agent'
      });
      
      return "Edit proposed. Waiting for user review.";
    }

    if (action === 'undo_last_change') {
      return "Use the interface undo button for now.";
    }

    return "Unknown action.";
  }, [getCurrentText, projectId]);

  return {
    state: {
      isAnalyzing,
      analysisError,
      ...magicState,
      pendingDiff,
      analysisWarning,
    },
    actions: {
      runAnalysis,
      runSelectionAnalysis,
      cancelAnalysis,
      ...magicActions,
      handleAgentAction,
      acceptDiff,
      rejectDiff
    }
  };
}
