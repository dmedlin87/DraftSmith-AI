/**
 * Intelligence Service
 * 
 * Unified API for the deterministic intelligence layer.
 * Orchestrates all analysis components and provides a single entry point.
 */

import {
  ManuscriptIntelligence,
  ManuscriptHUD,
  StructuralFingerprint,
  EntityGraph,
  Timeline,
  StyleFingerprint,
  AttentionHeatmap,
  ManuscriptDelta,
  ProcessingConfig,
  DEFAULT_PROCESSING_CONFIG,
  // Chunk index types
  ChunkId,
  ChunkStatus,
  ChunkLevel,
  ChunkRecord,
  ChunkAnalysis,
  AggregateSummary,
  ChunkEdit,
  ChunkJob,
  ChunkIndexState,
} from '../../types/intelligence';

// Component exports
export * from './structuralParser';
export * from './entityExtractor';
export * from './timelineTracker';
export * from './styleAnalyzer';
export * from './heatmapBuilder';
export * from './contextBuilder';
export * from './deltaTracker';
export * from './cache';
export * from './contradictionDetector';
export * from './narrativeArc';

// Chunk index system
export * from './chunkIndex';
export * from './chunkManager';

// Type exports
export type {
  ManuscriptIntelligence,
  ManuscriptHUD,
  StructuralFingerprint,
  EntityGraph,
  Timeline,
  StyleFingerprint,
  AttentionHeatmap,
  ManuscriptDelta,
  // Chunk index types
  ChunkId,
  ChunkStatus,
  ChunkLevel,
  ChunkRecord,
  ChunkAnalysis,
  AggregateSummary,
  ChunkEdit,
  ChunkJob,
  ChunkIndexState,
};

// Import component functions
import { parseStructure } from './structuralParser';
import { extractEntities, mergeEntityGraphs } from './entityExtractor';
import { buildTimeline, mergeTimelines } from './timelineTracker';
import { analyzeStyle } from './styleAnalyzer';
import { buildHeatmap } from './heatmapBuilder';
import { buildHUD, buildAIContextString, buildCompressedContext } from './contextBuilder';
import { createDelta, createEmptyDelta, hashContent, ChangeHistory } from './deltaTracker';
import { 
  parseStructureCached, 
  extractEntitiesCached, 
  analyzeStyleCached,
  getIntelligenceCache,
  clearIntelligenceCache,
} from './cache';

// ─────────────────────────────────────────────────────────────────────────────
// FULL PROCESSING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Process a complete manuscript/chapter through all intelligence layers
 */
export const processManuscript = (
  text: string,
  chapterId: string,
  previousText?: string,
  previousIntelligence?: ManuscriptIntelligence
): ManuscriptIntelligence => {
  // 1. Structural parsing
  const structural = parseStructure(text);
  
  // 2. Entity extraction
  const entities = extractEntities(
    text,
    structural.paragraphs,
    structural.dialogueMap,
    chapterId
  );
  
  // 3. Timeline building
  const timeline = buildTimeline(text, structural.scenes, chapterId);
  
  // 4. Style analysis
  const style = analyzeStyle(text);
  
  // 5. Heatmap building
  const heatmap = buildHeatmap(text, structural, entities, timeline, style);
  
  // 6. Delta tracking
  const delta = previousText && previousIntelligence
    ? createDelta(previousText, text, previousIntelligence.entities, previousIntelligence.timeline)
    : createEmptyDelta(text);
  
  // 7. Build initial HUD (cursor at 0)
  const hud = buildHUD(
    { chapterId, structural, entities, timeline, style, heatmap, delta, hud: null as any },
    0
  );
  
  return {
    chapterId,
    structural,
    entities,
    timeline,
    style,
    heatmap,
    delta,
    hud,
  };
};

/**
 * Process manuscript with caching enabled
 * Uses content-addressed cache for structural, entity, and style analysis
 */
export const processManuscriptCached = (
  text: string,
  chapterId: string,
  previousText?: string,
  previousIntelligence?: ManuscriptIntelligence
): ManuscriptIntelligence => {
  // 1. Structural parsing (cached)
  const structural = parseStructureCached(text);
  
  // 2. Entity extraction (cached)
  const entities = extractEntitiesCached(
    text,
    structural.paragraphs,
    structural.dialogueMap,
    chapterId
  );
  
  // 3. Timeline building (not cached - depends on scenes)
  const timeline = buildTimeline(text, structural.scenes, chapterId);
  
  // 4. Style analysis (cached)
  const style = analyzeStyleCached(text);
  
  // 5. Heatmap building (not cached - depends on all components)
  const heatmap = buildHeatmap(text, structural, entities, timeline, style);
  
  // 6. Delta tracking
  const delta = previousText && previousIntelligence
    ? createDelta(previousText, text, previousIntelligence.entities, previousIntelligence.timeline)
    : createEmptyDelta(text);
  
  // 7. Build initial HUD (cursor at 0)
  const hud = buildHUD(
    { chapterId, structural, entities, timeline, style, heatmap, delta, hud: null as any },
    0
  );
  
  return {
    chapterId,
    structural,
    entities,
    timeline,
    style,
    heatmap,
    delta,
    hud,
  };
};

/**
 * Quick update for cursor position changes (no re-processing)
 */
export const updateHUDForCursor = (
  intelligence: ManuscriptIntelligence,
  cursorOffset: number
): ManuscriptHUD => {
  return buildHUD(intelligence, cursorOffset);
};

// ─────────────────────────────────────────────────────────────────────────────
// INCREMENTAL PROCESSING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lightweight processing for instant feedback (on every keystroke)
 */
export interface InstantMetrics {
  wordCount: number;
  sentenceCount: number;
  paragraphCount: number;
  cursorScene: string | null;
  cursorTension: number;
}

export const processInstant = (
  text: string,
  cursorOffset: number,
  cachedStructural?: StructuralFingerprint
): InstantMetrics => {
  // Use cached structural if available and recent
  if (cachedStructural && Date.now() - cachedStructural.processedAt < 5000) {
    const currentScene = cachedStructural.scenes.find(
      s => cursorOffset >= s.startOffset && cursorOffset < s.endOffset
    );
    
    return {
      wordCount: cachedStructural.stats.totalWords,
      sentenceCount: cachedStructural.stats.totalSentences,
      paragraphCount: cachedStructural.stats.totalParagraphs,
      cursorScene: currentScene?.type || null,
      cursorTension: currentScene?.tension || 0.5,
    };
  }
  
  // Quick calculation without full parsing
  const words = text.trim().split(/\s+/).filter(w => w.length > 0);
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  
  return {
    wordCount: words.length,
    sentenceCount: sentences.length,
    paragraphCount: paragraphs.length,
    cursorScene: null,
    cursorTension: 0.5,
  };
};

/**
 * Medium-weight processing for debounced updates
 */
export interface DebouncedMetrics extends InstantMetrics {
  dialogueRatio: number;
  avgSentenceLength: number;
  currentParagraphType: string | null;
}

export const processDebounced = (
  text: string,
  cursorOffset: number
): DebouncedMetrics => {
  const structural = parseStructure(text);
  
  const currentScene = structural.scenes.find(
    s => cursorOffset >= s.startOffset && cursorOffset < s.endOffset
  );
  
  const currentParagraph = structural.paragraphs.find(
    p => cursorOffset >= p.offset && cursorOffset < p.offset + p.length
  );
  
  return {
    wordCount: structural.stats.totalWords,
    sentenceCount: structural.stats.totalSentences,
    paragraphCount: structural.stats.totalParagraphs,
    cursorScene: currentScene?.type || null,
    cursorTension: currentScene?.tension || 0.5,
    dialogueRatio: structural.stats.dialogueRatio,
    avgSentenceLength: structural.stats.avgSentenceLength,
    currentParagraphType: currentParagraph?.type || null,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// CROSS-CHAPTER PROCESSING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Merge intelligence from multiple chapters for project-wide insights
 */
export const mergeChapterIntelligence = (
  chapters: ManuscriptIntelligence[]
): {
  entities: EntityGraph;
  timeline: Timeline;
  projectStats: {
    totalWords: number;
    totalScenes: number;
    avgTension: number;
    topCharacters: string[];
  };
} => {
  // Merge entity graphs
  const entities = mergeEntityGraphs(chapters.map(c => c.entities));
  
  // Merge timelines
  const timeline = mergeTimelines(chapters.map(c => c.timeline));
  
  // Calculate project-wide stats
  const totalWords = chapters.reduce((sum, c) => sum + c.structural.stats.totalWords, 0);
  const totalScenes = chapters.reduce((sum, c) => sum + c.structural.scenes.length, 0);
  
  const allTensions = chapters.flatMap(c => c.structural.scenes.map(s => s.tension));
  const avgTension = allTensions.length > 0
    ? allTensions.reduce((a, b) => a + b, 0) / allTensions.length
    : 0.5;
  
  const topCharacters = entities.nodes
    .filter(n => n.type === 'character')
    .slice(0, 5)
    .map(n => n.name);
  
  return {
    entities,
    timeline,
    projectStats: {
      totalWords,
      totalScenes,
      avgTension,
      topCharacters,
    },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// AI CONTEXT GENERATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a full context string for AI consumption
 */
export const generateAIContext = (
  intelligence: ManuscriptIntelligence,
  cursorOffset: number,
  compressed: boolean = false
): string => {
  const hud = buildHUD(intelligence, cursorOffset);
  
  return compressed
    ? buildCompressedContext(hud)
    : buildAIContextString(hud);
};

/**
 * Generate context for a specific section (for targeted analysis)
 */
export const generateSectionContext = (
  intelligence: ManuscriptIntelligence,
  startOffset: number,
  endOffset: number
): string => {
  const { structural, entities, timeline, heatmap } = intelligence;
  
  let context = '';
  
  // Get scenes in range
  const scenes = structural.scenes.filter(
    s => s.startOffset >= startOffset && s.startOffset < endOffset
  );
  
  if (scenes.length > 0) {
    context += `[SCENES IN SECTION]\n`;
    for (const scene of scenes) {
      context += `- ${scene.type} scene, tension: ${(scene.tension * 10).toFixed(0)}/10`;
      if (scene.pov) context += `, POV: ${scene.pov}`;
      context += `\n`;
    }
  }
  
  // Get entities in range
  const sectionEntities = entities.nodes.filter(
    n => n.mentions.some(m => m.offset >= startOffset && m.offset < endOffset)
  );
  
  if (sectionEntities.length > 0) {
    context += `\n[ENTITIES IN SECTION]\n`;
    for (const entity of sectionEntities.slice(0, 5)) {
      context += `- ${entity.name} (${entity.type})\n`;
    }
  }
  
  // Get issues in range
  const sectionHeatmap = heatmap.sections.filter(
    s => s.offset >= startOffset && s.offset < endOffset
  );
  
  const allFlags = sectionHeatmap.flatMap(s => s.flags);
  const uniqueFlags = [...new Set(allFlags)];
  
  if (uniqueFlags.length > 0) {
    context += `\n[ISSUES IN SECTION]\n`;
    for (const flag of uniqueFlags) {
      context += `- ${flag}\n`;
    }
  }
  
  return context;
};

// ─────────────────────────────────────────────────────────────────────────────
// FACTORY FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create an empty intelligence object for initialization
 */
export const createEmptyIntelligence = (chapterId: string): ManuscriptIntelligence => {
  const emptyStructural: StructuralFingerprint = {
    scenes: [],
    paragraphs: [],
    dialogueMap: [],
    stats: {
      totalWords: 0,
      totalSentences: 0,
      totalParagraphs: 0,
      avgSentenceLength: 0,
      sentenceLengthVariance: 0,
      dialogueRatio: 0,
      sceneCount: 0,
      povShifts: 0,
      avgSceneLength: 0,
    },
    processedAt: Date.now(),
  };
  
  const emptyEntities: EntityGraph = {
    nodes: [],
    edges: [],
    processedAt: Date.now(),
  };
  
  const emptyTimeline: Timeline = {
    events: [],
    causalChains: [],
    promises: [],
    processedAt: Date.now(),
  };
  
  const emptyStyle: StyleFingerprint = {
    vocabulary: {
      uniqueWords: 0,
      totalWords: 0,
      avgWordLength: 0,
      lexicalDiversity: 0,
      topWords: [],
      overusedWords: [],
      rareWords: [],
    },
    syntax: {
      avgSentenceLength: 0,
      sentenceLengthVariance: 0,
      minSentenceLength: 0,
      maxSentenceLength: 0,
      paragraphLengthAvg: 0,
      dialogueToNarrativeRatio: 0,
      questionRatio: 0,
      exclamationRatio: 0,
    },
    rhythm: {
      syllablePattern: [],
      punctuationDensity: 0,
      avgClauseCount: 0,
    },
    flags: {
      passiveVoiceRatio: 0,
      passiveVoiceInstances: [],
      adverbDensity: 0,
      adverbInstances: [],
      filterWordDensity: 0,
      filterWordInstances: [],
      clicheCount: 0,
      clicheInstances: [],
      repeatedPhrases: [],
    },
    processedAt: Date.now(),
  };
  
  const emptyHeatmap: AttentionHeatmap = {
    sections: [],
    hotspots: [],
    processedAt: Date.now(),
  };
  
  const emptyDelta: ManuscriptDelta = {
    changedRanges: [],
    invalidatedSections: [],
    affectedEntities: [],
    newPromises: [],
    resolvedPromises: [],
    contentHash: '',
    processedAt: Date.now(),
  };
  
  const emptyHUD: ManuscriptHUD = {
    situational: {
      currentScene: null,
      currentParagraph: null,
      narrativePosition: { sceneIndex: 0, totalScenes: 0, percentComplete: 0 },
      tensionLevel: 'medium',
      pacing: 'moderate',
    },
    context: {
      activeEntities: [],
      activeRelationships: [],
      openPromises: [],
      recentEvents: [],
    },
    styleAlerts: [],
    prioritizedIssues: [],
    recentChanges: [],
    stats: { wordCount: 0, readingTime: 0, dialoguePercent: 0, avgSentenceLength: 0 },
    lastFullProcess: Date.now(),
    processingTier: 'stale',
  };
  
  return {
    chapterId,
    structural: emptyStructural,
    entities: emptyEntities,
    timeline: emptyTimeline,
    style: emptyStyle,
    heatmap: emptyHeatmap,
    delta: emptyDelta,
    hud: emptyHUD,
  };
};
