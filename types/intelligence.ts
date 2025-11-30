/**
 * DraftSmith Intelligence Layer Types
 * 
 * Deterministic preprocessing and context enrichment for AI consumption.
 * These structures are computed locally before any LLM calls.
 */

// ─────────────────────────────────────────────────────────────────────────────
// STRUCTURAL FINGERPRINT
// ─────────────────────────────────────────────────────────────────────────────

export type SceneType = 'action' | 'dialogue' | 'description' | 'introspection' | 'transition';
export type ParagraphType = 'dialogue' | 'action' | 'description' | 'internal' | 'exposition';

export interface Scene {
  id: string;
  startOffset: number;
  endOffset: number;
  type: SceneType;
  pov: string | null;              // Point-of-view character
  location: string | null;         // Detected location
  timeMarker: string | null;       // "morning", "three days later"
  tension: number;                 // 0 to 1
  dialogueRatio: number;           // % of scene that is dialogue
}

export interface ClassifiedParagraph {
  offset: number;
  length: number;
  type: ParagraphType;
  speakerId: string | null;        // Who's talking (from dialogue tags)
  sentiment: number;               // -1 to 1
  tension: number;                 // 0 to 1
  sentenceCount: number;
  avgSentenceLength: number;
}

export interface DialogueLine {
  id: string;
  quote: string;
  speaker: string | null;          // Extracted from "said X" patterns
  offset: number;
  length: number;
  replyTo: string | null;          // Previous dialogue ID in conversation
  sentiment: number;
}

export interface StructuralStats {
  totalWords: number;
  totalSentences: number;
  totalParagraphs: number;
  avgSentenceLength: number;
  sentenceLengthVariance: number;
  dialogueRatio: number;
  sceneCount: number;
  povShifts: number;
  avgSceneLength: number;
}

export interface StructuralFingerprint {
  scenes: Scene[];
  paragraphs: ClassifiedParagraph[];
  dialogueMap: DialogueLine[];
  stats: StructuralStats;
  processedAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTITY GRAPH
// ─────────────────────────────────────────────────────────────────────────────

export type EntityType = 'character' | 'location' | 'object' | 'faction' | 'concept';
export type RelationshipType = 'interacts' | 'located_at' | 'possesses' | 'related_to' | 'opposes' | 'allied_with';

export interface EntityNode {
  id: string;
  name: string;
  type: EntityType;
  aliases: string[];               // "the old man" → "Marcus"
  firstMention: number;            // Offset
  mentionCount: number;
  mentions: Array<{ offset: number; chapterId: string }>;
  attributes: Record<string, string[]>; // Collected attributes
}

export interface EntityEdge {
  id: string;
  source: string;                  // Entity ID
  target: string;                  // Entity ID
  type: RelationshipType;
  coOccurrences: number;           // Times they appear in same paragraph
  sentiment: number;               // Aggregate sentiment when together
  chapters: string[];              // Where this relationship appears
  evidence: string[];              // Short quotes showing relationship
}

export interface EntityGraph {
  nodes: EntityNode[];
  edges: EntityEdge[];
  processedAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// TIMELINE & CAUSALITY
// ─────────────────────────────────────────────────────────────────────────────

export type TemporalRelation = 'before' | 'after' | 'concurrent' | 'unknown';

export interface TimelineEvent {
  id: string;
  description: string;
  offset: number;
  chapterId: string;
  temporalMarker: string | null;   // "the next morning", "years later"
  relativePosition: TemporalRelation;
  dependsOn: string[];             // Event IDs this depends on
}

export interface CausalChain {
  id: string;
  cause: {
    eventId: string;
    quote: string;
    offset: number;
  };
  effect: {
    eventId: string;
    quote: string;
    offset: number;
  };
  confidence: number;              // 0 to 1
  marker: string;                  // The linguistic marker that indicated causality
}

export interface PlotPromise {
  id: string;
  type: 'foreshadowing' | 'setup' | 'question' | 'conflict' | 'goal';
  description: string;
  quote: string;
  offset: number;
  chapterId: string;
  resolved: boolean;
  resolutionOffset?: number;
  resolutionChapterId?: string;
}

export interface Timeline {
  events: TimelineEvent[];
  causalChains: CausalChain[];
  promises: PlotPromise[];
  processedAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLE FINGERPRINT
// ─────────────────────────────────────────────────────────────────────────────

export interface VocabularyMetrics {
  uniqueWords: number;
  totalWords: number;
  avgWordLength: number;
  lexicalDiversity: number;        // Type-token ratio
  topWords: Array<{ word: string; count: number }>;
  overusedWords: string[];         // Statistically over threshold
  rareWords: string[];             // Unique/sophisticated vocabulary
}

export interface SyntaxMetrics {
  avgSentenceLength: number;
  sentenceLengthVariance: number;
  minSentenceLength: number;
  maxSentenceLength: number;
  paragraphLengthAvg: number;
  dialogueToNarrativeRatio: number;
  questionRatio: number;           // % of sentences that are questions
  exclamationRatio: number;
}

export interface RhythmMetrics {
  syllablePattern: number[];       // Rolling average of syllables per sentence
  punctuationDensity: number;      // Punctuation per 100 words
  avgClauseCount: number;          // Clauses per sentence
}

export interface StyleFlags {
  passiveVoiceRatio: number;
  passiveVoiceInstances: Array<{ quote: string; offset: number }>;
  adverbDensity: number;
  adverbInstances: Array<{ word: string; offset: number }>;
  filterWordDensity: number;       // "seemed", "felt", "appeared"
  filterWordInstances: Array<{ word: string; offset: number }>;
  clicheCount: number;
  clicheInstances: Array<{ phrase: string; offset: number }>;
  repeatedPhrases: Array<{ phrase: string; count: number; offsets: number[] }>;
}

export interface StyleFingerprint {
  vocabulary: VocabularyMetrics;
  syntax: SyntaxMetrics;
  rhythm: RhythmMetrics;
  flags: StyleFlags;
  processedAt: number;
}
// ---------------------------------------------------
// VOICE FINGERPRINT
// ---------------------------------------------------

export interface VoiceMetrics {
  avgSentenceLength: number;
  sentenceVariance: number;
  contractionRatio: number;
  questionRatio: number;
  exclamationRatio: number;
  latinateRatio: number;
  uniqueWordCount: number;
}

export interface VoiceProfile {
  speakerName: string;
  metrics: VoiceMetrics;
  signatureWords: string[];
  impression: string;
  lineCount: number;
}

export interface VoiceFingerprint {
  profiles: Record<string, VoiceProfile>;
  consistencyAlerts: string[];
}


// ─────────────────────────────────────────────────────────────────────────────
// ATTENTION HEATMAP
// ─────────────────────────────────────────────────────────────────────────────

export type RiskFlag = 
  | 'unresolved_promise'
  | 'contradiction_detected'
  | 'passive_voice_heavy'
  | 'pacing_slow'
  | 'pacing_rushed'
  | 'dialogue_heavy'
  | 'exposition_dump'
  | 'filter_words'
  | 'adverb_overuse'
  | 'long_sentences'
  | 'short_sentences'
  | 'low_tension'
  | 'character_absent'
  | 'setting_unclear';

export interface HeatmapSection {
  offset: number;
  length: number;
  scores: {
    plotRisk: number;              // Has unresolved hooks, contradictions
    pacingRisk: number;            // Long sentences, dense paragraphs
    characterRisk: number;         // Passive protagonist, missing motivation
    settingRisk: number;           // Anachronism density
    styleRisk: number;             // Writing quality issues
  };
  overallRisk: number;             // Weighted average
  flags: RiskFlag[];
  suggestions: string[];           // Quick fix suggestions
}

export interface AttentionHeatmap {
  sections: HeatmapSection[];
  hotspots: Array<{ offset: number; reason: string; severity: number }>;
  processedAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// DELTA TRACKING
// ─────────────────────────────────────────────────────────────────────────────

export type ChangeType = 'insert' | 'delete' | 'modify';

export interface TextChange {
  start: number;
  end: number;
  changeType: ChangeType;
  oldText?: string;
  newText?: string;
  timestamp: number;
}

export interface ManuscriptDelta {
  changedRanges: TextChange[];
  invalidatedSections: string[];   // Section IDs that need re-analysis
  affectedEntities: string[];      // Entity IDs whose data may have changed
  newPromises: string[];           // Newly introduced plot hooks
  resolvedPromises: string[];      // Payoffs that now exist
  contentHash: string;             // For quick comparison
  processedAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// MANUSCRIPT HUD (Unified Context for AI)
// ─────────────────────────────────────────────────────────────────────────────

export interface SituationalAwareness {
  currentScene: Scene | null;
  currentParagraph: ClassifiedParagraph | null;
  narrativePosition: {
    sceneIndex: number;
    totalScenes: number;
    percentComplete: number;
  };
  tensionLevel: 'low' | 'medium' | 'high';
  pacing: 'slow' | 'moderate' | 'fast';
}

export interface RelevantContext {
  activeEntities: EntityNode[];
  activeRelationships: EntityEdge[];
  openPromises: PlotPromise[];
  recentEvents: TimelineEvent[];
}

export interface ManuscriptHUD {
  // Core awareness
  situational: SituationalAwareness;
  context: RelevantContext;
  
  // Alerts & priorities
  styleAlerts: string[];
  prioritizedIssues: Array<{
    type: RiskFlag;
    description: string;
    offset: number;
    severity: number;
  }>;
  
  // Recent changes
  recentChanges: TextChange[];
  
  // Quick stats
  stats: {
    wordCount: number;
    readingTime: number;           // Minutes
    dialoguePercent: number;
    avgSentenceLength: number;
  };
  
  // Processing state
  lastFullProcess: number;
  processingTier: 'instant' | 'debounced' | 'background' | 'stale';
}

// ─────────────────────────────────────────────────────────────────────────────
// FULL INTELLIGENCE STATE
// ─────────────────────────────────────────────────────────────────────────────

export interface ManuscriptIntelligence {
  chapterId: string;
  structural: StructuralFingerprint;
  entities: EntityGraph;
  timeline: Timeline;
  style: StyleFingerprint;
  heatmap: AttentionHeatmap;
  delta: ManuscriptDelta;
  hud: ManuscriptHUD;
}

// ─────────────────────────────────────────────────────────────────────────────
// CHUNK INDEX SYSTEM
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Semantic chunk identifier
 * Format: "chapter-{id}" | "chapter-{id}-scene-{idx}" | "act-{id}" | "book"
 */
export type ChunkId = string;

/**
 * Chunk processing status
 */
export type ChunkStatus = 'fresh' | 'dirty' | 'processing' | 'error';

/**
 * Chunk granularity level
 */
export type ChunkLevel = 'scene' | 'chapter' | 'act' | 'book';

/**
 * A single chunk record with its text range, hash, status, and cached analysis
 */
export interface ChunkRecord {
  id: ChunkId;
  level: ChunkLevel;
  
  // Position in the full manuscript (for chapters) or parent chunk (for scenes)
  startIndex: number;
  endIndex: number;
  
  // Content hash for change detection
  hash: string;
  
  // Processing state
  status: ChunkStatus;
  lastProcessedAt: number | null;
  errorMessage?: string;
  
  // Cached analysis (null if dirty or not yet processed)
  analysis: ChunkAnalysis | null;
  
  // Hierarchy
  parentId: ChunkId | null;
  childIds: ChunkId[];
}

/**
 * Cached analysis for a chunk
 * Lighter than full ManuscriptIntelligence - just the essentials
 */
export interface ChunkAnalysis {
  // Summary (for higher-level aggregation)
  summary: string;
  
  // Key metrics
  wordCount: number;
  dialogueRatio: number;
  avgTension: number;
  
  // Extracted entities (names only for aggregation)
  characterNames: string[];
  locationNames: string[];
  
  // Timeline markers
  timeMarkers: string[];
  
  // Open plot threads introduced in this chunk
  openPromises: string[];
  
  // Style flags triggered
  styleFlags: string[];
  
  // Risk score (0-1)
  riskScore: number;
  
  // Full structural data (for scene-level chunks)
  structural?: StructuralFingerprint;
  entities?: EntityGraph;
  style?: StyleFingerprint;
  
  processedAt: number;
}

/**
 * Aggregated summary for higher-level chunks (chapter, act, book)
 */
export interface AggregateSummary {
  chunkId: ChunkId;
  level: ChunkLevel;
  
  // Rolled-up metrics
  totalWordCount: number;
  avgDialogueRatio: number;
  avgTension: number;
  
  // Merged entity lists
  allCharacters: string[];
  allLocations: string[];
  
  // All unresolved promises up to this point
  unresolvedPromises: string[];
  
  // Highest-risk child chunks
  hotspots: Array<{ chunkId: ChunkId; riskScore: number; reason: string }>;
  
  // Prose summary (can be generated by AI or rule-based)
  narrativeSummary: string;
  
  generatedAt: number;
}

/**
 * Edit event for chunk position tracking
 */
export interface ChunkEdit {
  // Position in the document where edit occurred
  start: number;
  end: number;
  
  // Length of new content (end - start = old length, this is new length)
  newLength: number;
  
  // Which chapter this edit belongs to
  chapterId: string;
  
  timestamp: number;
}

/**
 * Chunk recompute job for the background queue
 */
export interface ChunkJob {
  chunkId: ChunkId;
  priority: 'high' | 'normal' | 'low';
  addedAt: number;
  
  // Optional: specific text to process (if not provided, will be fetched)
  text?: string;
}

/**
 * Full chunk index state (serializable for persistence)
 */
export interface ChunkIndexState {
  chunks: Record<ChunkId, ChunkRecord>;
  aggregates: Record<ChunkId, AggregateSummary>;
  
  // Queue state
  dirtyQueue: ChunkId[];
  
  // Global stats
  lastFullRebuild: number | null;
  totalChunks: number;
  dirtyCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// PROCESSING CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

export type ProcessingTier = 'instant' | 'debounced' | 'background' | 'on-demand';

export interface ProcessingConfig {
  instantDebounceMs: 0;
  debouncedDelayMs: 100;
  backgroundDelayMs: 2000;
  maxBackgroundTimeMs: 5000;
  enableWebWorker: boolean;
}

export const DEFAULT_PROCESSING_CONFIG: ProcessingConfig = {
  instantDebounceMs: 0,
  debouncedDelayMs: 100,
  backgroundDelayMs: 2000,
  maxBackgroundTimeMs: 5000,
  enableWebWorker: true,
};
