/**
 * Proactive Memory Suggestions Service
 * 
 * Monitors user activity and surfaces relevant memories proactively.
 * Integrates with the event bus to respond to chapter switches,
 * cursor movements, and other navigation events.
 */

import { WatchedEntity, MemoryNote, AgentGoal } from './types';
import {
  searchMemoriesByTags,
  getActiveGoals,
  getGoalsCached,
  getMemoriesCached,
} from './index';
import { db } from '../db';

// ──────────────────────────────────────────────────────────────────────────────
// TYPES
// ──────────────────────────────────────────────────────────────────────────────

export interface ProactiveSuggestion {
  id: string;
  type: 'watched_entity' | 'related_memory' | 'active_goal' | 'reminder';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  /** The entity or memory that triggered this suggestion */
  source: {
    type: 'entity' | 'memory' | 'goal';
    id: string;
    name?: string;
  };
  /** Suggested action the agent could take */
  suggestedAction?: string;
  /** Tags for filtering/grouping */
  tags: string[];
  /** When this suggestion was generated */
  createdAt: number;
}

export interface ChapterContext {
  chapterId: string;
  chapterTitle: string;
  /** Characters/entities mentioned in this chapter */
  mentionedEntities?: string[];
  /** Text content for entity detection */
  content?: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// ENTITY DETECTION
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Extract potential character names and entities from text
 * Uses simple heuristics (capitalized words, dialogue attribution)
 */
export function extractEntitiesFromText(text: string): string[] {
  const entities = new Set<string>();
  
  // Match dialogue attribution patterns: "said John", "asked Mary"
  const dialoguePattern = /(?:said|asked|replied|whispered|shouted|murmured|exclaimed)\s+([A-Z][a-z]+)/g;
  let match: RegExpExecArray | null;
  while ((match = dialoguePattern.exec(text)) !== null) {
    if (match[1]) {
      entities.add(match[1].toLowerCase());
    }
  }
  
  // Match capitalized words that appear multiple times (likely character names)
  const capitalizedWords = text.match(/\b[A-Z][a-z]{2,}\b/g) || [];
  const wordCounts = new Map<string, number>();
  capitalizedWords.forEach(word => {
    const lower = word.toLowerCase();
    wordCounts.set(lower, (wordCounts.get(lower) || 0) + 1);
  });
  
  // Add words that appear 3+ times
  wordCounts.forEach((count, word) => {
    if (count >= 3) {
      entities.add(word);
    }
  });
  
  return Array.from(entities);
}

// ──────────────────────────────────────────────────────────────────────────────
// SUGGESTION GENERATION
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Check if any watched entities are present in the given chapter
 */
export async function getWatchedEntitiesInChapter(
  projectId: string,
  chapterContext: ChapterContext
): Promise<WatchedEntity[]> {
  // Use a fresh read of watched entities to avoid stale cache data
  const watchedEntities = await db.watchedEntities.where('projectId').equals(projectId).toArray();
  
  if (watchedEntities.length === 0) return [];
  
  // Get entities mentioned in chapter
  const mentionedEntities = chapterContext.mentionedEntities || 
    (chapterContext.content ? extractEntitiesFromText(chapterContext.content) : []);
  
  if (mentionedEntities.length === 0) return [];
  
  // Find matches (case-insensitive)
  const mentionedLower = new Set(mentionedEntities.map(e => e.toLowerCase()));
  
  return watchedEntities.filter(entity => 
    mentionedLower.has(entity.name.toLowerCase())
  );
}

/**
 * Get memories related to entities in the current chapter
 */
export async function getRelatedMemories(
  projectId: string,
  entityNames: string[],
  options: { limit?: number } = {}
): Promise<MemoryNote[]> {
  const { limit = 10 } = options;
  
  if (entityNames.length === 0) return [];
  
  // Build character tags
  const characterTags = entityNames.map(name => `character:${name.toLowerCase()}`);
  
  // Search for memories with these tags
  const memories = await searchMemoriesByTags(characterTags, {
    projectId,
    limit,
  });
  
  return memories;
}

/**
 * Generate proactive suggestions based on current chapter context
 */
export async function generateSuggestionsForChapter(
  projectId: string,
  chapterContext: ChapterContext
): Promise<ProactiveSuggestion[]> {
  const suggestions: ProactiveSuggestion[] = [];
  const now = Date.now();
  
  // 1. Check for watched entities
  const watchedInChapter = await getWatchedEntitiesInChapter(projectId, chapterContext);
  
  for (const entity of watchedInChapter) {
    suggestions.push({
      id: `watched-${entity.id}-${now}`,
      type: 'watched_entity',
      priority: entity.priority as 'high' | 'medium' | 'low',
      title: `${entity.name} appears in this chapter`,
      description: entity.reason || `You're watching "${entity.name}" for this project.`,
      source: {
        type: 'entity',
        id: entity.id,
        name: entity.name,
      },
      suggestedAction: `search_memory with tags=['character:${entity.name.toLowerCase()}']`,
      tags: [`character:${entity.name.toLowerCase()}`],
      createdAt: now,
    });
  }
  
  // 2. Get related memories for entities in chapter
  const mentionedEntities = chapterContext.mentionedEntities || 
    (chapterContext.content ? extractEntitiesFromText(chapterContext.content) : []);
  
  const relatedMemories = await getRelatedMemories(projectId, mentionedEntities, { limit: 5 });
  
  for (const memory of relatedMemories) {
    // Skip if this is a low-importance observation
    if (memory.type === 'observation' && memory.importance < 0.5) continue;
    
    suggestions.push({
      id: `memory-${memory.id}-${now}`,
      type: 'related_memory',
      priority: memory.importance > 0.7 ? 'high' : memory.importance > 0.4 ? 'medium' : 'low',
      title: `Relevant note: ${memory.type}`,
      description: memory.text.slice(0, 150) + (memory.text.length > 150 ? '...' : ''),
      source: {
        type: 'memory',
        id: memory.id,
      },
      tags: memory.topicTags,
      createdAt: now,
    });
  }
  
  // 3. Check for active goals related to this chapter (always fetch fresh to avoid stale cache)
  const activeGoals = await getActiveGoals(projectId);
  
  for (const goal of activeGoals) {
    // Check if goal mentions chapter or any entities in it
    const goalLower = (goal.title + ' ' + (goal.description || '')).toLowerCase();
    const chapterTitleLower = chapterContext.chapterTitle.toLowerCase();
    
    const isRelevant = goalLower.includes(chapterTitleLower) ||
      mentionedEntities.some(entity => goalLower.includes(entity.toLowerCase()));
    
    if (isRelevant) {
      suggestions.push({
        id: `goal-${goal.id}-${now}`,
        type: 'active_goal',
        priority: goal.progress < 25 ? 'high' : goal.progress < 75 ? 'medium' : 'low',
        title: `Goal: ${goal.title}`,
        description: goal.description || `Progress: ${goal.progress}%`,
        source: {
          type: 'goal',
          id: goal.id,
        },
        suggestedAction: `update_goal with id='${goal.id}'`,
        tags: [],
        createdAt: now,
      });
    }
  }
  
  // Sort by priority (high first) then by creation time
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  suggestions.sort((a, b) => {
    const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pDiff !== 0) return pDiff;
    return b.createdAt - a.createdAt;
  });
  
  // Limit total suggestions
  return suggestions.slice(0, 5);
}

// ──────────────────────────────────────────────────────────────────────────────
// SUGGESTION HOOKS
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Create a callback for chapter switch events
 */
export function createChapterSwitchHandler(
  projectId: string,
  onSuggestions: (suggestions: ProactiveSuggestion[]) => void
) {
  return async (chapterId: string, chapterTitle: string, content?: string) => {
    const suggestions = await generateSuggestionsForChapter(projectId, {
      chapterId,
      chapterTitle,
      content,
    });
    
    if (suggestions.length > 0) {
      onSuggestions(suggestions);
    }
  };
}

/**
 * Check if user should be reminded about important memories
 * Call this periodically or on specific triggers
 */
export async function getImportantReminders(
  projectId: string
): Promise<ProactiveSuggestion[]> {
  const reminders: ProactiveSuggestion[] = [];
  const now = Date.now();
  
  // Get high-importance unresolved issues from the latest project memories
  // Use the cache to avoid repeated Dexie lookups during rapid polling
  const projectMemories = await getMemoriesCached(projectId, { limit: 100 });
  const issues = projectMemories
    .filter(m => m.type === 'issue' && m.importance >= 0.7)
    .slice(0, 5);
  
  for (const issue of issues) {
    reminders.push({
      id: `reminder-${issue.id}-${now}`,
      type: 'reminder',
      priority: 'high',
      title: 'Unresolved issue',
      description: issue.text.slice(0, 150),
      source: {
        type: 'memory',
        id: issue.id,
      },
      tags: issue.topicTags,
      createdAt: now,
    });
  }
  
  // Get stalled goals (active but low progress for a while) from the latest records
  const goals = await getGoalsCached(projectId, { forceRefresh: false });
  const oneDayAgo = now - (24 * 60 * 60 * 1000);
  
  for (const goal of goals) {
    // Goal is stalled if created more than a day ago with < 25% progress
    if (goal.createdAt < oneDayAgo && goal.progress < 25) {
      reminders.push({
        id: `stalled-goal-${goal.id}-${now}`,
        type: 'reminder',
        priority: 'medium',
        title: `Stalled goal: ${goal.title}`,
        description: `Started ${Math.floor((now - goal.createdAt) / (24 * 60 * 60 * 1000))} days ago, still at ${goal.progress}%`,
        source: {
          type: 'goal',
          id: goal.id,
        },
        suggestedAction: `update_goal with id='${goal.id}'`,
        tags: [],
        createdAt: now,
      });
    }
  }
  
  return reminders;
}
