import { useState, useRef, useCallback } from 'react';
import { rewriteText, getContextualHelp } from '@/services/gemini/agent';
import { fetchGrammarSuggestions } from '@/services/gemini/grammar';
import { useUsage } from '@/features/shared';
import { ModelConfig } from '@/config/models';
import { GrammarSuggestion } from '@/types';
import { HighlightItem } from './useTiptapSync';

interface SelectionRange {
  start: number;
  end: number;
  text: string;
}

interface ProjectSetting {
  timePeriod: string;
  location: string;
}

interface UseMagicEditorProps {
  selectionRange: SelectionRange | null;
  clearSelection: () => void;
  getCurrentText: () => string;
  commit: (text: string, desc: string, author: 'User' | 'Agent') => void;
  projectSetting?: ProjectSetting;
}

export function useMagicEditor({
  selectionRange,
  clearSelection,
  getCurrentText,
  commit,
  projectSetting
}: UseMagicEditorProps) {
  const { trackUsage } = useUsage();

  // Magic Editor State
  const [magicVariations, setMagicVariations] = useState<string[]>([]);
  const [activeMagicMode, setActiveMagicMode] = useState<string | null>(null);
  const [magicHelpResult, setMagicHelpResult] = useState<string | null>(null);
  const [magicHelpType, setMagicHelpType] = useState<'Explain' | 'Thesaurus' | null>(null);
  const [isMagicLoading, setIsMagicLoading] = useState(false);
  const [magicError, setMagicError] = useState<string | null>(null);
  const magicAbortRef = useRef<AbortController | null>(null);

  const [grammarSuggestions, setGrammarSuggestions] = useState<GrammarSuggestion[]>([]);
  const [grammarHighlights, setGrammarHighlights] = useState<HighlightItem[]>([]);

  // Capture selection at operation start to detect staleness
  const operationSelectionRef = useRef<SelectionRange | null>(null);

  const abortMagicOperation = useCallback(() => {
    magicAbortRef.current?.abort();
    magicAbortRef.current = null;
  }, []);

  const resetMagicState = useCallback(() => {
    setMagicVariations([]);
    setActiveMagicMode(null);
    setMagicHelpResult(null);
    setMagicHelpType(null);
    setMagicError(null);
    setGrammarSuggestions([]);
    setGrammarHighlights([]);
  }, []);

  const handleRewrite = useCallback(async (mode: string, tone?: string) => {
    if (!selectionRange || !selectionRange.text.trim()) return;
    
    abortMagicOperation();
    magicAbortRef.current = new AbortController();
    const signal = magicAbortRef.current.signal;
    
    // Capture selection state at start
    operationSelectionRef.current = { ...selectionRange };
    
    resetMagicState();
    setActiveMagicMode(mode === 'Tone Tuner' && tone ? `Tone: ${tone}` : mode);
    setIsMagicLoading(true);

    try {
      const { result: variations, usage } = await rewriteText(
        selectionRange.text, 
        mode, 
        tone, 
        projectSetting,
        signal
      );
      trackUsage(usage, ModelConfig.agent);
      
      if (signal.aborted) return;
      
      setMagicVariations(variations);
    } catch (e) {
      if (signal.aborted) return;
      const message = e instanceof Error ? e.message : 'Rewrite failed';
      setMagicError(message);
      console.error(e);
    } finally {
      if (!signal.aborted) {
        setIsMagicLoading(false);
      }
    }
  }, [selectionRange, projectSetting, abortMagicOperation, resetMagicState, trackUsage]);

  const handleHelp = useCallback(async (type: 'Explain' | 'Thesaurus') => {
    if (!selectionRange || !selectionRange.text.trim()) return;
    
    abortMagicOperation();
    magicAbortRef.current = new AbortController();
    const signal = magicAbortRef.current.signal;
    
    operationSelectionRef.current = { ...selectionRange };
    
    resetMagicState();
    setMagicHelpType(type);
    setIsMagicLoading(true);

    try {
      const { result, usage } = await getContextualHelp(selectionRange.text, type, signal);
      trackUsage(usage, ModelConfig.agent);
      
      if (signal.aborted) return;
      
      setMagicHelpResult(result);
    } catch (e) {
      if (signal.aborted) return;
      const message = e instanceof Error ? e.message : 'Help request failed';
      setMagicError(message);
      console.error(e);
    } finally {
      if (!signal.aborted) {
        setIsMagicLoading(false);
      }
    }
  }, [selectionRange, abortMagicOperation, resetMagicState, trackUsage]);

  const handleGrammarCheck = useCallback(async () => {
    if (!selectionRange || !selectionRange.text.trim()) return;

    abortMagicOperation();
    magicAbortRef.current = new AbortController();
    const signal = magicAbortRef.current.signal;

    operationSelectionRef.current = { ...selectionRange };

    resetMagicState();
    setActiveMagicMode('Grammar Fixes');
    setIsMagicLoading(true);

    try {
      const { suggestions, usage } = await fetchGrammarSuggestions(selectionRange.text, signal);
      if (usage) {
        trackUsage(usage, ModelConfig.analysis);
      }

      if (signal.aborted) return;

      const offset = selectionRange.start;
      const normalized = suggestions.map(s => ({
        ...s,
        start: s.start + offset,
        end: s.end + offset,
        originalText: s.originalText ?? selectionRange.text.slice(s.start, s.end),
      }));

      setGrammarSuggestions(normalized);
      setGrammarHighlights(
        normalized.map(s => ({
          start: s.start,
          end: s.end,
          color: 'var(--error-500)',
          title: s.message,
          severity: s.severity === 'style' ? 'warning' : 'error',
        }))
      );
    } catch (e) {
      if (signal.aborted) return;
      const message = e instanceof Error ? e.message : 'Grammar check failed';
      setMagicError(message);
      console.error(e);
    } finally {
      if (!signal.aborted) {
        setIsMagicLoading(false);
      }
    }
  }, [selectionRange, abortMagicOperation, resetMagicState, trackUsage]);

  const dismissGrammarSuggestion = useCallback((id: string) => {
    let target: GrammarSuggestion | undefined;
    setGrammarSuggestions(prev => {
      target = prev.find(s => s.id === id);
      return prev.filter(s => s.id !== id);
    });

    setGrammarHighlights(prev => {
      if (!target) return prev;
      return prev.filter(h => !(h.start === target!.start && h.end === target!.end));
    });
  }, []);

  const applyGrammarSuggestion = useCallback((id: string | null = null) => {
    const targetSuggestion = id
      ? grammarSuggestions.find(s => s.id === id)
      : grammarSuggestions[0];

    if (!targetSuggestion) {
      setMagicError('No grammar suggestion to apply');
      return;
    }

    const currentText = getCurrentText();
    const capturedSelection = operationSelectionRef.current;

    if (!capturedSelection) {
      setMagicError('No selection to apply grammar fixes');
      return;
    }

    const targetText = currentText.substring(targetSuggestion.start, targetSuggestion.end);

    if (targetText !== targetSuggestion.originalText) {
      setMagicError('Text has changed since grammar check. Please re-run.');
      closeMagicBar();
      clearSelection();
      return;
    }

    const before = currentText.substring(0, targetSuggestion.start);
    const after = currentText.substring(targetSuggestion.end);
    const updated = before + targetSuggestion.replacement + after;

    commit(updated, 'Grammar fix applied', 'User');
    dismissGrammarSuggestion(targetSuggestion.id);

    setGrammarHighlights(prev => prev.filter(h => !(h.start === targetSuggestion.start && h.end === targetSuggestion.end)));

    if (grammarSuggestions.length <= 1) {
      closeMagicBar();
      clearSelection();
    }
  }, [grammarSuggestions, getCurrentText, commit, dismissGrammarSuggestion, closeMagicBar, clearSelection]);

  const applyAllGrammarSuggestions = useCallback(() => {
    if (!grammarSuggestions.length) return;
    const currentText = getCurrentText();

    const sorted = [...grammarSuggestions].sort((a, b) => b.start - a.start);
    let updated = currentText;

    for (const suggestion of sorted) {
      const targetText = updated.substring(suggestion.start, suggestion.end);
      if (targetText !== suggestion.originalText) {
        setMagicError('Text has changed since grammar check. Please re-run.');
        closeMagicBar();
        clearSelection();
        return;
      }

      updated = `${updated.substring(0, suggestion.start)}${suggestion.replacement}${updated.substring(suggestion.end)}`;
    }

    commit(updated, 'Applied grammar fixes', 'User');
    setGrammarSuggestions([]);
    setGrammarHighlights([]);
    closeMagicBar();
    clearSelection();
  }, [grammarSuggestions, getCurrentText, commit, closeMagicBar, clearSelection]);

  const closeMagicBar = useCallback(() => {
    abortMagicOperation();
    resetMagicState();
    operationSelectionRef.current = null;
    // Note: caller should decide whether to clear selection
  }, [abortMagicOperation, resetMagicState]);

  const applyVariation = useCallback((newText: string) => {
    const currentText = getCurrentText();
    const capturedSelection = operationSelectionRef.current;
    
    if (!capturedSelection) {
      setMagicError('No selection to apply to');
      return;
    }
    
    // Validate selection is still valid
    const expectedText = currentText.substring(
      capturedSelection.start, 
      capturedSelection.end
    );
    
    if (expectedText !== capturedSelection.text) {
      setMagicError('Text has changed since selection. Please re-select and try again.');
      closeMagicBar();
      clearSelection();
      return;
    }
    
    const before = currentText.substring(0, capturedSelection.start);
    const after = currentText.substring(capturedSelection.end);
    const updated = before + newText + after;

    const description = magicVariations.length > 0 
      ? 'Magic Edit: Variation Applied' 
      : 'Magic Edit: Context Replacement';
    
    commit(updated, description, 'User');
    closeMagicBar();
    clearSelection();
  }, [getCurrentText, commit, magicVariations.length, closeMagicBar, clearSelection]);

  return {
    state: {
      magicVariations,
      activeMagicMode,
      magicHelpResult,
      magicHelpType,
      isMagicLoading,
      magicError,
      grammarSuggestions,
      grammarHighlights,
    },
    actions: {
      handleRewrite,
      handleHelp,
      applyVariation,
      closeMagicBar,
      handleGrammarCheck,
      applyGrammarSuggestion,
      applyAllGrammarSuggestions,
      dismissGrammarSuggestion,
    }
  };
}
