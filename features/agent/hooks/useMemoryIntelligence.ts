/**
 * useMemoryIntelligence Hook
 * 
 * Connects the intelligence/analysis layer to the memory system.
 * - Observes analysis results and creates memories
 * - Runs consolidation on startup/periodically
 * - Reinforces memories when they're used
 * - Provides memory health stats
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { eventBus } from '@/services/appBrain';
import { 
  observeAnalysisResults,
  observeIntelligenceResults,
  ObservationResult,
} from '@/services/memory/autoObserver';
import {
  runConsolidation,
  reinforceMemory,
  reinforceMemories,
  getMemoryHealthStats,
  ReinforcementEvent,
  ConsolidationResult,
} from '@/services/memory/consolidation';
import { getActiveGoals, evolveBedsideNote } from '@/services/memory';
import type { AgentGoal, BedsideNoteContent } from '@/services/memory/types';
import { serializeBedsideNote } from '@/services/memory/bedsideNoteSerializer';
import { AnalysisResult } from '@/types';
import { ManuscriptIntelligence } from '@/types/intelligence';

export interface UseMemoryIntelligenceOptions {
  /** Project ID for memory operations */
  projectId: string | null;
  /** Whether to auto-observe analysis results */
  autoObserveEnabled?: boolean;
  /** Whether to run consolidation on mount */
  consolidateOnMount?: boolean;
  /** Consolidation interval in milliseconds (0 = disabled) */
  consolidationIntervalMs?: number;
}

export interface MemoryHealthStats {
  totalMemories: number;
  avgImportance: number;
  lowImportanceCount: number;
  oldMemoriesCount: number;
  activeGoals: number;
  completedGoals: number;
}

export interface UseMemoryIntelligenceResult {
  /** Last observation result */
  lastObservation: ObservationResult | null;
  /** Last consolidation result */
  lastConsolidation: ConsolidationResult | null;
  /** Memory health statistics */
  healthStats: MemoryHealthStats | null;
  /** Whether observation is in progress */
  isObserving: boolean;
  /** Whether consolidation is in progress */
  isConsolidating: boolean;
  
  /** Manually trigger observation from analysis */
  observeAnalysis: (analysis: AnalysisResult) => Promise<ObservationResult>;
  /** Manually trigger observation from intelligence */
  observeIntelligence: (intelligence: ManuscriptIntelligence) => Promise<ObservationResult>;
  /** Manually trigger consolidation */
  consolidate: () => Promise<ConsolidationResult>;
  /** Reinforce a memory when used */
  reinforceUsed: (memoryId: string, reason: ReinforcementEvent['reason']) => Promise<boolean>;
  /** Refresh health stats */
  refreshHealthStats: () => Promise<void>;
}

function buildBedsidePlan(
  analysis: AnalysisResult | null,
  goals: AgentGoal[],
): { text: string; content: BedsideNoteContent } | null {
  if (!analysis && goals.length === 0) {
    return null;
  }

  const content: BedsideNoteContent = {
    currentFocus: analysis?.summary,
    warnings: [
      ...(analysis?.weaknesses || []),
      ...(analysis?.plotIssues || []).map(issue => issue.issue),
    ].filter(Boolean),
    activeGoals: goals.map(goal => ({
      title: goal.title,
      progress: goal.progress,
      status: goal.status,
      updatedAt: goal.updatedAt ?? goal.createdAt,
    })),
    nextSteps: analysis?.generalSuggestions?.slice(0, 4) || [],
    recentDiscoveries: (analysis?.plotIssues || [])
      .map(issue => issue.suggestion)
      .filter(Boolean)
      .slice(0, 4),
  };

  const { text } = serializeBedsideNote(content);
  if (!text) return null;

  return { text, content };
}

export function useMemoryIntelligence(
  options: UseMemoryIntelligenceOptions
): UseMemoryIntelligenceResult {
  const {
    projectId,
    autoObserveEnabled = true,
    consolidateOnMount = true,
    consolidationIntervalMs = 0, // Disabled by default
  } = options;

  const [lastObservation, setLastObservation] = useState<ObservationResult | null>(null);
  const [lastConsolidation, setLastConsolidation] = useState<ConsolidationResult | null>(null);
  const [healthStats, setHealthStats] = useState<MemoryHealthStats | null>(null);
  const [isObserving, setIsObserving] = useState(false);
  const [isConsolidating, setIsConsolidating] = useState(false);
  
  const consolidationTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Observe analysis results
  const observeAnalysis = useCallback(async (
    analysis: AnalysisResult
  ): Promise<ObservationResult> => {
    if (!projectId) {
      return { created: [], skipped: 0, errors: ['No project ID'] };
    }

    setIsObserving(true);
    try {
      const result = await observeAnalysisResults(analysis, { projectId });
      setLastObservation(result);

      try {
        const goals = await getActiveGoals(projectId);
        const plan = buildBedsidePlan(analysis, goals);
        if (plan) {
          await evolveBedsideNote(projectId, plan.text, {
            changeReason: 'analysis_update',
            structuredContent: plan.content,
          });
        }
      } catch (e) {
        console.warn('[useMemoryIntelligence] Failed to evolve bedside note:', e);
      }

      return result;
    } finally {
      setIsObserving(false);
    }
  }, [projectId]);

  // Observe intelligence results
  const observeIntelligence = useCallback(async (
    intelligence: ManuscriptIntelligence
  ): Promise<ObservationResult> => {
    if (!projectId) {
      return { created: [], skipped: 0, errors: ['No project ID'] };
    }

    setIsObserving(true);
    try {
      const result = await observeIntelligenceResults(intelligence, { projectId });
      setLastObservation(result);
      return result;
    } finally {
      setIsObserving(false);
    }
  }, [projectId]);

  // Run consolidation
  const consolidate = useCallback(async (): Promise<ConsolidationResult> => {
    if (!projectId) {
      return { 
        decayed: 0, merged: 0, archived: 0, reinforced: 0, 
        errors: ['No project ID'], duration: 0 
      };
    }

    setIsConsolidating(true);
    try {
      const result = await runConsolidation({ projectId });
      setLastConsolidation(result);
      return result;
    } finally {
      setIsConsolidating(false);
    }
  }, [projectId]);

  // Reinforce a memory when used
  const reinforceUsed = useCallback(async (
    memoryId: string,
    reason: ReinforcementEvent['reason']
  ): Promise<boolean> => {
    return reinforceMemory({ memoryId, reason });
  }, []);

  // Refresh health stats
  const refreshHealthStats = useCallback(async () => {
    if (!projectId) {
      setHealthStats(null);
      return;
    }

    try {
      const stats = await getMemoryHealthStats(projectId);
      setHealthStats(stats);
    } catch (e) {
      console.warn('[useMemoryIntelligence] Failed to get health stats:', e);
    }
  }, [projectId]);

  // Subscribe to analysis completion events
  useEffect(() => {
    if (!autoObserveEnabled || !projectId) return;

    const unsubscribe = eventBus.subscribe('ANALYSIS_COMPLETED', async (event) => {
      if (event.type === 'ANALYSIS_COMPLETED') {
        // The event payload contains the analysis section that completed
        // We could trigger observation here, but for now we'll let the 
        // caller manually trigger via observeAnalysis when full analysis is done
        console.log('[useMemoryIntelligence] Analysis completed:', event.payload);
      }
    });

    return unsubscribe;
  }, [autoObserveEnabled, projectId]);

  // Run consolidation on mount
  useEffect(() => {
    if (consolidateOnMount && projectId) {
      // Delay slightly to avoid blocking initial render
      const timer = setTimeout(() => {
        consolidate().catch(console.error);
        refreshHealthStats().catch(console.error);
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [consolidateOnMount, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Set up consolidation interval
  useEffect(() => {
    if (consolidationIntervalMs > 0 && projectId) {
      consolidationTimerRef.current = setInterval(() => {
        consolidate().catch(console.error);
      }, consolidationIntervalMs);

      return () => {
        if (consolidationTimerRef.current) {
          clearInterval(consolidationTimerRef.current);
        }
      };
    }
  }, [consolidationIntervalMs, projectId, consolidate]);

  // Refresh health stats when project changes
  useEffect(() => {
    refreshHealthStats().catch(console.error);
  }, [projectId, refreshHealthStats]);

  return {
    lastObservation,
    lastConsolidation,
    healthStats,
    isObserving,
    isConsolidating,
    observeAnalysis,
    observeIntelligence,
    consolidate,
    reinforceUsed,
    refreshHealthStats,
  };
}

export default useMemoryIntelligence;
