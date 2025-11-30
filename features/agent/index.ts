/**
 * Agent Feature
 * 
 * AI agent chat and editing capabilities
 */

// Components
export { ChatInterface } from './components/ChatInterface';
export { ActivityFeed } from './components/ActivityFeed';
export { PersonaSelector } from './components/PersonaSelector';
export { AIPresenceOrb, type OrbStatus, type AIPresenceOrbProps } from './components/AIPresenceOrb';
export { ProactiveSuggestions, ProactiveSuggestionsBadge } from './components/ProactiveSuggestions';

// Hooks
export { useAgenticEditor, type EditorActions, type UseAgenticEditorOptions, type UseAgenticEditorResult } from './hooks/useAgenticEditor';
export { useAgentService, type ToolActionHandler, type AgentState, type UseAgentServiceOptions, type AgentServiceResult } from './hooks/useAgentService';
export { 
  useAgentOrchestrator, 
  type AgentMode, 
  type AgentOrchestratorState, 
  type UseAgentOrchestratorOptions, 
  type AgentOrchestratorResult 
} from './hooks/useAgentOrchestrator';
export { 
  useProactiveSuggestions, 
  type UseProactiveSuggestionsOptions, 
  type UseProactiveSuggestionsResult 
} from './hooks/useProactiveSuggestions';
export { 
  useMemoryIntelligence, 
  type UseMemoryIntelligenceOptions, 
  type UseMemoryIntelligenceResult,
  type MemoryHealthStats,
} from './hooks/useMemoryIntelligence';
