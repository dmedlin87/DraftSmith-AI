/**
 * useManuscriptIntelligence Hook
 * 
 * React hook for managing the deterministic intelligence layer.
 * Provides tiered processing: instant, debounced, and background.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  ManuscriptIntelligence,
  ManuscriptHUD,
  InstantMetrics,
  DebouncedMetrics,
  processManuscript,
  processInstant,
  processDebounced,
  updateHUDForCursor,
  generateAIContext,
  createEmptyIntelligence,
  ChangeHistory,
} from '../../../services/intelligence';

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

const DEBOUNCE_DELAY = 150;       // ms after typing stops for debounced processing
const BACKGROUND_DELAY = 2000;    // ms after typing stops for full processing
const INSTANT_THROTTLE = 50;      // ms minimum between instant updates
const USE_WEB_WORKER = (import.meta as any).env?.MODE !== 'test';      // Disable Web Worker in Vitest to avoid worker-related OOM

// ─────────────────────────────────────────────────────────────────────────────
// HOOK INTERFACE
// ─────────────────────────────────────────────────────────────────────────────

export interface UseManuscriptIntelligenceOptions {
  chapterId: string;
  initialText?: string;
  onIntelligenceReady?: (intelligence: ManuscriptIntelligence) => void;
}

export interface UseManuscriptIntelligenceReturn {
  // Current state
  intelligence: ManuscriptIntelligence;
  hud: ManuscriptHUD;
  instantMetrics: InstantMetrics;
  
  // Processing state
  isProcessing: boolean;
  processingTier: 'idle' | 'instant' | 'debounced' | 'background';
  lastProcessedAt: number;
  
  // Actions
  updateText: (text: string, cursorOffset: number) => void;
  updateCursor: (cursorOffset: number) => void;
  forceFullProcess: () => void;
  
  // AI context generation
  getAIContext: (compressed?: boolean) => string;
  getSectionContext: (startOffset: number, endOffset: number) => string;
  
  // Utilities
  changeHistory: ChangeHistory;
}

// ─────────────────────────────────────────────────────────────────────────────
// HOOK IMPLEMENTATION
// ─────────────────────────────────────────────────────────────────────────────

export const useManuscriptIntelligence = (
  options: UseManuscriptIntelligenceOptions
): UseManuscriptIntelligenceReturn => {
  const { chapterId, initialText = '', onIntelligenceReady } = options;
  
  // ─────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────
  
  const [intelligence, setIntelligence] = useState<ManuscriptIntelligence>(
    () => createEmptyIntelligence(chapterId)
  );
  const [hud, setHud] = useState<ManuscriptHUD>(intelligence.hud);
  const [instantMetrics, setInstantMetrics] = useState<InstantMetrics>({
    wordCount: 0,
    sentenceCount: 0,
    paragraphCount: 0,
    cursorScene: null,
    cursorTension: 0.5,
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingTier, setProcessingTier] = useState<'idle' | 'instant' | 'debounced' | 'background'>('idle');
  const [lastProcessedAt, setLastProcessedAt] = useState(0);
  
  // ─────────────────────────────────────────
  // REFS
  // ─────────────────────────────────────────
  
  const textRef = useRef(initialText);
  const cursorRef = useRef(0);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const backgroundTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastInstantRef = useRef(0);
  const changeHistoryRef = useRef(new ChangeHistory());
  const previousTextRef = useRef<string>('');
  const workerRef = useRef<Worker | null>(null);
  const workerRequestIdRef = useRef<string | null>(null);
  const [processingProgress, setProcessingProgress] = useState(0);
  
  // ─────────────────────────────────────────
  // PROCESSING FUNCTIONS
  // ─────────────────────────────────────────
  
  const runInstantProcess = useCallback((text: string, cursorOffset: number) => {
    const now = Date.now();
    if (now - lastInstantRef.current < INSTANT_THROTTLE) {
      return;
    }
    lastInstantRef.current = now;
    
    setProcessingTier('instant');
    const metrics = processInstant(text, cursorOffset, intelligence.structural);
    setInstantMetrics(metrics);
  }, [intelligence.structural]);
  
  const runDebouncedProcess = useCallback((text: string, cursorOffset: number) => {
    setProcessingTier('debounced');
    setIsProcessing(true);
    
    try {
      const metrics = processDebounced(text, cursorOffset);
      setInstantMetrics(metrics);
    } finally {
      setIsProcessing(false);
    }
  }, []);
  
  const runBackgroundProcess = useCallback((text: string, cursorOffset: number) => {
    setProcessingTier('background');
    setIsProcessing(true);
    setProcessingProgress(0);
    
    // Try to use Web Worker for true parallelism
    if (USE_WEB_WORKER && workerRef.current) {
      const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      workerRequestIdRef.current = requestId;
      
      workerRef.current.postMessage({
        type: 'PROCESS_FULL',
        id: requestId,
        payload: {
          text,
          chapterId,
          previousText: previousTextRef.current,
          previousIntelligence: intelligence,
          cursorOffset,
        },
      });
      return; // Worker will handle the result via onmessage
    }
    
    // Fallback: Use requestIdleCallback for non-blocking processing
    const process = () => {
      try {
        const newIntelligence = processManuscript(
          text,
          chapterId,
          previousTextRef.current,
          intelligence
        );
        
        previousTextRef.current = text;
        setIntelligence(newIntelligence);
        setHud(updateHUDForCursor(newIntelligence, cursorOffset));
        setLastProcessedAt(Date.now());
        
        // Notify callback
        if (onIntelligenceReady) {
          onIntelligenceReady(newIntelligence);
        }
      } finally {
        setIsProcessing(false);
        setProcessingTier('idle');
      }
    };
    
    // Use requestIdleCallback if available, otherwise setTimeout
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(process, { timeout: 5000 });
    } else {
      setTimeout(process, 0);
    }
  }, [chapterId, intelligence, onIntelligenceReady]);
  
  // ─────────────────────────────────────────
  // PUBLIC ACTIONS
  // ─────────────────────────────────────────
  
  const updateText = useCallback((text: string, cursorOffset: number) => {
    textRef.current = text;
    cursorRef.current = cursorOffset;
    
    // Clear existing timers
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    if (backgroundTimerRef.current) {
      clearTimeout(backgroundTimerRef.current);
    }
    
    // Instant processing (throttled)
    runInstantProcess(text, cursorOffset);
    
    // Schedule debounced processing
    debounceTimerRef.current = setTimeout(() => {
      runDebouncedProcess(text, cursorOffset);
    }, DEBOUNCE_DELAY);
    
    // Schedule background processing
    backgroundTimerRef.current = setTimeout(() => {
      runBackgroundProcess(text, cursorOffset);
    }, BACKGROUND_DELAY);
  }, [runInstantProcess, runDebouncedProcess, runBackgroundProcess]);
  
  const updateCursor = useCallback((cursorOffset: number) => {
    cursorRef.current = cursorOffset;
    
    // Update HUD immediately (very cheap operation)
    if (intelligence.structural.scenes.length > 0) {
      setHud(updateHUDForCursor(intelligence, cursorOffset));
    }
    
    // Update instant metrics
    runInstantProcess(textRef.current, cursorOffset);
  }, [intelligence, runInstantProcess]);
  
  const forceFullProcess = useCallback(() => {
    // Clear existing timers
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    if (backgroundTimerRef.current) {
      clearTimeout(backgroundTimerRef.current);
    }
    
    // Run immediately
    runBackgroundProcess(textRef.current, cursorRef.current);
  }, [runBackgroundProcess]);
  
  // ─────────────────────────────────────────
  // AI CONTEXT GENERATION
  // ─────────────────────────────────────────
  
  const getAIContext = useCallback((compressed: boolean = false): string => {
    return generateAIContext(intelligence, cursorRef.current, compressed);
  }, [intelligence]);
  
  const getSectionContext = useCallback((startOffset: number, endOffset: number): string => {
    const { structural, entities, heatmap } = intelligence;
    
    let context = '';
    
    // Get scenes in range
    const scenes = structural.scenes.filter(
      s => s.startOffset >= startOffset && s.startOffset < endOffset
    );
    
    if (scenes.length > 0) {
      context += `[SCENES]\n`;
      for (const scene of scenes) {
        context += `- ${scene.type}, tension: ${(scene.tension * 10).toFixed(0)}/10`;
        if (scene.pov) context += `, POV: ${scene.pov}`;
        context += `\n`;
      }
    }
    
    // Get entities in range
    const sectionEntities = entities.nodes.filter(
      n => n.mentions.some(m => m.offset >= startOffset && m.offset < endOffset)
    );
    
    if (sectionEntities.length > 0) {
      context += `\n[ENTITIES]\n`;
      for (const entity of sectionEntities.slice(0, 5)) {
        context += `- ${entity.name} (${entity.type})\n`;
      }
    }
    
    return context;
  }, [intelligence]);
  
  // ─────────────────────────────────────────
  // EFFECTS
  // ─────────────────────────────────────────
  
  // Initialize Web Worker
  useEffect(() => {
    if (!USE_WEB_WORKER) return;
    
    try {
      // Create worker - Vite handles bundling with this syntax
      workerRef.current = new Worker(
        new URL('../../../services/intelligence/worker.ts', import.meta.url),
        { type: 'module' }
      );
      
      // Handle worker messages
      workerRef.current.onmessage = (event) => {
        const { type, id, payload, progress, error } = event.data;
        
        // Ignore messages from old requests
        if (id !== workerRequestIdRef.current && type !== 'READY') {
          return;
        }
        
        switch (type) {
          case 'READY':
            console.log('[Intelligence] Worker ready');
            break;
            
          case 'PROGRESS':
            if (progress) {
              setProcessingProgress(progress.percent);
            }
            break;
            
          case 'RESULT':
            if (payload) {
              const newIntelligence = payload as ManuscriptIntelligence;
              previousTextRef.current = textRef.current;
              setIntelligence(newIntelligence);
              setHud(updateHUDForCursor(newIntelligence, cursorRef.current));
              setLastProcessedAt(Date.now());
              setIsProcessing(false);
              setProcessingTier('idle');
              setProcessingProgress(100);
              
              if (onIntelligenceReady) {
                onIntelligenceReady(newIntelligence);
              }
            }
            break;
            
          case 'ERROR':
            console.error('[Intelligence] Worker error:', error);
            setIsProcessing(false);
            setProcessingTier('idle');
            break;
        }
      };
      
      workerRef.current.onerror = (error) => {
        console.error('[Intelligence] Worker error:', error);
        // Disable worker on error, fallback to main thread
        workerRef.current = null;
      };
      
    } catch (err) {
      console.warn('[Intelligence] Web Worker not available, using main thread');
      workerRef.current = null;
    }
    
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, [onIntelligenceReady]);
  
  // Initial processing
  useEffect(() => {
    if (initialText) {
      textRef.current = initialText;
      // Delay initial processing slightly to let worker initialize
      setTimeout(() => runBackgroundProcess(initialText, 0), 100);
    }
  }, []); // Only on mount
  
  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (backgroundTimerRef.current) {
        clearTimeout(backgroundTimerRef.current);
      }
      // Cancel any pending worker requests
      if (workerRef.current && workerRequestIdRef.current) {
        workerRef.current.postMessage({ type: 'CANCEL', id: workerRequestIdRef.current });
      }
    };
  }, []);
  
  // ─────────────────────────────────────────
  // RETURN
  // ─────────────────────────────────────────
  
  return {
    intelligence,
    hud,
    instantMetrics,
    isProcessing,
    processingTier,
    lastProcessedAt,
    updateText,
    updateCursor,
    forceFullProcess,
    getAIContext,
    getSectionContext,
    changeHistory: changeHistoryRef.current,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// SELECTOR HOOKS (for performance optimization)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Select only the current scene from intelligence
 */
export const useCurrentScene = (intelligence: ManuscriptIntelligence, cursorOffset: number) => {
  return useMemo(() => {
    return intelligence.structural.scenes.find(
      s => cursorOffset >= s.startOffset && cursorOffset < s.endOffset
    ) || null;
  }, [intelligence.structural.scenes, cursorOffset]);
};

/**
 * Select only style alerts from intelligence
 */
export const useStyleAlerts = (intelligence: ManuscriptIntelligence) => {
  return useMemo(() => {
    const alerts: string[] = [];
    const { flags } = intelligence.style;
    
    if (flags.passiveVoiceRatio > 3) {
      alerts.push(`Passive voice: ${flags.passiveVoiceRatio.toFixed(1)}/100 words`);
    }
    if (flags.adverbDensity > 4) {
      alerts.push(`Adverb density: ${flags.adverbDensity.toFixed(1)}/100 words`);
    }
    if (flags.clicheCount > 0) {
      alerts.push(`${flags.clicheCount} clichés detected`);
    }
    if (flags.filterWordDensity > 3) {
      alerts.push(`Filter words: ${flags.filterWordDensity.toFixed(1)}/100 words`);
    }
    
    return alerts;
  }, [intelligence.style.flags]);
};

/**
 * Select open plot promises from intelligence
 */
export const useOpenPromises = (intelligence: ManuscriptIntelligence) => {
  return useMemo(() => {
    return intelligence.timeline.promises.filter(p => !p.resolved);
  }, [intelligence.timeline.promises]);
};

/**
 * Select high-risk sections from heatmap
 */
export const useHighRiskSections = (intelligence: ManuscriptIntelligence, threshold: number = 0.5) => {
  return useMemo(() => {
    return intelligence.heatmap.sections
      .filter(s => s.overallRisk >= threshold)
      .sort((a, b) => b.overallRisk - a.overallRisk);
  }, [intelligence.heatmap.sections, threshold]);
};

export default useManuscriptIntelligence;
