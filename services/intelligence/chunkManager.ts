/**
 * Chunk Manager
 * 
 * High-level orchestrator for the chunk index system:
 * - Processes dirty chunks in the background
 * - Integrates with existing intelligence layer
 * - Provides debounced edit handling
 * - Manages the processing queue with priorities
 */

import {
  ChunkId,
  ChunkAnalysis,
  ChunkEdit,
  ChunkRecord,
  ChunkIndexState,
  AggregateSummary,
  ManuscriptIntelligence,
} from '../../types/intelligence';
import { ChunkIndex, createChunkIndex, createChunkId } from './chunkIndex';
import { processManuscriptCached, parseStructure } from './index';
import { hashContent } from './deltaTracker';

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

export interface ChunkManagerConfig {
  /** Debounce delay before processing edits (ms) */
  editDebounceMs: number;
  
  /** Delay between processing queue items (ms) */
  processingIntervalMs: number;
  
  /** Maximum chunks to process per batch */
  maxBatchSize: number;
  
  /** Whether to use Web Worker for processing */
  useWorker: boolean;
  
  /** Idle time before background processing starts (ms) */
  idleThresholdMs: number;
}

const DEFAULT_CONFIG: ChunkManagerConfig = {
  editDebounceMs: 500,
  processingIntervalMs: 100,
  maxBatchSize: 3,
  useWorker: false, // Worker integration can be added later
  idleThresholdMs: 1000,
};

// ─────────────────────────────────────────────────────────────────────────────
// CHUNK MANAGER CLASS
// ─────────────────────────────────────────────────────────────────────────────

export class ChunkManager {
  private index: ChunkIndex;
  private config: ChunkManagerConfig;
  
  // Processing state
  private isProcessing = false;
  private processingTimer: ReturnType<typeof setTimeout> | null = null;
  private editDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastEditTime = 0;
  
  // Chapter text cache (needed to slice scene content)
  private chapterTexts: Map<string, string> = new Map();
  
  // Callbacks
  private onProcessingStart?: () => void;
  private onProcessingEnd?: () => void;
  private onChunkProcessed?: (chunkId: ChunkId, analysis: ChunkAnalysis) => void;
  private onError?: (chunkId: ChunkId, error: string) => void;
  private onQueueChange?: (dirtyCount: number) => void;

  constructor(
    config: Partial<ChunkManagerConfig> = {},
    callbacks?: {
      onProcessingStart?: () => void;
      onProcessingEnd?: () => void;
      onChunkProcessed?: (chunkId: ChunkId, analysis: ChunkAnalysis) => void;
      onError?: (chunkId: ChunkId, error: string) => void;
      onQueueChange?: (dirtyCount: number) => void;
    }
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    if (callbacks) {
      this.onProcessingStart = callbacks.onProcessingStart;
      this.onProcessingEnd = callbacks.onProcessingEnd;
      this.onChunkProcessed = callbacks.onChunkProcessed;
      this.onError = callbacks.onError;
      this.onQueueChange = callbacks.onQueueChange;
    }
    
    this.index = createChunkIndex(undefined, {
      onChunkDirty: () => this.scheduleProcessing(),
      onQueueUpdated: (queue) => this.onQueueChange?.(queue.length),
    });
    
    // Initialize the book root chunk
    this.initializeBookChunk();
  }

  /**
   * Initialize the root 'book' chunk
   */
  private initializeBookChunk(): void {
    if (!this.index.getChunk('book')) {
      this.index.registerChunk('book', 'book', 0, 0, '', null);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // EDIT HANDLING
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Handle a text edit in a chapter
   * This is the main entry point from the editor
   */
  handleEdit(chapterId: string, newText: string, editStart: number, editEnd: number): void {
    this.lastEditTime = Date.now();
    
    // Store the latest text
    this.chapterTexts.set(chapterId, newText);
    
    // Debounce the actual processing
    if (this.editDebounceTimer) {
      clearTimeout(this.editDebounceTimer);
    }
    
    this.editDebounceTimer = setTimeout(() => {
      this.applyEdit(chapterId, newText, editStart, editEnd);
    }, this.config.editDebounceMs);
  }

  /**
   * Apply an edit after debounce
   */
  private applyEdit(chapterId: string, newText: string, editStart: number, editEnd: number): void {
    // Build edit descriptor for the index
    // Note: The index primarily uses this to identify the affected chapter
    // and mark it dirty. Scene chunks are re-created after this call.
    const edit: ChunkEdit = {
      start: editStart,
      end: editEnd,
      newLength: newText.length, // Full new chapter length
      chapterId,
      timestamp: Date.now(),
    };
    
    // Apply to index (marks chunks dirty)
    this.index.applyEdit(edit, newText);
    
    // Re-parse scenes since structure may have changed
    // This replaces all scene chunks with fresh ones based on current text
    const structural = parseStructure(newText);
    this.index.registerScenesForChapter(chapterId, newText, structural);
  }

  /**
   * Register a new chapter
   */
  registerChapter(chapterId: string, content: string): void {
    this.chapterTexts.set(chapterId, content);
    
    const chapterChunkId = createChunkId('chapter', chapterId);
    
    // Register chapter chunk
    this.index.registerChunk(
      chapterChunkId,
      'chapter',
      0,
      content.length,
      content,
      'book'
    );
    
    // Parse and register scenes
    const structural = parseStructure(content);
    this.index.registerScenesForChapter(chapterId, content, structural);
  }

  /**
   * Remove a chapter and its chunks
   */
  removeChapter(chapterId: string): void {
    this.chapterTexts.delete(chapterId);
    const chapterChunkId = createChunkId('chapter', chapterId);
    this.index.removeChunk(chapterChunkId);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PROCESSING
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Schedule background processing
   */
  private scheduleProcessing(): void {
    if (this.processingTimer) return;
    
    // Wait for idle
    const timeSinceEdit = Date.now() - this.lastEditTime;
    const delay = Math.max(0, this.config.idleThresholdMs - timeSinceEdit);
    
    this.processingTimer = setTimeout(() => {
      this.processingTimer = null;
      this.processNextBatch();
    }, delay);
  }

  /**
   * Process the next batch of dirty chunks
   */
  private async processNextBatch(): Promise<void> {
    if (this.isProcessing) return;
    if (!this.index.hasDirtyChunks()) return;
    
    this.isProcessing = true;
    this.onProcessingStart?.();
    
    try {
      let processed = 0;
      
      while (processed < this.config.maxBatchSize && this.index.hasDirtyChunks()) {
        // Check if user has started editing again
        if (Date.now() - this.lastEditTime < this.config.idleThresholdMs) {
          break;
        }
        
        const chunkId = this.index.dequeueNext();
        if (!chunkId) break;
        
        await this.processChunk(chunkId);
        processed++;
        
        // Small delay between chunks
        if (processed < this.config.maxBatchSize) {
          await new Promise(r => setTimeout(r, this.config.processingIntervalMs));
        }
      }
    } finally {
      this.isProcessing = false;
      this.onProcessingEnd?.();
      
      // Schedule more processing if needed
      if (this.index.hasDirtyChunks()) {
        this.scheduleProcessing();
      }
    }
  }

  /**
   * Process a single chunk
   */
  private async processChunk(chunkId: ChunkId): Promise<void> {
    const chunk = this.index.getChunk(chunkId);
    if (!chunk) return;
    
    this.index.markProcessing(chunkId);
    
    try {
      // Get the text for this chunk
      const text = this.getChunkText(chunk);
      if (!text) {
        throw new Error('Could not get chunk text');
      }
      
      // Process based on level
      let analysis: ChunkAnalysis;
      
      if (chunk.level === 'scene' || chunk.level === 'chapter') {
        analysis = await this.analyzeTextChunk(text, chunkId);
      } else {
        // Higher levels aggregate from children
        analysis = this.aggregateFromChildren(chunk);
      }
      
      this.index.updateAnalysis(chunkId, analysis);
      this.onChunkProcessed?.(chunkId, analysis);
      
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.index.markError(chunkId, message);
      this.onError?.(chunkId, message);
    }
  }

  /**
   * Get the text content for a chunk
   */
  private getChunkText(chunk: ChunkRecord): string | null {
    if (chunk.level === 'chapter') {
      // Get from cache
      const chapterId = chunk.id.replace('chapter-', '');
      return this.chapterTexts.get(chapterId) || null;
    }
    
    if (chunk.level === 'scene') {
      // Get parent chapter text and slice
      const parentChunk = chunk.parentId ? this.index.getChunk(chunk.parentId) : null;
      if (!parentChunk) return null;
      
      const chapterId = parentChunk.id.replace('chapter-', '');
      const chapterText = this.chapterTexts.get(chapterId);
      if (!chapterText) return null;
      
      return chapterText.slice(chunk.startIndex, chunk.endIndex);
    }
    
    return null;
  }

  /**
   * Analyze a text chunk using the intelligence layer
   */
  private async analyzeTextChunk(text: string, chunkId: ChunkId): Promise<ChunkAnalysis> {
    // Use the existing cached processing
    const intelligence = processManuscriptCached(text, chunkId);
    
    // Extract the analysis summary
    return this.intelligenceToChunkAnalysis(intelligence);
  }

  /**
   * Convert ManuscriptIntelligence to ChunkAnalysis
   */
  private intelligenceToChunkAnalysis(intel: ManuscriptIntelligence): ChunkAnalysis {
    const { structural, entities, style, heatmap, timeline } = intel;
    
    // Calculate average tension
    const tensions = structural.scenes.map(s => s.tension);
    const avgTension = tensions.length > 0
      ? tensions.reduce((a, b) => a + b, 0) / tensions.length
      : 0.5;
    
    // Calculate risk score from heatmap
    const riskScores = heatmap.sections.map(s => s.overallRisk);
    const riskScore = riskScores.length > 0
      ? riskScores.reduce((a, b) => a + b, 0) / riskScores.length
      : 0;
    
    // Get character and location names
    const characterNames = entities.nodes
      .filter(n => n.type === 'character')
      .map(n => n.name);
    const locationNames = entities.nodes
      .filter(n => n.type === 'location')
      .map(n => n.name);
    
    // Get time markers
    const timeMarkers = structural.scenes
      .map(s => s.timeMarker)
      .filter(Boolean) as string[];
    
    // Get open promises
    const openPromises = timeline.promises
      .filter(p => !p.resolved)
      .map(p => p.description);
    
    // Get style flags
    const styleFlags: string[] = [];
    if (style.flags.passiveVoiceRatio > 0.15) styleFlags.push('passive_voice_heavy');
    if (style.flags.adverbDensity > 0.05) styleFlags.push('adverb_overuse');
    if (style.flags.filterWordDensity > 0.03) styleFlags.push('filter_words');
    if (style.syntax.avgSentenceLength > 30) styleFlags.push('long_sentences');
    if (style.syntax.avgSentenceLength < 8) styleFlags.push('short_sentences');
    
    // Generate summary
    const summary = `${structural.stats.totalWords} words, ` +
      `${structural.scenes.length} scene(s), ` +
      `${characterNames.length} character(s), ` +
      `tension ${(avgTension * 10).toFixed(0)}/10`;
    
    return {
      summary,
      wordCount: structural.stats.totalWords,
      dialogueRatio: structural.stats.dialogueRatio,
      avgTension,
      characterNames,
      locationNames,
      timeMarkers,
      openPromises,
      styleFlags,
      riskScore,
      structural,
      entities,
      style,
      processedAt: Date.now(),
    };
  }

  /**
   * Build analysis for higher-level chunks by aggregating children
   */
  private aggregateFromChildren(chunk: ChunkRecord): ChunkAnalysis {
    const children = this.index.getChildren(chunk.id);
    const analyses = children
      .map(c => c.analysis)
      .filter(Boolean) as ChunkAnalysis[];
    
    if (analyses.length === 0) {
      // Return empty analysis
      return {
        summary: 'No data',
        wordCount: 0,
        dialogueRatio: 0,
        avgTension: 0.5,
        characterNames: [],
        locationNames: [],
        timeMarkers: [],
        openPromises: [],
        styleFlags: [],
        riskScore: 0,
        processedAt: Date.now(),
      };
    }
    
    const totalWords = analyses.reduce((sum, a) => sum + a.wordCount, 0);
    const avgDialogue = analyses.reduce((sum, a) => sum + a.dialogueRatio, 0) / analyses.length;
    const avgTension = analyses.reduce((sum, a) => sum + a.avgTension, 0) / analyses.length;
    const avgRisk = analyses.reduce((sum, a) => sum + a.riskScore, 0) / analyses.length;
    
    return {
      summary: `${totalWords} words across ${children.length} sections`,
      wordCount: totalWords,
      dialogueRatio: avgDialogue,
      avgTension,
      characterNames: [...new Set(analyses.flatMap(a => a.characterNames))],
      locationNames: [...new Set(analyses.flatMap(a => a.locationNames))],
      timeMarkers: [...new Set(analyses.flatMap(a => a.timeMarkers))],
      openPromises: [...new Set(analyses.flatMap(a => a.openPromises))],
      styleFlags: [...new Set(analyses.flatMap(a => a.styleFlags))],
      riskScore: avgRisk,
      processedAt: Date.now(),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // QUERIES
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get chunk by ID
   */
  getChunk(chunkId: ChunkId): ChunkRecord | undefined {
    return this.index.getChunk(chunkId);
  }

  /**
   * Get chapter chunk
   */
  getChapterChunk(chapterId: string): ChunkRecord | undefined {
    return this.index.getChunk(createChunkId('chapter', chapterId));
  }

  /**
   * Get aggregate summary for a chunk
   */
  getAggregate(chunkId: ChunkId): AggregateSummary | undefined {
    return this.index.getAggregate(chunkId);
  }

  /**
   * Get analysis for a specific cursor position
   */
  getAnalysisAtCursor(chapterId: string, offset: number): ChunkAnalysis | null {
    const chunk = this.index.getChunkAtOffset(chapterId, offset);
    return chunk?.analysis || null;
  }

  /**
   * Get all chapter analyses
   */
  getAllChapterAnalyses(): Map<string, ChunkAnalysis | null> {
    const result = new Map<string, ChunkAnalysis | null>();
    
    for (const chunk of this.index.getChunksByLevel('chapter')) {
      const chapterId = chunk.id.replace('chapter-', '');
      result.set(chapterId, chunk.analysis);
    }
    
    return result;
  }

  /**
   * Get the full book summary
   */
  getBookSummary(): AggregateSummary | undefined {
    return this.index.getAggregate('book');
  }

  /**
   * Get processing stats
   */
  getStats() {
    return {
      ...this.index.getStats(),
      isProcessing: this.isProcessing,
      chapterCount: this.chapterTexts.size,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MANUAL CONTROLS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Force process all dirty chunks now
   */
  async processAllDirty(): Promise<void> {
    while (this.index.hasDirtyChunks()) {
      const chunkId = this.index.dequeueNext();
      if (chunkId) {
        await this.processChunk(chunkId);
      }
    }
  }

  /**
   * Force reprocess a specific chunk
   */
  async reprocessChunk(chunkId: ChunkId): Promise<void> {
    this.index.markDirty(chunkId);
    await this.processChunk(chunkId);
  }

  /**
   * Retry all errored chunks
   */
  retryErrors(): ChunkId[] {
    return this.index.retryErroredChunks();
  }

  /**
   * Pause background processing
   */
  pause(): void {
    if (this.processingTimer) {
      clearTimeout(this.processingTimer);
      this.processingTimer = null;
    }
  }

  /**
   * Resume background processing
   */
  resume(): void {
    if (this.index.hasDirtyChunks()) {
      this.scheduleProcessing();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PERSISTENCE
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Export state for persistence
   */
  exportState(): { index: ChunkIndexState; chapterTexts: Record<string, string> } {
    const chapterTexts: Record<string, string> = {};
    for (const [id, text] of this.chapterTexts) {
      chapterTexts[id] = text;
    }
    
    return {
      index: this.index.exportState(),
      chapterTexts,
    };
  }

  /**
   * Load state from persistence
   */
  loadState(state: { index: ChunkIndexState; chapterTexts: Record<string, string> }): void {
    this.index.loadState(state.index);
    
    this.chapterTexts.clear();
    for (const [id, text] of Object.entries(state.chapterTexts)) {
      this.chapterTexts.set(id, text);
    }
  }

  /**
   * Clear all state
   */
  clear(): void {
    this.pause();
    this.index.clear();
    this.chapterTexts.clear();
  }

  /**
   * Destroy the manager
   */
  destroy(): void {
    this.pause();
    if (this.editDebounceTimer) {
      clearTimeout(this.editDebounceTimer);
    }
    this.clear();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FACTORY
// ─────────────────────────────────────────────────────────────────────────────

export const createChunkManager = (
  config?: Partial<ChunkManagerConfig>,
  callbacks?: {
    onProcessingStart?: () => void;
    onProcessingEnd?: () => void;
    onChunkProcessed?: (chunkId: ChunkId, analysis: ChunkAnalysis) => void;
    onError?: (chunkId: ChunkId, error: string) => void;
    onQueueChange?: (dirtyCount: number) => void;
  }
): ChunkManager => {
  return new ChunkManager(config, callbacks);
};
