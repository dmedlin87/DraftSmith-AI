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
  BedsideNoteConflict,
} from './types';
import { createMemory, getMemory, updateMemory, getMemories } from './index';
import { embedBedsideNoteText } from './bedsideEmbeddings';

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
// BEDSIDE NOTE CONFLICT DETECTION
// ─────────────────────────────────────────────────────────────────────────────

const CONTRADICTION_VERBS = [
  'is',
  'was',
  'are',
  'becomes',
  'remains',
  'stays',
  'has',
  'have',
  'owns',
];

const CONTRADICTION_NEGATIONS = ['no longer', 'not', "isn't", "wasn't", 'never'];

type ParsedFact = {
  subject: string;
  verb: string;
  value: string;
  raw: string;
};

const normalizeSentence = (text: string) => text.replace(/\s+/g, ' ').trim();

const extractFacts = (text: string): ParsedFact[] => {
  const sentences = text
    .split(/[\.\n]+/)
    .map(normalizeSentence)
    .filter(Boolean);

  const facts: ParsedFact[] = [];
  for (const sentence of sentences) {
    const factMatch = sentence.match(
      new RegExp(
        `^(?<subject>[A-Z][A-Za-z0-9'’\-]+)\s+(?<verb>${CONTRADICTION_VERBS.join('|')})\s+(?<value>.+)$`,
        'i'
      )
    );

    if (factMatch?.groups) {
      facts.push({
        subject: factMatch.groups.subject.toLowerCase(),
        verb: factMatch.groups.verb.toLowerCase(),
        value: factMatch.groups.value.toLowerCase(),
        raw: sentence,
      });
    }
  }

  return facts;
};

const isNegationFlip = (previous: string, current: string): boolean => {
  const prevHasNegation = CONTRADICTION_NEGATIONS.some(neg => previous.toLowerCase().includes(neg));
  const currentHasNegation = CONTRADICTION_NEGATIONS.some(neg => current.toLowerCase().includes(neg));
  return prevHasNegation !== currentHasNegation;
};

const detectHeuristicConflicts = (
  newText: string,
  previousText: string
): BedsideNoteConflict[] => {
  const previousFacts = extractFacts(previousText);
  const newFacts = extractFacts(newText);
  const conflicts: BedsideNoteConflict[] = [];

  for (const prev of previousFacts) {
    for (const curr of newFacts) {
      const sameSubject = prev.subject === curr.subject;
      const sameVerb = prev.verb === curr.verb;
      const valuesDiffer = prev.value && curr.value && prev.value !== curr.value;
      if (sameSubject && sameVerb && valuesDiffer) {
        conflicts.push({
          previous: prev.raw,
          current: curr.raw,
          confidence: 0.78,
          strategy: 'heuristic',
          resolution: 'unresolved',
        });
        continue;
      }

      if (sameSubject && valuesDiffer && isNegationFlip(prev.raw, curr.raw)) {
        conflicts.push({
          previous: prev.raw,
          current: curr.raw,
          confidence: 0.7,
          strategy: 'heuristic',
          resolution: 'unresolved',
        });
      }
    }
  }

  if (conflicts.length === 0) {
    const previousStatements = previousText
      .split(/[\.\n]+/)
      .map(normalizeSentence)
      .filter(Boolean);
    const newStatements = newText
      .split(/[\.\n]+/)
      .map(normalizeSentence)
      .filter(Boolean);

    for (const prev of previousStatements) {
      const prevSubject = prev.split(' ')[0]?.toLowerCase();
      for (const curr of newStatements) {
        const currSubject = curr.split(' ')[0]?.toLowerCase();
        const similarSubject = prevSubject && currSubject && prevSubject === currSubject;
        const clearlyDifferent = prev.toLowerCase() !== curr.toLowerCase();
        if (similarSubject && clearlyDifferent) {
          conflicts.push({
            previous: prev,
            current: curr,
            confidence: 0.55,
            strategy: 'heuristic',
            resolution: 'unresolved',
          });
        }
      }
    }
  }

  return conflicts;
};

const detectLLMLikeConflicts = (
  newText: string,
  previousText: string
): BedsideNoteConflict[] => {
  // Lightweight fallback: look for explicit contradiction cues
  const newStatements = newText
    .split(/[\.\n]+/)
    .map(normalizeSentence)
    .filter(Boolean);
  const previousStatements = previousText
    .split(/[\.\n]+/)
    .map(normalizeSentence)
    .filter(Boolean);

  const conflicts: BedsideNoteConflict[] = [];
  for (const prev of previousStatements) {
    for (const curr of newStatements) {
      if (curr.toLowerCase().includes('contradicts') || curr.toLowerCase().includes('conflicts with')) {
        conflicts.push({
          previous: prev,
          current: curr,
          confidence: 0.6,
          strategy: 'llm',
          resolution: 'unresolved',
        });
      }
    }
  }

  return conflicts;
};

export const detectBedsideNoteConflicts = async (
  newText: string,
  previousText: string
): Promise<BedsideNoteConflict[]> => {
  const heuristicConflicts = detectHeuristicConflicts(newText, previousText);
  if (heuristicConflicts.length > 0) {
    return heuristicConflicts;
  }

  return detectLLMLikeConflicts(newText, previousText);
};

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
    embedding?: number[];
  } = {}
): Promise<MemoryNote> => {
  const {
    changeType = 'update',
    changeReason,
    keepOriginal = true,
    embedding,
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
    embedding: embedding ?? existing.embedding,
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
  options: { arcId?: string; chapterId?: string } = {},
): Promise<MemoryNote> => {
  const { arcId, chapterId } = options;

  const scopedTags = [BEDSIDE_NOTE_TAG];
  if (chapterId) scopedTags.push(`chapter:${chapterId}`);
  if (arcId) scopedTags.push(`arc:${arcId}`);

  const existing = await getMemories({
    scope: 'project',
    projectId,
    type: 'plan',
    topicTags: scopedTags,
    limit: 1,
  });

  if (existing.length > 0) {
    return existing[0];
  }

  const baseTags = new Set(BEDSIDE_NOTE_DEFAULT_TAGS);
  scopedTags.forEach(tag => baseTags.add(tag));

  const text =
    'Project planning notes for this manuscript. This note will be updated over time with key goals, concerns, and constraints.';

  const embedding = await embedBedsideNoteText(text);

  return createMemory({
    scope: 'project',
    projectId,
    type: 'plan',
    text,
    topicTags: Array.from(baseTags),
    importance: 0.85,
    embedding,
  });
};

export const getOrCreateAuthorBedsideNote = async (): Promise<MemoryNote> => {
  const existing = await getMemories({
    scope: 'author',
    type: 'plan',
    topicTags: [BEDSIDE_NOTE_TAG, 'scope:author'],
    limit: 1,
  });

  if (existing.length > 0) {
    return existing[0];
  }

  const text =
    'Author bedside notebook — keep cross-project lessons, recurring issues, and style reminders here.';

  const embedding = await embedBedsideNoteText(text);

  return createMemory({
    scope: 'author',
    type: 'plan',
    text,
    topicTags: [...BEDSIDE_NOTE_DEFAULT_TAGS, 'scope:author'],
    importance: 0.9,
    embedding,
  });
};

export const evolveBedsideNote = async (
  projectId: string,
  newText: string,
  options: {
    changeReason?: string;
    structuredContent?: BedsideNoteContent;
    arcId?: string;
    chapterId?: string;
    conflictResolution?: 'auto' | 'agent' | 'user';
    extraTags?: string[];
  } = {},
): Promise<MemoryNote> => {
  const base = await getOrCreateBedsideNote(projectId, {
    arcId: options.arcId,
    chapterId: options.chapterId,
  });

  const conflicts = await detectBedsideNoteConflicts(newText, base.text);
  const resolution = conflicts.length > 0 ? options.conflictResolution ?? 'unresolved' : undefined;

  const structuredContent: BedsideNoteContent = {
    ...(base.structuredContent as BedsideNoteContent | undefined),
    ...options.structuredContent,
  };

  if (conflicts.length > 0) {
    const resolvedConflicts = conflicts.map(conflict => ({
      ...conflict,
      resolution,
    }));

    structuredContent.conflicts = resolvedConflicts;
    structuredContent.warnings = [
      ...(structuredContent.warnings ?? []),
      ...resolvedConflicts.map(c => `Conflict: ${c.previous} ↔ ${c.current}`),
    ];
  }

  const embedding = await embedBedsideNoteText(newText);

  let evolved = await evolveMemory(base.id, newText, {
    changeType: 'update',
    changeReason: options.changeReason,
    keepOriginal: true,
    structuredContent,
    embedding,
  });

  if (conflicts.length > 0) {
    options.extraTags = [
      ...(options.extraTags ?? []),
      'conflict:detected',
      ...(resolution ? [`conflict:resolution:${resolution}`] : []),
    ];
  }

  const extraTags = options.extraTags ?? [];
  if (extraTags.length > 0) {
    const uniqueTags = new Set(evolved.topicTags.concat(extraTags));
    evolved = await updateMemory(evolved.id, { topicTags: Array.from(uniqueTags) });
  }

  // Roll up chapter-specific changes to parent scopes for broader visibility
  if (options.changeReason !== 'roll_up') {
    const rollupText = options.chapterId
      ? `Chapter ${options.chapterId} update → ${newText}`
      : options.arcId
        ? `Arc ${options.arcId} update → ${newText}`
        : null;

    if (rollupText && options.chapterId) {
      if (options.arcId) {
        const arcBase = await getOrCreateBedsideNote(projectId, { arcId: options.arcId });
        await evolveMemory(arcBase.id, rollupText, {
          changeType: 'update',
          changeReason: 'roll_up',
          keepOriginal: true,
          structuredContent,
        });
      }

      const projectBase = await getOrCreateBedsideNote(projectId);
      await evolveMemory(projectBase.id, rollupText, {
        changeType: 'update',
        changeReason: 'roll_up',
        keepOriginal: true,
        structuredContent,
      });
    } else if (rollupText && options.arcId) {
      const projectBase = await getOrCreateBedsideNote(projectId);
      await evolveMemory(projectBase.id, rollupText, {
        changeType: 'update',
        changeReason: 'roll_up',
        keepOriginal: true,
        structuredContent,
      });
    }
  }

  return evolved;
};

export const seedProjectBedsideNoteFromAuthor = async (
  projectId: string,
): Promise<MemoryNote> => {
  const [projectBedside, authorBedside] = await Promise.all([
    getOrCreateBedsideNote(projectId),
    getOrCreateAuthorBedsideNote(),
  ]);

  const authorWarnings = (authorBedside.structuredContent as BedsideNoteContent | undefined)?.warnings ?? [];

  const warningBlock =
    authorWarnings.length > 0 ? `\n\nAuthor warnings to watch:\n- ${authorWarnings.join('\n- ')}` : '';
  const suggestionBlock = authorBedside.text ? `\n\nAuthor bedside note: ${authorBedside.text}` : '';

  const updatedText = `${projectBedside.text}${warningBlock}${suggestionBlock}`;

  return evolveBedsideNote(projectId, updatedText, {
    changeReason: 'project_seed',
    structuredContent: {
      ...(projectBedside.structuredContent as BedsideNoteContent | undefined),
      warnings: [
        ...((projectBedside.structuredContent as BedsideNoteContent | undefined)?.warnings ?? []),
        ...authorWarnings,
      ],
    },
    extraTags: ['seeded_from:author_bedside'],
  });
};

export const recordProjectRetrospective = async (
  projectId: string,
  options: { summary?: string } = {},
): Promise<MemoryNote> => {
  const project = await db.projects.get(projectId);
  const projectBedside = await getOrCreateBedsideNote(projectId);
  const authorBedside = await getOrCreateAuthorBedsideNote();

  const baseWarnings = (authorBedside.structuredContent as BedsideNoteContent | undefined)?.warnings ?? [];
  const projectWarnings = (projectBedside.structuredContent as BedsideNoteContent | undefined)?.warnings ?? [];

  const summary =
    options.summary ||
    `Project retrospective for "${project?.title ?? projectId}":\n- Final bedside note focus: ${projectBedside.text}`;

  const embedding = await embedBedsideNoteText(summary);

  const structuredContent: BedsideNoteContent = {
    ...(authorBedside.structuredContent as BedsideNoteContent | undefined),
    recentDiscoveries: [
      ...((authorBedside.structuredContent as BedsideNoteContent | undefined)?.recentDiscoveries ?? []),
      `Retrospective captured from project ${project?.title ?? projectId}`,
    ],
    warnings: [...baseWarnings, ...projectWarnings],
  };

  let evolved = await evolveMemory(authorBedside.id, summary, {
    changeReason: 'project_retrospective',
    structuredContent,
    keepOriginal: true,
    embedding,
  });

  const uniqueTags = new Set(
    evolved.topicTags.concat(['scope:author', `retrospective:project:${projectId}`])
  );
  evolved = await updateMemory(evolved.id, { topicTags: Array.from(uniqueTags) });

  return evolved;
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
