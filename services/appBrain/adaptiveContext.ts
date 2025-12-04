/**
 * Adaptive Context Builder (Enhancement 2A)
 * 
 * Dynamic token budgeting based on conversation depth, query type,
 * and available context. Ensures optimal use of context window
 * without exceeding token limits.
 */

import { AppBrainState } from './types';
import { eventBus } from './eventBus';
import {
  getMemoriesForContext,
  getRelevantMemoriesForContext,
  getActiveGoals,
  formatMemoriesForPrompt,
  formatGoalsForPrompt,
  getMemories,
  createMemory,
  evolveBedsideNote,
  BEDSIDE_NOTE_TAG,
  BEDSIDE_NOTE_DEFAULT_TAGS,
  type MemoryRelevanceOptions,
} from '../memory';
import type { AgentGoal } from '../memory/types';
import { ActiveModels, TokenLimits, type ModelId } from '../../config/models';
import type { SceneType, Scene } from '../../types/intelligence';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface ContextBudget {
  totalTokens: number;
  sections: {
    manuscript: number;      // % of budget
    intelligence: number;
    analysis: number;
    memory: number;
    lore: number;
    history: number;
  };
}

export interface ContextSection {
  name: string;
  content: string;
  tokenCount: number;
  priority: number; // 1 = highest
  truncatable: boolean;
}

export interface AdaptiveContextResult {
  context: string;
  tokenCount: number;
  sectionsIncluded: string[];
  sectionsTruncated: string[];
  sectionsOmitted: string[];
  budget: ContextBudget;
}

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT BUDGETS
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_BUDGET: ContextBudget = {
  totalTokens: 8000, // Conservative default
  sections: {
    manuscript: 0.20,
    intelligence: 0.25,
    analysis: 0.15,
    memory: 0.25,
    lore: 0.10,
    history: 0.05,
  },
};

export const VOICE_MODE_BUDGET: ContextBudget = {
  totalTokens: 2000, // Compressed for voice
  sections: {
    manuscript: 0.30,
    intelligence: 0.30,
    analysis: 0.10,
    memory: 0.20,
    lore: 0.05,
    history: 0.05,
  },
};

export const EDITING_BUDGET: ContextBudget = {
  totalTokens: 6000,
  sections: {
    manuscript: 0.35,
    intelligence: 0.20,
    analysis: 0.15,
    memory: 0.15,
    lore: 0.10,
    history: 0.05,
  },
};

export const DEEP_ANALYSIS_BUDGET: ContextBudget = {
  totalTokens: 12000,
  sections: {
    manuscript: 0.15,
    intelligence: 0.30,
    analysis: 0.25,
    memory: 0.20,
    lore: 0.05,
    history: 0.05,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT PROFILES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Named context profiles for different interaction modes.
 * Each profile maps to a budget configuration optimized for that use case.
 */
export type ContextProfile = 
  | 'full'           // Default full context for general queries
  | 'editing'        // Editing mode with selection emphasis
  | 'voice'          // Compressed for voice/low-latency
  | 'analysis_deep'; // Deep analysis with more intelligence/analysis sections

// ─────────────────────────────────────────────────────────────────────────────
// SCENE-AWARE MEMORY FILTERING (Smartness Upgrade)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scene context for intelligent memory filtering.
 * Used to select memories most relevant to the current narrative moment.
 */
export interface SceneContext {
  /** Current scene type (action, dialogue, introspection, etc.) */
  sceneType: SceneType | null;
  /** Current location name from intelligence */
  location: string | null;
  /** Current POV character */
  pov: string | null;
  /** Tension level (low, medium, high) */
  tensionLevel: 'low' | 'medium' | 'high';
}

/**
 * Map of scene types to memory tag preferences.
 * Determines which memory categories are most relevant for each scene type.
 */
const SCENE_TYPE_MEMORY_TAGS: Record<SceneType, string[]> = {
  action: ['conflict', 'tension', 'combat', 'chase', 'danger', 'stakes'],
  dialogue: ['relationship', 'conversation', 'voice', 'speech', 'communication'],
  description: ['setting', 'worldbuilding', 'atmosphere', 'location', 'environment'],
  introspection: ['motivation', 'emotion', 'arc', 'internal', 'character', 'psychology'],
  transition: ['pacing', 'timeline', 'continuity'],
};

/**
 * Tension level to memory preference mapping.
 * High tension scenes benefit from conflict/stakes memories.
 */
const TENSION_MEMORY_BOOST: Record<'low' | 'medium' | 'high', string[]> = {
  low: ['setup', 'worldbuilding', 'character', 'relationship'],
  medium: ['development', 'arc', 'plot-thread'],
  high: ['conflict', 'stakes', 'climax', 'tension', 'danger'],
};

/**
 * Derive scene context from AppBrainState.
 */
export function getSceneContextFromState(state: AppBrainState): SceneContext {
  const hud = state.intelligence.hud;
  
  if (!hud) {
    return {
      sceneType: null,
      location: null,
      pov: null,
      tensionLevel: 'medium',
    };
  }
  
  return {
    sceneType: hud.situational.currentScene?.type || null,
    location: hud.situational.currentScene?.location || null,
    pov: hud.situational.currentScene?.pov || null,
    tensionLevel: hud.situational.tensionLevel,
  };
}

/**
 * Build enhanced memory relevance options based on scene context.
 * 
 * This is the core of scene-aware memory filtering:
 * - Adds scene-type-specific tags to boost relevant memories
 * - Includes location and POV character tags
 * - Adjusts based on tension level
 */
export function buildSceneAwareRelevance(
  baseRelevance: MemoryRelevanceOptions,
  sceneContext: SceneContext
): MemoryRelevanceOptions {
  const enhancedKeywords = [...(baseRelevance.selectionKeywords || [])];
  
  // Add scene-type-specific tags
  if (sceneContext.sceneType && SCENE_TYPE_MEMORY_TAGS[sceneContext.sceneType]) {
    const sceneTags = SCENE_TYPE_MEMORY_TAGS[sceneContext.sceneType];
    enhancedKeywords.push(...sceneTags);
  }
  
  // Add tension-level tags
  const tensionTags = TENSION_MEMORY_BOOST[sceneContext.tensionLevel];
  enhancedKeywords.push(...tensionTags);
  
  // Add location as a keyword
  if (sceneContext.location) {
    enhancedKeywords.push(sceneContext.location.toLowerCase());
  }
  
  // Add POV character to active entities
  const enhancedEntities = [...(baseRelevance.activeEntityNames || [])];
  if (sceneContext.pov && !enhancedEntities.includes(sceneContext.pov)) {
    enhancedEntities.push(sceneContext.pov);
  }
  
  return {
    ...baseRelevance,
    activeEntityNames: enhancedEntities,
    selectionKeywords: [...new Set(enhancedKeywords)], // Dedupe
  };
}

/**
 * Section allocation presets for each profile.
 * These define the percentage distribution of token budget across sections.
 */
export const PROFILE_ALLOCATIONS: Record<ContextProfile, ContextBudget['sections']> = {
  full: DEFAULT_BUDGET.sections,
  editing: EDITING_BUDGET.sections,
  voice: VOICE_MODE_BUDGET.sections,
  analysis_deep: DEEP_ANALYSIS_BUDGET.sections,
};

/**
 * Get a context budget derived from model configuration.
 * 
 * This pulls token limits from config/models.ts and applies appropriate
 * reservations for response tokens, then combines with profile allocations.
 * 
 * @param modelRole - Which model role to use for limits ('agent' | 'analysis')
 * @param profile - Context profile for section allocations
 * @param options - Additional options
 */
export function getContextBudgetForModel(
  modelRole: 'agent' | 'analysis' = 'agent',
  profile: ContextProfile = 'full',
  options: {
    /** Tokens to reserve for model response */
    reserveForResponse?: number;
    /** Maximum context budget even if model allows more */
    maxBudget?: number;
  } = {}
): ContextBudget {
  const { reserveForResponse = 4000, maxBudget = 16000 } = options;
  
  // Get model definition and its token limit
  const modelDef = ActiveModels[modelRole];
  const modelLimit = modelDef.maxTokens ?? TokenLimits[modelDef.id as ModelId] ?? 32_000;
  
  // Calculate available tokens after reserving for response
  const availableTokens = Math.max(0, modelLimit - reserveForResponse);
  
  // Cap at maxBudget to avoid overwhelming context (even large models benefit from focused context)
  const totalTokens = Math.min(availableTokens, maxBudget);
  
  // Get section allocations for the profile
  const sections = PROFILE_ALLOCATIONS[profile];
  
  return {
    totalTokens,
    sections,
  };
}

/**
 * Automatically select the best context profile based on interaction state.
 * 
 * @param options - Current interaction state
 * @returns The most appropriate ContextProfile
 */
export function selectContextProfile(options: {
  mode: 'text' | 'voice';
  hasSelection: boolean;
  queryType?: 'editing' | 'analysis' | 'general';
  conversationTurns?: number;
}): ContextProfile {
  const { mode, hasSelection, queryType, conversationTurns = 0 } = options;
  
  // Voice mode always uses compressed profile
  if (mode === 'voice') {
    return 'voice';
  }
  
  // Explicit query type takes precedence
  if (queryType === 'analysis') {
    return 'analysis_deep';
  }
  
  if (queryType === 'editing' || hasSelection) {
    return 'editing';
  }
  
  // Long conversations might benefit from more focused context
  // but we default to full for general queries
  return 'full';
}

// ─────────────────────────────────────────────────────────────────────────────
// TOKEN ESTIMATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estimate token count from string (rough approximation)
 * Uses ~4 characters per token as a reasonable estimate
 */
export const estimateTokens = (text: string): number => {
  return Math.ceil(text.length / 4);
};

/**
 * Truncate text to fit within token budget
 */
const truncateToTokens = (text: string, maxTokens: number): string => {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  
  // Try to truncate at a natural break point
  const truncated = text.slice(0, maxChars);
  const lastNewline = truncated.lastIndexOf('\n');
  const lastPeriod = truncated.lastIndexOf('.');
  
  const breakPoint = Math.max(lastNewline, lastPeriod);
  if (breakPoint > maxChars * 0.8) {
    return truncated.slice(0, breakPoint + 1) + '\n[...truncated]';
  }
  
  return truncated + '...[truncated]';
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION BUILDERS
// ─────────────────────────────────────────────────────────────────────────────

const buildManuscriptSection = (state: AppBrainState, maxTokens: number): ContextSection => {
  const { manuscript, ui } = state;
  let content = '[MANUSCRIPT STATE]\n';
  
  content += `Project: ${manuscript.projectTitle}\n`;
  content += `Chapters: ${manuscript.chapters.length}\n`;
  
  const activeChapter = manuscript.chapters.find(c => c.id === manuscript.activeChapterId);
  if (activeChapter) {
    content += `Active Chapter: "${activeChapter.title}"\n`;
  }
  
  if (manuscript.setting) {
    content += `Setting: ${manuscript.setting.timePeriod}, ${manuscript.setting.location}\n`;
  }
  
  // Include selection if present
  if (ui.selection) {
    const previewText = ui.selection.text.length > 200 
      ? ui.selection.text.slice(0, 200) + '...' 
      : ui.selection.text;
    content += `\nSelected Text: "${previewText}"\n`;
    content += `Position: [${ui.selection.start}-${ui.selection.end}]\n`;
  }
  
  // Include surrounding context if budget allows
  const currentTokens = estimateTokens(content);
  if (currentTokens < maxTokens * 0.7 && manuscript.currentText) {
    const contextSize = Math.min(500, (maxTokens - currentTokens) * 4);
    const start = Math.max(0, ui.cursor.position - contextSize / 2);
    const end = Math.min(manuscript.currentText.length, ui.cursor.position + contextSize / 2);
    const surroundingText = manuscript.currentText.slice(start, end);
    content += `\nContext around cursor:\n"${surroundingText}"\n`;
  }
  
  return {
    name: 'manuscript',
    content: truncateToTokens(content, maxTokens),
    tokenCount: estimateTokens(content),
    priority: 1,
    truncatable: true,
  };
};

const buildIntelligenceSection = (state: AppBrainState, maxTokens: number): ContextSection => {
  const { intelligence, ui } = state;
  let content = '[INTELLIGENCE HUD]\n';
  
  if (!intelligence.hud) {
    content += 'Intelligence not yet processed.\n';
    return {
      name: 'intelligence',
      content,
      tokenCount: estimateTokens(content),
      priority: 2,
      truncatable: false,
    };
  }
  
  const hud = intelligence.hud;
  
  // Current scene context
  if (hud.situational.currentScene) {
    const scene = hud.situational.currentScene;
    content += `Scene: ${scene.type}`;
    if (scene.pov) content += `, POV: ${scene.pov}`;
    if (scene.location) content += `, Location: ${scene.location}`;
    content += `\n`;
  }
  
  content += `Tension: ${hud.situational.tensionLevel.toUpperCase()}\n`;
  content += `Pacing: ${hud.situational.pacing}\n`;
  content += `Progress: ${hud.situational.narrativePosition.percentComplete}% complete\n`;
  
  // Active entities (prioritized by token budget)
  const entityBudget = Math.floor(maxTokens * 0.3);
  if (hud.context.activeEntities.length > 0) {
    content += `\nActive Characters:\n`;
    for (const entity of hud.context.activeEntities.slice(0, 5)) {
      const line = `• ${entity.name} (${entity.type}) - ${entity.mentionCount} mentions\n`;
      if (estimateTokens(content + line) > entityBudget) break;
      content += line;
    }
  }
  
  // Priority issues (most important)
  if (hud.prioritizedIssues.length > 0) {
    content += `\nPriority Issues:\n`;
    for (const issue of hud.prioritizedIssues.slice(0, 3)) {
      const icon = issue.severity > 0.7 ? '🔴' : issue.severity > 0.4 ? '🟡' : '🟢';
      content += `${icon} ${issue.description}\n`;
    }
  }
  
  // Style alerts
  if (hud.styleAlerts.length > 0) {
    content += `\nStyle Alerts: ${hud.styleAlerts.slice(0, 3).join('; ')}\n`;
  }
  
  // Stats
  content += `\nStats: ${hud.stats.wordCount.toLocaleString()} words, ${hud.stats.dialoguePercent}% dialogue\n`;
  
  return {
    name: 'intelligence',
    content: truncateToTokens(content, maxTokens),
    tokenCount: estimateTokens(content),
    priority: 2,
    truncatable: true,
  };
};

const buildAnalysisSection = (state: AppBrainState, maxTokens: number): ContextSection => {
  const { analysis } = state;
  let content = '[ANALYSIS INSIGHTS]\n';
  
  if (!analysis.result) {
    content += 'No analysis available.\n';
    return {
      name: 'analysis',
      content,
      tokenCount: estimateTokens(content),
      priority: 3,
      truncatable: false,
    };
  }
  
  const result = analysis.result;
  
  if (result.summary) {
    content += `Summary: ${result.summary.slice(0, 200)}...\n`;
  }
  
  if (result.strengths.length > 0) {
    content += `Strengths: ${result.strengths.slice(0, 3).join(', ')}\n`;
  }
  
  if (result.weaknesses.length > 0) {
    content += `Weaknesses: ${result.weaknesses.slice(0, 3).join(', ')}\n`;
  }
  
  if (result.plotIssues.length > 0) {
    content += `\nPlot Issues (${result.plotIssues.length}):\n`;
    for (const issue of result.plotIssues.slice(0, 3)) {
      content += `• ${issue.issue}\n`;
    }
  }
  
  return {
    name: 'analysis',
    content: truncateToTokens(content, maxTokens),
    tokenCount: estimateTokens(content),
    priority: 3,
    truncatable: true,
  };
};

export const DEFAULT_BEDSIDE_NOTE_STALENESS_MS = 1000 * 60 * 60 * 6; // 6 hours

const buildBedsidePlanText = (
  analysis: AppBrainState['analysis']['result'],
  goals: AgentGoal[],
): string | null => {
  if (!analysis && goals.length === 0) {
    return null;
  }

  const lines: string[] = [];

  if (analysis) {
    if (analysis.summary) {
      lines.push(`Current story summary: ${analysis.summary.slice(0, 240)}`);
    }

    if (analysis.weaknesses && analysis.weaknesses.length > 0) {
      lines.push('Top concerns:');
      for (const weakness of analysis.weaknesses.slice(0, 3)) {
        lines.push(`- ${weakness}`);
      }
    }

    if (analysis.plotIssues && analysis.plotIssues.length > 0) {
      lines.push('Key plot issues to watch:');
      for (const issue of analysis.plotIssues.slice(0, 3)) {
        lines.push(`- ${issue.issue}`);
      }
    }
  }

  if (goals.length > 0) {
    lines.push('Active goals:');
    for (const goal of goals.slice(0, 3)) {
      const progressPart = typeof goal.progress === 'number' ? ` [${goal.progress}%]` : '';
      lines.push(`- ${goal.title}${progressPart}`);
    }
  }

  return lines.join('\n');
};

const ensureBedsideNoteExists = async (projectId: string): Promise<void> => {
  const existing = await getMemories({
    scope: 'project',
    projectId,
    type: 'plan',
    topicTags: [BEDSIDE_NOTE_TAG],
    limit: 1,
  });

  if (existing.length > 0) {
    return;
  }

  await createMemory({
    scope: 'project',
    projectId,
    type: 'plan',
    text:
      'Project planning notes for this manuscript. This note will be updated over time with key goals, concerns, and constraints.',
    topicTags: BEDSIDE_NOTE_DEFAULT_TAGS,
    importance: 0.85,
  });
};

const buildMemorySection = async (
  state: AppBrainState,
  projectId: string | null,
  maxTokens: number,
  relevance?: MemoryRelevanceOptions,
  bedsideNoteStalenessMs: number = DEFAULT_BEDSIDE_NOTE_STALENESS_MS,
): Promise<ContextSection> => {
  let content = '[AGENT MEMORY]\n';
  
  if (!projectId) {
    content += 'No project context for memory.\n';
    return {
      name: 'memory',
      content,
      tokenCount: estimateTokens(content),
      priority: 2,
      truncatable: false,
    };
  }
  
  try {
    await ensureBedsideNoteExists(projectId as string);

    const fetchMemories = () =>
      relevance && (relevance.activeEntityNames?.length || relevance.selectionKeywords?.length)
        ? getRelevantMemoriesForContext(projectId, relevance, { limit: 20 })
        : getMemoriesForContext(projectId, { limit: 20 });

    const goalsPromise = getActiveGoals(projectId);
    let memories = await fetchMemories();
    const goals = await goalsPromise;

    const bedsideNotes = memories.project.filter(note =>
      note.topicTags.includes(BEDSIDE_NOTE_TAG)
    );
    const firstBedsideNote = bedsideNotes[0];

    if (firstBedsideNote && firstBedsideNote.updatedAt) {
      const ageMs = Date.now() - firstBedsideNote.updatedAt;
      if (ageMs > bedsideNoteStalenessMs) {
        const planText = buildBedsidePlanText(state.analysis.result, goals);
        if (planText) {
          await evolveBedsideNote(projectId, planText, { changeReason: 'staleness_refresh' });
          memories = await fetchMemories();
        }
      }
    }

    const maxChars = maxTokens * 4;

    const refreshedBedsideNotes = memories.project.filter(note =>
      note.topicTags.includes(BEDSIDE_NOTE_TAG)
    );
    const otherProjectNotes = memories.project.filter(note =>
      !note.topicTags.includes(BEDSIDE_NOTE_TAG)
    );

    const prioritizedMemories = {
      author: memories.author,
      project: [...refreshedBedsideNotes, ...otherProjectNotes],
    };

    const formattedMemories = formatMemoriesForPrompt(prioritizedMemories, { 
      maxLength: Math.floor(maxChars * 0.7) 
    });
    if (formattedMemories) {
      content += formattedMemories + '\n';
    } else {
      content += 'No memories stored yet.\n';
    }
    
    const formattedGoals = formatGoalsForPrompt(goals);
    if (formattedGoals && estimateTokens(content + formattedGoals) < maxTokens) {
      content += '\n' + formattedGoals + '\n';
    }
  } catch (error) {
    content += 'Memory unavailable.\n';
  }
  
  return {
    name: 'memory',
    content: truncateToTokens(content, maxTokens),
    tokenCount: estimateTokens(content),
    priority: 2,
    truncatable: true,
  };
};

const buildLoreSection = (state: AppBrainState, maxTokens: number): ContextSection => {
  const { lore } = state;
  let content = '[LORE BIBLE]\n';
  
  if (lore.characters.length === 0 && lore.worldRules.length === 0) {
    content += 'No lore defined.\n';
    return {
      name: 'lore',
      content,
      tokenCount: estimateTokens(content),
      priority: 4,
      truncatable: false,
    };
  }
  
  if (lore.characters.length > 0) {
    content += `Characters (${lore.characters.length}):\n`;
    for (const char of lore.characters.slice(0, 5)) {
      content += `• ${char.name}: ${char.bio?.slice(0, 60) || 'No bio'}...\n`;
      if (estimateTokens(content) > maxTokens * 0.8) break;
    }
  }
  
  if (lore.worldRules.length > 0 && estimateTokens(content) < maxTokens * 0.7) {
    content += `\nWorld Rules (${lore.worldRules.length}):\n`;
    for (const rule of lore.worldRules.slice(0, 3)) {
      content += `• ${rule.slice(0, 80)}...\n`;
    }
  }
  
  return {
    name: 'lore',
    content: truncateToTokens(content, maxTokens),
    tokenCount: estimateTokens(content),
    priority: 4,
    truncatable: true,
  };
};

const buildHistorySection = (state: AppBrainState, maxTokens: number): ContextSection => {
  let content = '[RECENT ACTIVITY]\n';
  
  const recentEvents = eventBus.formatRecentEventsForAI(5);
  if (recentEvents) {
    content += recentEvents;
  } else {
    content += 'No recent events.\n';
  }
  
  if (state.session.lastAgentAction) {
    const action = state.session.lastAgentAction;
    content += `\nLast Action: ${action.type} - ${action.description}\n`;
    content += `Result: ${action.success ? 'Success' : 'Failed'}\n`;
  }
  
  return {
    name: 'history',
    content: truncateToTokens(content, maxTokens),
    tokenCount: estimateTokens(content),
    priority: 5,
    truncatable: true,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ADAPTIVE CONTEXT BUILDER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Options for buildAdaptiveContext
 */
export interface AdaptiveContextOptions {
  /** Token budget configuration */
  budget?: ContextBudget;
  /** Memory relevance filters */
  relevance?: MemoryRelevanceOptions;
  /** Enable scene-aware memory filtering (Smartness Upgrade) */
  sceneAwareMemory?: boolean;
  /** Maximum age for bedside-note before auto-refresh */
  bedsideNoteStalenessMs?: number;
}

/**
 * Build context with adaptive token budgeting
 */
export const buildAdaptiveContext = async (
  state: AppBrainState,
  projectId: string | null,
  options: AdaptiveContextOptions = {}
): Promise<AdaptiveContextResult> => {
  const {
    budget = DEFAULT_BUDGET,
    relevance,
    sceneAwareMemory = true,
    bedsideNoteStalenessMs = DEFAULT_BEDSIDE_NOTE_STALENESS_MS,
  } = options;
  const sectionsIncluded: string[] = [];
  const sectionsTruncated: string[] = [];
  const sectionsOmitted: string[] = [];
  
  // Apply scene-aware memory filtering if enabled (Smartness Upgrade)
  let effectiveRelevance = relevance;
  if (sceneAwareMemory) {
    const sceneContext = getSceneContextFromState(state);
    effectiveRelevance = buildSceneAwareRelevance(relevance || {}, sceneContext);
  }
  
  // Build all sections with their budgets
  const manuscriptSection = buildManuscriptSection(
    state, 
    Math.floor(budget.totalTokens * budget.sections.manuscript)
  );
  const intelligenceSection = buildIntelligenceSection(
    state, 
    Math.floor(budget.totalTokens * budget.sections.intelligence)
  );
  const analysisSection = buildAnalysisSection(
    state, 
    Math.floor(budget.totalTokens * budget.sections.analysis)
  );
  const memorySection = await buildMemorySection(
    state,
    projectId,
    Math.floor(budget.totalTokens * budget.sections.memory),
    effectiveRelevance,
    bedsideNoteStalenessMs
  );
  const loreSection = buildLoreSection(
    state, 
    Math.floor(budget.totalTokens * budget.sections.lore)
  );
  const historySection = buildHistorySection(
    state, 
    Math.floor(budget.totalTokens * budget.sections.history)
  );
  
  // Sort sections by priority
  const allSections = [
    manuscriptSection,
    intelligenceSection,
    analysisSection,
    memorySection,
    loreSection,
    historySection,
  ].sort((a, b) => a.priority - b.priority);
  
  // Assemble context within budget
  let context = '';
  let totalTokens = 0;
  
  for (const section of allSections) {
    if (totalTokens + section.tokenCount <= budget.totalTokens) {
      // Section fits entirely
      context += section.content + '\n';
      totalTokens += section.tokenCount;
      sectionsIncluded.push(section.name);
    } else if (section.truncatable && totalTokens < budget.totalTokens * 0.9) {
      // Truncate section to fit remaining budget
      const remainingTokens = budget.totalTokens - totalTokens;
      const truncated = truncateToTokens(section.content, remainingTokens);
      context += truncated + '\n';
      totalTokens += estimateTokens(truncated);
      sectionsTruncated.push(section.name);
    } else {
      // Omit section
      sectionsOmitted.push(section.name);
    }
  }
  
  return {
    context,
    tokenCount: totalTokens,
    sectionsIncluded,
    sectionsTruncated,
    sectionsOmitted,
    budget,
  };
};

/**
 * Select budget based on conversation context
 */
export const selectBudget = (
  conversationTurns: number,
  hasSelection: boolean,
  isVoiceMode: boolean,
  queryType?: 'editing' | 'analysis' | 'general'
): ContextBudget => {
  if (isVoiceMode) return VOICE_MODE_BUDGET;
  if (queryType === 'editing' || hasSelection) return EDITING_BUDGET;
  if (queryType === 'analysis') return DEEP_ANALYSIS_BUDGET;
  
  // Scale budget based on conversation depth
  if (conversationTurns > 10) {
    return {
      ...DEFAULT_BUDGET,
      totalTokens: DEFAULT_BUDGET.totalTokens * 0.7, // Reduce for long conversations
    };
  }
  
  return DEFAULT_BUDGET;
};
