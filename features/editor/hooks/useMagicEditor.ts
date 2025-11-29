import { useState, useRef, useCallback } from 'react';
import { rewriteText, getContextualHelp } from '@/services/gemini/agent';
import { useUsage } from '@/features/shared';

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
  }, []);

  const handleRewrite = useCallback(async (mode: string, tone?: string) => {
    if (!selectionRange) return;
    
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
      trackUsage(usage);
      
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
    if (!selectionRange) return;
    
    abortMagicOperation();
    magicAbortRef.current = new AbortController();
    const signal = magicAbortRef.current.signal;
    
    operationSelectionRef.current = { ...selectionRange };
    
    resetMagicState();
    setMagicHelpType(type);
    setIsMagicLoading(true);

    try {
      const { result, usage } = await getContextualHelp(selectionRange.text, type, signal);
      trackUsage(usage);
      
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
    },
    actions: {
      handleRewrite,
      handleHelp,
      applyVariation,
      closeMagicBar,
    }
  };
}
