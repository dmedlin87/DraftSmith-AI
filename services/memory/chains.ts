/**
 * Memory Chains (Enhancement 3B)
 * 
 * Links memories that evolve over time, enabling the agent to track
 * how facts change (e.g., "Will and Sarah are friends" → "Will and Sarah are engaged").
 */

import { db } from '../db';
import {
  MemoryNote,
  UpdateMemoryNoteInput,
  BEDSIDE_NOTE_TAG,
  BEDSIDE_NOTE_DEFAULT_TAGS,
  BedsideNoteContent,
} from './types';
import { createMemory, getMemory, updateMemory, getMemories } from './index';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface MemoryChain {
  chainId: string;
  topic: string;
  memories: ChainedMemory[];
  createdAt: number;
  updatedAt: number;
}

export interface ChainedMemory {
  memoryId: string;
  version: number;
  text: string;
  timestamp: number;
  changeType: 'initial' | 'update' | 'correction' | 'supersede';
  changeReason?: string;
}

export interface ChainMetadata {
  chainId: string;
  version: number;
  supersedes?: string; // Previous memory ID
  supersededBy?: string; // Next memory ID
}

// ─────────────────────────────────────────────────────────────────────────────
// CHAIN CREATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new memory chain starting with an initial memory
 */
export const createMemoryChain = async (
  initialMemoryId: string,
  topic?: string
): Promise<string> => {
  const memory = await getMemory(initialMemoryId);
  if (!memory) {
    throw new Error(`Memory not found: ${initialMemoryId}`);
  }
  
  const chainId = `chain_${crypto.randomUUID()}`;
  
  // Store chain metadata in the memory
  await updateMemory(initialMemoryId, {
    // Store chain info in a way that doesn't break existing schema
    // We'll use topicTags to store chain reference
    topicTags: [
      ...memory.topicTags.filter(t => !t.startsWith('chain:')),
      `chain:${chainId}`,
      `chain_version:1`,
    ],
  });
  
  return chainId;
};

/**
 * Add a new version to an existing memory chain
 */
export const evolveMemory = async (
  memoryId: string,
  newText: string,
  options: {
    changeType?: ChainedMemory['changeType'];
    changeReason?: string;
    keepOriginal?: boolean;
    structuredContent?: Record<string, unknown>;
  } = {}
): Promise<MemoryNote> => {
  const {
    changeType = 'update',
    changeReason,
    keepOriginal = true,
  } = options;
  
  const existing = await getMemory(memoryId);
  if (!existing) {
    throw new Error(`Memory not found: ${memoryId}`);
  }
  
  // Extract chain info from tags
  const chainTag = existing.topicTags.find(t => t.startsWith('chain:'));
  const versionTag = existing.topicTags.find(t => t.startsWith('chain_version:'));
  
  let chainId: string;
  let version: number;
  
  if (chainTag) {
    chainId = chainTag.replace('chain:', '');
    version = versionTag ? parseInt(versionTag.replace('chain_version:', '')) + 1 : 2;
  } else {
    // Create new chain
    chainId = `chain_${crypto.randomUUID()}`;
    version = 2;
    
    // Update original to be version 1
    await updateMemory(memoryId, {
      topicTags: [
        ...existing.topicTags,
        `chain:${chainId}`,
        `chain_version:1`,
      ],
    });
  }
  
  // Create new memory with chain reference
  const newMemory = await createMemory({
    text: newText,
    type: existing.type,
    scope: existing.scope,
    projectId: existing.projectId,
    topicTags: [
      ...existing.topicTags.filter(t => !t.startsWith('chain_version:')),
      `chain:${chainId}`,
      `chain_version:${version}`,
      `supersedes:${memoryId}`,
      ...(changeReason ? [`change_reason:${changeReason}`] : []),
    ],
    importance: existing.importance,
    structuredContent: options.structuredContent ?? existing.structuredContent,
  });
  
  // Mark original as superseded
  if (!keepOriginal) {
    await updateMemory(memoryId, {
      importance: Math.max(0.1, existing.importance - 0.3), // Reduce importance
      topicTags: [
        ...existing.topicTags,
        `superseded_by:${newMemory.id}`,
      ],
    });
  }
  
  return newMemory;
};

export const getOrCreateBedsideNote = async (
  projectId: string,
): Promise<MemoryNote> => {
  const existing = await getMemories({
    scope: 'project',
    projectId,
    type: 'plan',
    topicTags: [BEDSIDE_NOTE_TAG],
    limit: 1,
  });

  if (existing.length > 0) {
    return existing[0];
  }

  return createMemory({
    scope: 'project',
    projectId,
    type: 'plan',
    text:
      'Project planning notes for this manuscript. This note will be updated over time with key goals, concerns, and constraints.',
    topicTags: BEDSIDE_NOTE_DEFAULT_TAGS,
    importance: 0.85,
  });
};

export const evolveBedsideNote = async (
  projectId: string,
  newText: string,
  options: { changeReason?: string; structuredContent?: BedsideNoteContent } = {},
): Promise<MemoryNote> => {
  const base = await getOrCreateBedsideNote(projectId);
  return evolveMemory(base.id, newText, {
    changeType: 'update',
    changeReason: options.changeReason,
    keepOriginal: true,
    structuredContent: options.structuredContent,
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// CHAIN RETRIEVAL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get all memories in a chain, ordered by version
 */
export const getMemoryChain = async (
  chainIdOrMemoryId: string
): Promise<ChainedMemory[]> => {
  let chainId = chainIdOrMemoryId;
  
  // If given a memory ID, find its chain
  if (!chainIdOrMemoryId.startsWith('chain_')) {
    const memory = await getMemory(chainIdOrMemoryId);
    if (!memory) return [];
    
    const chainTag = memory.topicTags.find(t => t.startsWith('chain:'));
    if (!chainTag) return [];
    
    chainId = chainTag.replace('chain:', '');
  }
  
  // Find all memories with this chain ID
  const allMemories = await db.memories
    .filter(m => m.topicTags.some(t => t === `chain:${chainId}`))
    .toArray();
  
  // Parse and sort by version
  const chainedMemories: ChainedMemory[] = allMemories.map(m => {
    const versionTag = m.topicTags.find(t => t.startsWith('chain_version:'));
    const version = versionTag ? parseInt(versionTag.replace('chain_version:', '')) : 1;
    
    const supersedesTag = m.topicTags.find(t => t.startsWith('supersedes:'));
    const changeReasonTag = m.topicTags.find(t => t.startsWith('change_reason:'));
    
    let changeType: ChainedMemory['changeType'] = version === 1 ? 'initial' : 'update';
    if (changeReasonTag?.includes('correction')) changeType = 'correction';
    if (supersedesTag) changeType = 'supersede';
    
    return {
      memoryId: m.id,
      version,
      text: m.text,
      timestamp: m.createdAt,
      changeType,
      changeReason: changeReasonTag?.replace('change_reason:', ''),
    };
  });
  
  return chainedMemories.sort((a, b) => a.version - b.version);
};

/**
 * Get the latest memory in a chain
 */
export const getLatestInChain = async (
  memoryId: string
): Promise<MemoryNote | null> => {
  const chain = await getMemoryChain(memoryId);
  if (chain.length === 0) return null;
  
  const latest = chain[chain.length - 1];
  return getMemory(latest.memoryId);
};

/**
 * Check if a memory has been superseded
 */
export const isSuperseded = (memory: MemoryNote): boolean => {
  return memory.topicTags.some(t => t.startsWith('superseded_by:'));
};

/**
 * Get the successor of a superseded memory
 */
export const getSuccessor = async (
  memoryId: string
): Promise<MemoryNote | null> => {
  const memory = await getMemory(memoryId);
  if (!memory) return null;
  
  const supersededTag = memory.topicTags.find(t => t.startsWith('superseded_by:'));
  if (!supersededTag) return null;
  
  const successorId = supersededTag.replace('superseded_by:', '');
  return getMemory(successorId);
};

// ─────────────────────────────────────────────────────────────────────────────
// CHAIN ANALYSIS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get a summary of how a memory chain evolved
 */
export const getChainEvolution = async (
  memoryId: string
): Promise<{
  topic: string;
  versions: number;
  timeline: Array<{ version: number; summary: string; timestamp: number }>;
  currentText: string;
}> => {
  const chain = await getMemoryChain(memoryId);
  
  if (chain.length === 0) {
    const memory = await getMemory(memoryId);
    return {
      topic: memory?.text.slice(0, 50) || 'Unknown',
      versions: 1,
      timeline: [{
        version: 1,
        summary: memory?.text || '',
        timestamp: memory?.createdAt || Date.now(),
      }],
      currentText: memory?.text || '',
    };
  }
  
  return {
    topic: chain[0].text.slice(0, 50) + '...',
    versions: chain.length,
    timeline: chain.map(c => ({
      version: c.version,
      summary: c.changeType === 'initial' 
        ? `Initial: ${c.text.slice(0, 100)}`
        : `${c.changeType}: ${c.text.slice(0, 100)}`,
      timestamp: c.timestamp,
    })),
    currentText: chain[chain.length - 1].text,
  };
};

/**
 * Find all memory chains for a project
 */
export const getAllChains = async (
  projectId: string
): Promise<Array<{ chainId: string; topic: string; versions: number }>> => {
  const memories = await db.memories
    .where('[scope+projectId]')
    .equals(['project', projectId])
    .toArray();
  
  const chainMap = new Map<string, { texts: string[]; count: number }>();
  
  for (const memory of memories) {
    const chainTag = memory.topicTags.find(t => t.startsWith('chain:'));
    if (chainTag) {
      const chainId = chainTag.replace('chain:', '');
      const existing = chainMap.get(chainId) || { texts: [], count: 0 };
      existing.texts.push(memory.text);
      existing.count++;
      chainMap.set(chainId, existing);
    }
  }
  
  return Array.from(chainMap.entries()).map(([chainId, data]) => ({
    chainId,
    topic: data.texts[0]?.slice(0, 50) + '...',
    versions: data.count,
  }));
};

// ─────────────────────────────────────────────────────────────────────────────
// FORMAT FOR PROMPT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format chain evolution for agent context
 */
export const formatChainForPrompt = async (
  memoryId: string
): Promise<string> => {
  const evolution = await getChainEvolution(memoryId);
  
  if (evolution.versions === 1) {
    return `[Memory] ${evolution.currentText}`;
  }
  
  let output = `[Evolving Memory - ${evolution.versions} versions]\n`;
  output += `Latest: ${evolution.currentText}\n`;
  output += `Evolution:\n`;
  
  for (const entry of evolution.timeline.slice(-3)) {
    const date = new Date(entry.timestamp).toLocaleDateString();
    output += `  v${entry.version} (${date}): ${entry.summary}\n`;
  }
  
  return output;
};
