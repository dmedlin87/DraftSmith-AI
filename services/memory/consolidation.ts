/**
 * Memory Consolidation Service
 * 
 * Manages memory lifecycle including:
 * - Importance decay over time
 * - Merging similar memories
 * - Archiving stale memories
 * - Reinforcement when memories are used
 * 
 * This keeps the memory system efficient and relevant.
 */

import { db } from '../db';
import { MemoryNote, AgentGoal } from './types';
import { updateMemory, deleteMemory, getMemories } from './index';

// ──────────────────────────────────────────────────────────────────────────────
// TYPES
// ──────────────────────────────────────────────────────────────────────────────

export interface ConsolidationOptions {
  projectId: string;
  /** Days before memories start decaying (default: 7) */
  decayStartDays?: number;
  /** Importance reduction per day after decay starts (default: 0.02) */
  decayRate?: number;
  /** Minimum importance before archival (default: 0.1) */
  archiveThreshold?: number;
  /** Text similarity threshold for merging (0-1, default: 0.7) */
  mergeThreshold?: number;
  /** Maximum memories to process per batch (default: 100) */
  batchSize?: number;
  /** Dry run - don't actually modify memories */
  dryRun?: boolean;
}

export interface ConsolidationResult {
  decayed: number;
  merged: number;
  archived: number;
  reinforced: number;
  errors: string[];
  duration: number;
}

export interface ReinforcementEvent {
  memoryId: string;
  reason: 'searched' | 'suggested' | 'referenced' | 'manual';
  boostAmount?: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// TEXT SIMILARITY
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Calculate Jaccard similarity between two strings
 * Returns value between 0 (no overlap) and 1 (identical)
 */
function jaccardSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  
  if (words1.size === 0 && words2.size === 0) return 1;
  if (words1.size === 0 || words2.size === 0) return 0;
  
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}

/**
 * Check if two memories have significant tag overlap
 */
function hasTagOverlap(tags1: string[], tags2: string[]): boolean {
  if (tags1.length === 0 || tags2.length === 0) return false;
  
  const set1 = new Set(tags1);
  const overlap = tags2.filter(t => set1.has(t));
  
  // At least 50% of smaller tag set must overlap
  const minSize = Math.min(tags1.length, tags2.length);
  return overlap.length >= minSize * 0.5;
}

// ──────────────────────────────────────────────────────────────────────────────
// IMPORTANCE DECAY
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Apply importance decay to old memories
 * Memories that haven't been reinforced lose importance over time
 */
export async function applyImportanceDecay(
  options: ConsolidationOptions
): Promise<{ decayed: number; errors: string[] }> {
  const {
    projectId,
    decayStartDays = 7,
    decayRate = 0.02,
    archiveThreshold = 0.1,
    batchSize = 100,
    dryRun = false,
  } = options;

  const result = { decayed: 0, errors: [] as string[] };
  const now = Date.now();
  const decayStartMs = decayStartDays * 24 * 60 * 60 * 1000;

  // Get memories for this project
  const memories = await getMemories({
    scope: 'project',
    projectId,
    limit: batchSize,
  });

  for (const memory of memories) {
    // Calculate age
    const lastUpdated = memory.updatedAt || memory.createdAt;
    const age = now - lastUpdated;
    
    // Skip if not old enough to decay
    if (age < decayStartMs) continue;
    
    // Calculate decay amount
    const daysOld = Math.floor((age - decayStartMs) / (24 * 60 * 60 * 1000));
    const decay = daysOld * decayRate;
    const newImportance = Math.max(archiveThreshold, memory.importance - decay);
    
    // Skip if no meaningful change
    if (Math.abs(newImportance - memory.importance) < 0.01) continue;
    
    if (!dryRun) {
      try {
        await updateMemory(memory.id, { 
          importance: newImportance,
          updatedAt: now, // Update timestamp to track decay
        });
        result.decayed++;
      } catch (e) {
        result.errors.push(`Failed to decay memory ${memory.id}: ${e}`);
      }
    } else {
      result.decayed++;
    }
  }

  return result;
}

// ──────────────────────────────────────────────────────────────────────────────
// MEMORY MERGING
// ──────────────────────────────────────────────────────────────────────────────

interface MergeCandidate {
  memory1: MemoryNote;
  memory2: MemoryNote;
  similarity: number;
}

/**
 * Find pairs of memories that could be merged
 */
async function findMergeCandidates(
  projectId: string,
  threshold: number,
  limit: number
): Promise<MergeCandidate[]> {
  const memories = await getMemories({
    scope: 'project',
    projectId,
    limit,
  });

  const candidates: MergeCandidate[] = [];

  // Compare each pair (O(n²) but limited by batch size)
  for (let i = 0; i < memories.length; i++) {
    for (let j = i + 1; j < memories.length; j++) {
      const m1 = memories[i];
      const m2 = memories[j];
      
      // Must be same type to merge
      if (m1.type !== m2.type) continue;
      
      // Check tag overlap first (cheaper)
      if (!hasTagOverlap(m1.topicTags, m2.topicTags)) continue;
      
      // Check text similarity
      const similarity = jaccardSimilarity(m1.text, m2.text);
      
      if (similarity >= threshold) {
        candidates.push({ memory1: m1, memory2: m2, similarity });
      }
    }
  }

  // Sort by similarity (highest first)
  candidates.sort((a, b) => b.similarity - a.similarity);

  return candidates;
}

/**
 * Merge similar memories into consolidated notes
 */
export async function mergeSimikarMemories(
  options: ConsolidationOptions
): Promise<{ merged: number; errors: string[] }> {
  const {
    projectId,
    mergeThreshold = 0.7,
    batchSize = 50,
    dryRun = false,
  } = options;

  const result = { merged: 0, errors: [] as string[] };

  const candidates = await findMergeCandidates(projectId, mergeThreshold, batchSize);
  const mergedIds = new Set<string>();

  for (const { memory1, memory2 } of candidates) {
    // Skip if either already merged
    if (mergedIds.has(memory1.id) || mergedIds.has(memory2.id)) continue;

    // Keep the more important one, merge text if needed
    const [keep, remove] = memory1.importance >= memory2.importance 
      ? [memory1, memory2] 
      : [memory2, memory1];

    // Combine tags (deduplicate)
    const combinedTags = [...new Set([...keep.topicTags, ...remove.topicTags])];
    
    // Boost importance slightly for merged memory
    const boostedImportance = Math.min(1, keep.importance + 0.05);
    
    // Append note about merged content if texts differ significantly
    let mergedText = keep.text;
    if (jaccardSimilarity(keep.text, remove.text) < 0.9) {
      mergedText += `\n[Merged: ${remove.text.slice(0, 100)}...]`;
    }

    if (!dryRun) {
      try {
        // Update the kept memory
        await updateMemory(keep.id, {
          text: mergedText,
          topicTags: combinedTags,
          importance: boostedImportance,
          updatedAt: Date.now(),
        });

        // Delete the removed memory
        await deleteMemory(remove.id);

        mergedIds.add(remove.id);
        result.merged++;
      } catch (e) {
        result.errors.push(`Failed to merge ${keep.id} + ${remove.id}: ${e}`);
      }
    } else {
      mergedIds.add(remove.id);
      result.merged++;
    }
  }

  return result;
}

// ──────────────────────────────────────────────────────────────────────────────
// ARCHIVAL
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Archive (delete) memories below importance threshold
 * Only archives memories that are old enough
 */
export async function archiveStaleMemories(
  options: ConsolidationOptions
): Promise<{ archived: number; errors: string[] }> {
  const {
    projectId,
    archiveThreshold = 0.1,
    decayStartDays = 7,
    batchSize = 100,
    dryRun = false,
  } = options;

  const result = { archived: 0, errors: [] as string[] };
  const now = Date.now();
  const minAge = decayStartDays * 24 * 60 * 60 * 1000;

  // Get low-importance memories
  const memories = await getMemories({
    scope: 'project',
    projectId,
    limit: batchSize,
  });

  const toArchive = memories.filter(m => {
    const age = now - m.createdAt;
    return m.importance <= archiveThreshold && age > minAge;
  });

  for (const memory of toArchive) {
    if (!dryRun) {
      try {
        await deleteMemory(memory.id);
        result.archived++;
      } catch (e) {
        result.errors.push(`Failed to archive memory ${memory.id}: ${e}`);
      }
    } else {
      result.archived++;
    }
  }

  return result;
}

// ──────────────────────────────────────────────────────────────────────────────
// REINFORCEMENT
// ──────────────────────────────────────────────────────────────────────────────

const BOOST_AMOUNTS: Record<ReinforcementEvent['reason'], number> = {
  searched: 0.05,
  suggested: 0.03,
  referenced: 0.1,
  manual: 0.15,
};

/**
 * Reinforce a memory when it's used
 * Increases importance and resets decay timer
 */
export async function reinforceMemory(
  event: ReinforcementEvent
): Promise<boolean> {
  const { memoryId, reason, boostAmount } = event;
  
  try {
    const memory = await db.memories.get(memoryId);
    if (!memory) return false;
    
    const boost = boostAmount ?? BOOST_AMOUNTS[reason];
    const newImportance = Math.min(1, memory.importance + boost);
    
    await updateMemory(memoryId, {
      importance: newImportance,
      updatedAt: Date.now(), // Reset decay timer
    });
    
    return true;
  } catch (e) {
    console.error(`[consolidation] Failed to reinforce memory ${memoryId}:`, e);
    return false;
  }
}

/**
 * Reinforce multiple memories at once
 */
export async function reinforceMemories(
  events: ReinforcementEvent[]
): Promise<{ reinforced: number; failed: number }> {
  let reinforced = 0;
  let failed = 0;
  
  for (const event of events) {
    const success = await reinforceMemory(event);
    if (success) reinforced++;
    else failed++;
  }
  
  return { reinforced, failed };
}

// ──────────────────────────────────────────────────────────────────────────────
// FULL CONSOLIDATION
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Run full consolidation process
 * Should be called periodically (e.g., on app startup or daily)
 */
export async function runConsolidation(
  options: ConsolidationOptions
): Promise<ConsolidationResult> {
  const startTime = Date.now();
  const result: ConsolidationResult = {
    decayed: 0,
    merged: 0,
    archived: 0,
    reinforced: 0,
    errors: [],
    duration: 0,
  };

  console.log(`[consolidation] Starting for project ${options.projectId}...`);

  // 1. Apply importance decay
  const decayResult = await applyImportanceDecay(options);
  result.decayed = decayResult.decayed;
  result.errors.push(...decayResult.errors);

  // 2. Merge similar memories
  const mergeResult = await mergeSimikarMemories(options);
  result.merged = mergeResult.merged;
  result.errors.push(...mergeResult.errors);

  // 3. Archive stale memories
  const archiveResult = await archiveStaleMemories(options);
  result.archived = archiveResult.archived;
  result.errors.push(...archiveResult.errors);

  result.duration = Date.now() - startTime;

  console.log(
    `[consolidation] Complete: ` +
    `${result.decayed} decayed, ${result.merged} merged, ${result.archived} archived ` +
    `(${result.duration}ms, ${result.errors.length} errors)`
  );

  return result;
}

// ──────────────────────────────────────────────────────────────────────────────
// GOAL LIFECYCLE
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Archive completed or abandoned goals older than threshold
 */
export async function archiveOldGoals(
  projectId: string,
  options: { maxAgeDays?: number; dryRun?: boolean } = {}
): Promise<{ archived: number }> {
  const { maxAgeDays = 30, dryRun = false } = options;
  const cutoff = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);

  const goals = await db.goals
    .where('projectId')
    .equals(projectId)
    .filter(g => 
      (g.status === 'completed' || g.status === 'abandoned') &&
      g.createdAt < cutoff
    )
    .toArray();

  if (!dryRun) {
    await db.goals.bulkDelete(goals.map(g => g.id));
  }

  return { archived: goals.length };
}

/**
 * Get statistics about memory health
 */
export async function getMemoryHealthStats(
  projectId: string
): Promise<{
  totalMemories: number;
  avgImportance: number;
  lowImportanceCount: number;
  oldMemoriesCount: number;
  activeGoals: number;
  completedGoals: number;
}> {
  const memories = await getMemories({ scope: 'project', projectId, limit: 1000 });
  const goals = await db.goals.where('projectId').equals(projectId).toArray();
  
  const now = Date.now();
  const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);

  return {
    totalMemories: memories.length,
    avgImportance: memories.length > 0 
      ? memories.reduce((sum, m) => sum + m.importance, 0) / memories.length 
      : 0,
    lowImportanceCount: memories.filter(m => m.importance < 0.3).length,
    oldMemoriesCount: memories.filter(m => m.createdAt < sevenDaysAgo).length,
    activeGoals: goals.filter(g => g.status === 'active').length,
    completedGoals: goals.filter(g => g.status === 'completed').length,
  };
}
