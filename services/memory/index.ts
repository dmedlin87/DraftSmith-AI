// ────────────────────────────────────────────────────────────────────────────────
// Agent Memory Service
// Provides CRUD operations for agent memories and goals.
// ────────────────────────────────────────────────────────────────────────────────

import { db } from '../db';
import type {
  MemoryNote,
  MemoryScope,
  MemoryNoteType,
  AgentGoal,
  GoalStatus,
  WatchedEntity,
  CreateMemoryNoteInput,
  UpdateMemoryNoteInput,
  ListMemoryNotesParams,
  CreateGoalInput,
} from './types';

// Re-export types for convenience
export * from './types';

// ────────────────────────────────────────────────────────────────────────────────
// MEMORY NOTES
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Create a new memory note.
 * 
 * @throws Error if scope is 'project' but projectId is missing
 */
export async function createMemory(
  input: CreateMemoryNoteInput
): Promise<MemoryNote> {
  // Validate: project-scoped notes require projectId
  if (input.scope === 'project' && !input.projectId) {
    throw new Error('projectId is required for project-scoped memories');
  }

  const note: MemoryNote = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    ...input,
  };

  await db.memories.add(note);
  return note;
}

/**
 * Get memory notes with optional filters.
 * 
 * Supports filtering by scope, projectId, type, and tags.
 * Results are sorted by importance (desc) then createdAt (desc).
 * 
 * Optimization: Uses Dexie's Collection.filter() before toArray() to reduce
 * memory usage by filtering items as they are streamed from the DB.
 */
export async function getMemories(
  params: ListMemoryNotesParams = {}
): Promise<MemoryNote[]> {
  const { scope, projectId, type, topicTags, minImportance, limit } = params;

  let collection = db.memories.toCollection();

  // Apply filters using Dexie's query capabilities
  // For compound queries, we filter in stages

  // If both scope and projectId are specified, use compound index
  if (scope === 'project' && projectId) {
    collection = db.memories.where('[scope+projectId]').equals([scope, projectId]);
  } else if (scope) {
    collection = db.memories.where('scope').equals(scope);
  } else if (projectId) {
    collection = db.memories.where('projectId').equals(projectId);
  }

  // Apply filters via Collection.filter() BEFORE toArray()
  // This reduces memory usage by filtering during streaming rather than after
  if (type) {
    collection = collection.filter(note => note.type === type);
  }

  if (minImportance !== undefined) {
    collection = collection.filter(note => note.importance >= minImportance);
  }

  if (topicTags && topicTags.length > 0) {
    collection = collection.filter(note =>
      topicTags.every(tag => note.topicTags.includes(tag))
    );
  }

  // Now fetch the filtered results
  let results = await collection.toArray();

  // Sort by importance (desc) then createdAt (desc)
  results.sort((a, b) => {
    if (b.importance !== a.importance) {
      return b.importance - a.importance;
    }
    return b.createdAt - a.createdAt;
  });

  // Apply limit
  if (limit && limit > 0) {
    results = results.slice(0, limit);
  }

  return results;
}

/**
 * Get memories sorted oldest-first for consolidation operations.
 * This ensures old memories aren't stranded beyond batch limits.
 * 
 * @param sortBy - 'updatedAt' for decay (oldest updated), 'createdAt' for archival
 */
export async function getMemoriesForConsolidation(
  projectId: string,
  options: {
    sortBy?: 'updatedAt' | 'createdAt';
    maxImportance?: number;
    minAge?: number; // milliseconds
    limit?: number;
    offset?: number;
  } = {}
): Promise<MemoryNote[]> {
  const { 
    sortBy = 'updatedAt', 
    maxImportance,
    minAge,
    limit = 100,
    offset = 0,
  } = options;

  const now = Date.now();

  // Fetch all project memories
  let results = await db.memories
    .where('[scope+projectId]')
    .equals(['project', projectId])
    .toArray();

  // Filter by max importance (for archival targeting low-importance)
  if (maxImportance !== undefined) {
    results = results.filter(m => m.importance <= maxImportance);
  }

  // Filter by minimum age
  if (minAge !== undefined) {
    results = results.filter(m => {
      const age = now - (m.updatedAt || m.createdAt);
      return age >= minAge;
    });
  }

  // Sort oldest-first based on sortBy field
  results.sort((a, b) => {
    const aTime = sortBy === 'updatedAt' ? (a.updatedAt || a.createdAt) : a.createdAt;
    const bTime = sortBy === 'updatedAt' ? (b.updatedAt || b.createdAt) : b.createdAt;
    return aTime - bTime; // Ascending (oldest first)
  });

  // Apply offset and limit for pagination
  return results.slice(offset, offset + limit);
}

/**
 * Count total memories for a project (for pagination).
 */
export async function countProjectMemories(projectId: string): Promise<number> {
  return db.memories
    .where('[scope+projectId]')
    .equals(['project', projectId])
    .count();
}

/**
 * Get a single memory note by ID.
 */
export async function getMemory(id: string): Promise<MemoryNote | undefined> {
  return db.memories.get(id);
}

/**
 * Get all memories relevant for agent context building.
 * 
 * Returns both:
 * - All author-scoped memories (global preferences)
 * - All project-scoped memories for the given project
 * 
 * Sorted by importance (desc) then recency (desc).
 */
export async function getMemoriesForContext(
  projectId: string,
  options: { limit?: number } = {}
): Promise<{ author: MemoryNote[]; project: MemoryNote[] }> {
  const { limit = 50 } = options;

  // Fetch both scopes in parallel
  const [authorNotes, projectNotes] = await Promise.all([
    getMemories({ scope: 'author', limit }),
    getMemories({ scope: 'project', projectId, limit }),
  ]);

  return {
    author: authorNotes,
    project: projectNotes,
  };
}

/**
 * Options for filtering memories by relevance to current context.
 */
export interface MemoryRelevanceOptions {
  /** Names of currently active entities (characters, locations) */
  activeEntityNames?: string[];
  /** Keywords from current selection or query */
  selectionKeywords?: string[];
  /** Boost memories related to the active chapter */
  activeChapterId?: string;
}

/**
 * Get memories filtered by relevance to current context.
 * 
 * This is an enhanced version of getMemoriesForContext that:
 * - Always returns all author-scoped memories (global preferences)
 * - Filters project memories by relevance to active entities, selection, etc.
 * - Scores and sorts by relevance + importance
 * 
 * @param projectId - The project to get memories for
 * @param relevance - Context relevance filters
 * @param options - Limit and other options
 */
export async function getRelevantMemoriesForContext(
  projectId: string,
  relevance: MemoryRelevanceOptions = {},
  options: { limit?: number } = {}
): Promise<{ author: MemoryNote[]; project: MemoryNote[] }> {
  const { limit = 50 } = options;
  const { activeEntityNames = [], selectionKeywords = [], activeChapterId } = relevance;

  // Fetch author memories (always fully relevant)
  const authorNotes = await getMemories({ scope: 'author', limit });

  // Fetch all project memories, then filter by relevance
  const allProjectNotes = await getMemories({ scope: 'project', projectId });

  // If no relevance filters, return all (sorted by importance)
  if (activeEntityNames.length === 0 && selectionKeywords.length === 0) {
    return {
      author: authorNotes,
      project: allProjectNotes.slice(0, limit),
    };
  }

  // Normalize entity names and keywords for matching
  const normalizedEntities = activeEntityNames.map(e => e.toLowerCase());
  const normalizedKeywords = selectionKeywords.map(k => k.toLowerCase());

  // Score each memory by relevance
  const scoredNotes = allProjectNotes.map(note => {
    let relevanceScore = 0;

    // Check tag matches against entity names
    for (const tag of note.topicTags) {
      const normalizedTag = tag.toLowerCase();
      // Extract entity name from prefixed tags like "character:seth"
      const tagName = normalizedTag.includes(':') 
        ? normalizedTag.split(':')[1] 
        : normalizedTag;

      if (normalizedEntities.some(entity => 
        entity.includes(tagName) || tagName.includes(entity)
      )) {
        relevanceScore += 2; // Strong match for entity
      }
    }

    // Check text content against keywords
    const normalizedText = note.text.toLowerCase();
    for (const keyword of normalizedKeywords) {
      if (normalizedText.includes(keyword)) {
        relevanceScore += 1; // Moderate match for keyword
      }
    }

    // Boost high-importance notes
    relevanceScore += note.importance;

    return { note, relevanceScore };
  });

  // Filter to only relevant notes (score > 0) or fall back to all if nothing matches
  let relevantNotes = scoredNotes.filter(s => s.relevanceScore > 0);
  
  // If no relevant notes found, include top by importance anyway
  if (relevantNotes.length === 0) {
    relevantNotes = scoredNotes;
  }

  // Sort by relevance score (desc), then importance (desc), then recency (desc)
  relevantNotes.sort((a, b) => {
    if (b.relevanceScore !== a.relevanceScore) {
      return b.relevanceScore - a.relevanceScore;
    }
    if (b.note.importance !== a.note.importance) {
      return b.note.importance - a.note.importance;
    }
    return b.note.createdAt - a.note.createdAt;
  });

  return {
    author: authorNotes,
    project: relevantNotes.slice(0, limit).map(s => s.note),
  };
}

/**
 * Update an existing memory note.
 * 
 * @throws Error if note doesn't exist
 */
export async function updateMemory(
  id: string,
  updates: UpdateMemoryNoteInput
): Promise<MemoryNote> {
  const existing = await db.memories.get(id);
  if (!existing) {
    throw new Error(`Memory note not found: ${id}`);
  }

  const updated: MemoryNote = {
    ...existing,
    ...updates,
    updatedAt: Date.now(),
  };

  await db.memories.put(updated);
  return updated;
}

/**
 * Delete a memory note.
 */
export async function deleteMemory(id: string): Promise<void> {
  await db.memories.delete(id);
}

/**
 * Search memories by tags using multi-entry index.
 * 
 * Returns notes that have ANY of the specified tags.
 */
export async function searchMemoriesByTags(
  tags: string[],
  options: { projectId?: string; limit?: number } = {}
): Promise<MemoryNote[]> {
  const { projectId, limit = 20 } = options;

  // Use multi-entry index to find notes with any matching tag
  const matchingNotes = new Map<string, MemoryNote>();

  for (const tag of tags) {
    const notes = await db.memories.where('topicTags').equals(tag).toArray();
    for (const note of notes) {
      // Filter by projectId if specified (include author-scoped notes too)
      if (projectId && note.scope === 'project' && note.projectId !== projectId) {
        continue;
      }
      matchingNotes.set(note.id, note);
    }
  }

  // Convert to array and sort
  let results = Array.from(matchingNotes.values());
  results.sort((a, b) => {
    if (b.importance !== a.importance) {
      return b.importance - a.importance;
    }
    return b.createdAt - a.createdAt;
  });

  if (limit > 0) {
    results = results.slice(0, limit);
  }

  return results;
}

// ────────────────────────────────────────────────────────────────────────────────
// GOALS
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Create a new agent goal.
 */
export async function addGoal(input: CreateGoalInput): Promise<AgentGoal> {
  const goal: AgentGoal = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    progress: input.progress ?? 0,
    ...input,
  };

  await db.goals.add(goal);
  return goal;
}

/**
 * Update an existing goal.
 * 
 * @throws Error if goal doesn't exist
 */
export async function updateGoal(
  id: string,
  updates: Partial<Omit<AgentGoal, 'id' | 'createdAt'>>
): Promise<AgentGoal> {
  const existing = await db.goals.get(id);
  if (!existing) {
    throw new Error(`Goal not found: ${id}`);
  }

  const updated: AgentGoal = {
    ...existing,
    ...updates,
    updatedAt: Date.now(),
  };

  await db.goals.put(updated);
  return updated;
}

/**
 * Get all active goals for a project.
 */
export async function getActiveGoals(projectId: string): Promise<AgentGoal[]> {
  return db.goals
    .where('[projectId+status]')
    .equals([projectId, 'active'])
    .toArray()
    .catch(() => {
      // Fallback if compound index isn't available
      return db.goals
        .where('projectId')
        .equals(projectId)
        .filter(goal => goal.status === 'active')
        .toArray();
    });
}

/**
 * Get all goals for a project (any status).
 */
export async function getGoals(
  projectId: string,
  status?: GoalStatus
): Promise<AgentGoal[]> {
  let collection = db.goals.where('projectId').equals(projectId);

  if (status) {
    return collection.filter(goal => goal.status === status).toArray();
  }

  return collection.toArray();
}

/**
 * Get a single goal by ID.
 */
export async function getGoal(id: string): Promise<AgentGoal | undefined> {
  return db.goals.get(id);
}

/**
 * Delete a goal.
 */
export async function deleteGoal(id: string): Promise<void> {
  await db.goals.delete(id);
}

/**
 * Mark a goal as completed.
 */
export async function completeGoal(id: string): Promise<AgentGoal> {
  return updateGoal(id, { status: 'completed', progress: 100 });
}

/**
 * Abandon a goal.
 */
export async function abandonGoal(id: string): Promise<AgentGoal> {
  return updateGoal(id, { status: 'abandoned' });
}

// ────────────────────────────────────────────────────────────────────────────────
// WATCHED ENTITIES
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Add an entity to the watchlist.
 */
export async function addWatchedEntity(
  input: Omit<WatchedEntity, 'id' | 'createdAt'>
): Promise<WatchedEntity> {
  const entity: WatchedEntity = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    ...input,
    monitoringEnabled: input.monitoringEnabled ?? true,
  };

  await db.watchedEntities.add(entity);
  return entity;
}

/**
 * Get all watched entities for a project.
 */
export async function getWatchedEntities(projectId: string): Promise<WatchedEntity[]> {
  const entities = await db.watchedEntities.where('projectId').equals(projectId).toArray();
  return entities.map(entity => ({ ...entity, monitoringEnabled: entity.monitoringEnabled ?? true }));
}

/**
 * Update a watched entity.
 */
export async function updateWatchedEntity(
  id: string,
  updates: Partial<Omit<WatchedEntity, 'id' | 'createdAt'>>
): Promise<WatchedEntity> {
  const existing = await db.watchedEntities.get(id);
  if (!existing) {
    throw new Error(`Watched entity not found: ${id}`);
  }

  const updated: WatchedEntity = {
    ...existing,
    ...updates,
    monitoringEnabled: updates.monitoringEnabled ?? existing.monitoringEnabled ?? true,
  };

  await db.watchedEntities.put(updated);
  return updated;
}

/**
 * Remove an entity from the watchlist.
 */
export async function removeWatchedEntity(id: string): Promise<void> {
  await db.watchedEntities.delete(id);
}

/**
 * Check if an entity is being watched.
 */
export async function isEntityWatched(
  projectId: string,
  entityId: string
): Promise<boolean> {
  const entities = await getWatchedEntities(projectId);
  return entities.some(e => e.id === entityId);
}

// ────────────────────────────────────────────────────────────────────────────────
// CONTEXT FORMATTING
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Format memory notes into a string suitable for agent prompts.
 */
export function formatMemoriesForPrompt(
  memories: { author: MemoryNote[]; project: MemoryNote[] },
  options: { maxLength?: number } = {}
): string {
  const { maxLength = 2000 } = options;
  const lines: string[] = [];

  // Author preferences
  if (memories.author.length > 0) {
    lines.push('## Author Preferences');
    for (const note of memories.author) {
      const tags = note.topicTags.length > 0 ? ` [${note.topicTags.join(', ')}]` : '';
      lines.push(`- (${note.type})${tags}: ${note.text}`);
    }
    lines.push('');
  }

  // Project notes
  if (memories.project.length > 0) {
    lines.push('## Project Memory');
    for (const note of memories.project) {
      const tags = note.topicTags.length > 0 ? ` [${note.topicTags.join(', ')}]` : '';
      lines.push(`- (${note.type})${tags}: ${note.text}`);
    }
  }

  let result = lines.join('\n');

  // Truncate if too long
  if (result.length > maxLength) {
    result = result.slice(0, maxLength - 3) + '...';
  }

  return result;
}

/**
 * Format goals into a string suitable for agent prompts.
 */
export function formatGoalsForPrompt(goals: AgentGoal[]): string {
  if (goals.length === 0) return '';

  const lines = ['## Active Goals'];
  for (const goal of goals) {
    lines.push(`- [${goal.progress}%] ${goal.title}${goal.description ? `: ${goal.description}` : ''}`);
  }

  return lines.join('\n');
}

// ────────────────────────────────────────────────────────────────────────────────
// PROACTIVE SUGGESTIONS
// ────────────────────────────────────────────────────────────────────────────────

export * from './proactive';

// ────────────────────────────────────────────────────────────────────────────────
// AUTO-OBSERVATION
// ────────────────────────────────────────────────────────────────────────────────

export * from './autoObserver';

// ────────────────────────────────────────────────────────────────────────────────
// CONSOLIDATION & LIFECYCLE
// ────────────────────────────────────────────────────────────────────────────────

export * from './consolidation';

// ────────────────────────────────────────────────────────────────────────────────
// SESSION TRACKING
// ────────────────────────────────────────────────────────────────────────────────

export * from './sessionTracker';
export * from './sessionLifecycle';

// ────────────────────────────────────────────────────────────────────────────────
// ENHANCEMENT 3A: SEMANTIC DEDUPLICATION
// ────────────────────────────────────────────────────────────────────────────────

export * from './semanticDedup';

// ────────────────────────────────────────────────────────────────────────────────
// ENHANCEMENT 3B: MEMORY CHAINS
// ────────────────────────────────────────────────────────────────────────────────

export * from './chains';

// ────────────────────────────────────────────────────────────────────────────────
// ENHANCEMENT 3C: REALTIME TRIGGERS
// ────────────────────────────────────────────────────────────────────────────────

export * from './realtimeTriggers';

// ────────────────────────────────────────────────────────────────────────────────
// ENHANCEMENT 3D: GOAL DEPENDENCY GRAPH
// ────────────────────────────────────────────────────────────────────────────────

export * from './goalGraph';

// ────────────────────────────────────────────────────────────────────────────────
// ENHANCEMENT 4A: FACT EXTRACTION
// ────────────────────────────────────────────────────────────────────────────────

export * from './factExtractor';

// ────────────────────────────────────────────────────────────────────────────────
// ENHANCEMENT 5B: MEMORY CACHE
// ────────────────────────────────────────────────────────────────────────────────

export * from './cache';
