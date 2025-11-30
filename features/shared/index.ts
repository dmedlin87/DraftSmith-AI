/**
 * Shared Feature
 * 
 * Cross-cutting concerns: contexts, hooks, utilities
 */

// Contexts
export { 
  EditorProvider, 
  useEditor,
  useManuscript,
  type EditorContextValue,
  type ManuscriptContextValue 
} from './context/EditorContext';

export { 
  EngineProvider, 
  useEngine,
  type EngineState,
  type EngineActions,
  type EngineContextValue 
} from './context/EngineContext';

export { UsageProvider, useUsage } from './context/UsageContext';

// AppBrain exports
export { 
  AppBrainProvider, 
  useAppBrain,
  useAppBrainState,
  useAppBrainActions,
  useAppBrainContext,
  type AppBrainValue,
} from './context/AppBrainContext';

// Hooks
export { useQuillAIEngine, type PendingDiff } from './hooks/useDraftSmithEngine';
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
