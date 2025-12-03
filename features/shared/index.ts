/**
 * Shared Feature
 * 
 * Cross-cutting concerns: contexts, hooks, utilities
 */

// Contexts
export { UsageProvider, useUsage } from './context/UsageContext';

// Hooks
export { useQuillAIEngine, type PendingDiff } from './hooks/useDraftSmithEngine';
export { EditorProvider, EngineProvider, useEditor, useEngine } from '@/features/core';
export { useManuscriptIndexer } from './hooks/useManuscriptIndexer';
export { usePlotSuggestions } from './hooks/usePlotSuggestions';
export { useViewportCollision } from './hooks/useViewportCollision';
export { 
  useManuscriptIntelligence, 
  useCurrentScene, 
  useStyleAlerts, 
  useOpenPromises,
  useHighRiskSections,
  type UseManuscriptIntelligenceOptions,
  type UseManuscriptIntelligenceReturn,
} from './hooks/useManuscriptIntelligence';

// Utils
export { findQuoteRange, enrichAnalysisWithPositions, extractClickableIssues } from './utils/textLocator';
export { calculateDiff } from './utils/diffUtils';

// Components
export { ErrorBoundary } from './components/ErrorBoundary';
export { UsageBadge } from './components/UsageBadge';
export { AccessibleTooltip } from './components/AccessibleTooltip';
export * from './components/Icons';
