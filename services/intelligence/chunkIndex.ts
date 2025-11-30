/**
 * Chunk Index
 * 
 * Core data structure for managing manuscript chunks:
 * - Maintains chunk records with position, hash, status
 * - Handles edit events → marks affected chunks dirty
 * - Shifts positions for all chunks after an edit
 * - Tracks hierarchy (scene → chapter → act → book)
 */

import {
  ChunkId,
  ChunkLevel,
  ChunkStatus,
  ChunkRecord,
  ChunkAnalysis,
  ChunkEdit,
  ChunkIndexState,
  AggregateSummary,
  StructuralFingerprint,
} from '../../types/intelligence';
import { hashContent } from './deltaTracker';

// ─────────────────────────────────────────────────────────────────────────────
// CHUNK ID UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

export const createChunkId = (level: ChunkLevel, ...parts: string[]): ChunkId => {
  switch (level) {
    case 'book':
      return 'book';
    case 'act':
      return `act-${parts[0]}`;
    case 'chapter':
      return `chapter-${parts[0]}`;
    case 'scene':
      return `chapter-${parts[0]}-scene-${parts[1]}`;
  }
};

export const parseChunkId = (id: ChunkId): { level: ChunkLevel; parts: string[] } => {
  if (id === 'book') {
    return { level: 'book', parts: [] };
  }
  if (id.startsWith('act-')) {
    return { level: 'act', parts: [id.slice(4)] };
  }
  if (id.includes('-scene-')) {
    const [chapterPart, scenePart] = id.split('-scene-');
    return { level: 'scene', parts: [chapterPart.replace('chapter-', ''), scenePart] };
  }
  if (id.startsWith('chapter-')) {
    return { level: 'chapter', parts: [id.slice(8)] };
  }
  return { level: 'chapter', parts: [id] };
};

// ─────────────────────────────────────────────────────────────────────────────
// CHUNK INDEX CLASS
// ─────────────────────────────────────────────────────────────────────────────

export class ChunkIndex {
  private chunks: Map<ChunkId, ChunkRecord> = new Map();
  private aggregates: Map<ChunkId, AggregateSummary> = new Map();
  private dirtyQueue: ChunkId[] = [];
  private lastFullRebuild: number | null = null;
  
  // Event callbacks
  private onChunkDirty?: (chunkId: ChunkId) => void;
  private onQueueUpdated?: (queue: ChunkId[]) => void;

  constructor(
    initialState?: ChunkIndexState,
    callbacks?: {
      onChunkDirty?: (chunkId: ChunkId) => void;
      onQueueUpdated?: (queue: ChunkId[]) => void;
    }
  ) {
    if (initialState) {
      this.loadState(initialState);
    }
    if (callbacks) {
      this.onChunkDirty = callbacks.onChunkDirty;
      this.onQueueUpdated = callbacks.onQueueUpdated;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CHUNK CRUD
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Register a new chunk (e.g., when a chapter is created or scenes are parsed)
   */
  registerChunk(
    id: ChunkId,
    level: ChunkLevel,
    startIndex: number,
    endIndex: number,
    text: string,
    parentId: ChunkId | null = null
  ): ChunkRecord {
    const hash = hashContent(text);
    
    const record: ChunkRecord = {
      id,
      level,
      startIndex,
      endIndex,
      hash,
      status: 'dirty', // New chunks start dirty
      lastProcessedAt: null,
      analysis: null,
      parentId,
      childIds: [],
    };
    
    this.chunks.set(id, record);
    
    // Add to parent's children
    if (parentId) {
      const parent = this.chunks.get(parentId);
      if (parent && !parent.childIds.includes(id)) {
        parent.childIds.push(id);
      }
    }
    
    // Add to dirty queue
    this.enqueueDirty(id);
    
    return record;
  }

  /**
   * Get a chunk by ID
   */
  getChunk(id: ChunkId): ChunkRecord | undefined {
    return this.chunks.get(id);
  }

  /**
   * Get all chunks at a specific level
   */
  getChunksByLevel(level: ChunkLevel): ChunkRecord[] {
    return Array.from(this.chunks.values()).filter(c => c.level === level);
  }

  /**
   * Get children of a chunk
   */
  getChildren(id: ChunkId): ChunkRecord[] {
    const chunk = this.chunks.get(id);
    if (!chunk) return [];
    return chunk.childIds.map(cid => this.chunks.get(cid)).filter(Boolean) as ChunkRecord[];
  }

  /**
   * Remove a chunk and its children
   */
  removeChunk(id: ChunkId): void {
    const chunk = this.chunks.get(id);
    if (!chunk) return;
    
    // Remove children recursively
    for (const childId of chunk.childIds) {
      this.removeChunk(childId);
    }
    
    // Remove from parent
    if (chunk.parentId) {
      const parent = this.chunks.get(chunk.parentId);
      if (parent) {
        parent.childIds = parent.childIds.filter(cid => cid !== id);
      }
    }
    
    // Remove from queue
    this.dirtyQueue = this.dirtyQueue.filter(qid => qid !== id);
    
    // Remove chunk and aggregate
    this.chunks.delete(id);
    this.aggregates.delete(id);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // EDIT HANDLING
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Apply an edit and update affected chunks
   * This is the core method called on every text change.
   * Note: Scene chunks are typically re-created after this call,
   * so we only update the chapter-level tracking here.
   */
  applyEdit(edit: ChunkEdit, newText: string): ChunkId[] {
    const { chapterId } = edit;
    const affectedChunks: ChunkId[] = [];
    
    // Find the chapter chunk
    const chapterChunkId = createChunkId('chapter', chapterId);
    const chapterChunk = this.chunks.get(chapterChunkId);
    
    if (!chapterChunk) {
      // Chapter doesn't exist in index yet - register it
      this.registerChunk(
        chapterChunkId,
        'chapter',
        0,
        newText.length,
        newText,
        'book'
      );
      return [chapterChunkId];
    }
    
    // Update chapter hash and mark dirty if changed
    const newHash = hashContent(newText);
    if (chapterChunk.hash !== newHash) {
      chapterChunk.hash = newHash;
      chapterChunk.endIndex = newText.length;
      this.markDirty(chapterChunkId);
      affectedChunks.push(chapterChunkId);
      
      // Propagate dirty status up the hierarchy
      this.propagateDirty(chapterChunkId);
    }
    
    return affectedChunks;
  }

  /**
   * Mark a chunk as dirty and add to queue
   */
  markDirty(id: ChunkId): void {
    const chunk = this.chunks.get(id);
    if (!chunk) return;
    
    if (chunk.status !== 'dirty') {
      chunk.status = 'dirty';
      chunk.analysis = null; // Invalidate cached analysis
      this.enqueueDirty(id);
      this.onChunkDirty?.(id);
    }
  }

  /**
   * Propagate dirty status up to parent chunks
   */
  private propagateDirty(id: ChunkId): void {
    const chunk = this.chunks.get(id);
    if (!chunk || !chunk.parentId) return;
    
    const parent = this.chunks.get(chunk.parentId);
    if (parent && parent.status === 'fresh') {
      parent.status = 'dirty';
      // Don't invalidate parent analysis entirely - just mark for re-aggregation
      this.aggregates.delete(chunk.parentId);
      this.propagateDirty(chunk.parentId);
    }
  }

  /**
   * Add chunk to dirty queue (with deduplication)
   */
  private enqueueDirty(id: ChunkId): void {
    if (!this.dirtyQueue.includes(id)) {
      this.dirtyQueue.push(id);
      this.onQueueUpdated?.(this.dirtyQueue);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PROCESSING
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get the next chunk to process from the queue
   * Prioritizes: high priority > scenes before chapters > older items
   */
  dequeueNext(): ChunkId | null {
    if (this.dirtyQueue.length === 0) return null;
    
    // Sort by priority: scenes first (smaller units), then by position in queue
    const sorted = [...this.dirtyQueue].sort((a, b) => {
      const chunkA = this.chunks.get(a);
      const chunkB = this.chunks.get(b);
      
      if (!chunkA || !chunkB) return 0;
      
      // Scenes before chapters before acts before book
      const levelOrder: Record<ChunkLevel, number> = {
        scene: 0,
        chapter: 1,
        act: 2,
        book: 3,
      };
      
      return levelOrder[chunkA.level] - levelOrder[chunkB.level];
    });
    
    const nextId = sorted[0];
    this.dirtyQueue = this.dirtyQueue.filter(id => id !== nextId);
    this.onQueueUpdated?.(this.dirtyQueue);
    
    return nextId;
  }

  /**
   * Mark a chunk as processing
   */
  markProcessing(id: ChunkId): void {
    const chunk = this.chunks.get(id);
    if (chunk) {
      chunk.status = 'processing';
    }
  }

  /**
   * Update a chunk with fresh analysis
   */
  updateAnalysis(id: ChunkId, analysis: ChunkAnalysis): void {
    const chunk = this.chunks.get(id);
    if (!chunk) return;
    
    chunk.analysis = analysis;
    chunk.status = 'fresh';
    chunk.lastProcessedAt = Date.now();
    chunk.errorMessage = undefined;
    
    // Check if all siblings are fresh - if so, parent can aggregate
    if (chunk.parentId) {
      this.tryAggregate(chunk.parentId);
    }
  }

  /**
   * Mark a chunk as errored
   */
  markError(id: ChunkId, error: string): void {
    const chunk = this.chunks.get(id);
    if (chunk) {
      chunk.status = 'error';
      chunk.errorMessage = error;
    }
  }

  /**
   * Retry all errored chunks by re-marking them dirty
   */
  retryErroredChunks(): ChunkId[] {
    const retried: ChunkId[] = [];
    for (const chunk of this.chunks.values()) {
      if (chunk.status === 'error') {
        chunk.status = 'dirty';
        chunk.errorMessage = undefined;
        this.enqueueDirty(chunk.id);
        retried.push(chunk.id);
      }
    }
    return retried;
  }

  /**
   * Try to aggregate a parent chunk if all children are fresh
   */
  private tryAggregate(parentId: ChunkId): void {
    const parent = this.chunks.get(parentId);
    if (!parent) return;
    
    const children = this.getChildren(parentId);
    const allFresh = children.every(c => c.status === 'fresh' && c.analysis);
    
    if (!allFresh) return;
    
    // Build aggregate summary
    const aggregate = this.buildAggregate(parent, children);
    this.aggregates.set(parentId, aggregate);
    
    // Mark parent as fresh and recurse up
    parent.status = 'fresh';
    parent.lastProcessedAt = Date.now();
    
    if (parent.parentId) {
      this.tryAggregate(parent.parentId);
    }
  }

  /**
   * Build an aggregate summary from children
   */
  private buildAggregate(parent: ChunkRecord, children: ChunkRecord[]): AggregateSummary {
    const analyses = children.map(c => c.analysis!).filter(Boolean);
    
    const totalWordCount = analyses.reduce((sum, a) => sum + a.wordCount, 0);
    const avgDialogueRatio = analyses.length > 0
      ? analyses.reduce((sum, a) => sum + a.dialogueRatio, 0) / analyses.length
      : 0;
    const avgTension = analyses.length > 0
      ? analyses.reduce((sum, a) => sum + a.avgTension, 0) / analyses.length
      : 0;
    
    // Merge entity lists
    const allCharacters = [...new Set(analyses.flatMap(a => a.characterNames))];
    const allLocations = [...new Set(analyses.flatMap(a => a.locationNames))];
    
    // Collect unresolved promises
    const unresolvedPromises = [...new Set(analyses.flatMap(a => a.openPromises))];
    
    // Find hotspots (top 3 highest risk)
    const hotspots = children
      .filter(c => c.analysis && c.analysis.riskScore > 0.5)
      .sort((a, b) => (b.analysis?.riskScore || 0) - (a.analysis?.riskScore || 0))
      .slice(0, 3)
      .map(c => ({
        chunkId: c.id,
        riskScore: c.analysis!.riskScore,
        reason: c.analysis!.styleFlags[0] || 'High risk section',
      }));
    
    // Generate a simple narrative summary
    const narrativeSummary = `${parent.level === 'chapter' ? 'Chapter' : 'Section'} with ${totalWordCount} words, ` +
      `${allCharacters.length} characters, tension level ${(avgTension * 10).toFixed(0)}/10.`;
    
    return {
      chunkId: parent.id,
      level: parent.level,
      totalWordCount,
      avgDialogueRatio,
      avgTension,
      allCharacters,
      allLocations,
      unresolvedPromises,
      hotspots,
      narrativeSummary,
      generatedAt: Date.now(),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SCENE CHUNKING
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Register scenes for a chapter based on structural parsing
   */
  registerScenesForChapter(
    chapterId: string,
    chapterText: string,
    structural: StructuralFingerprint
  ): ChunkId[] {
    const chapterChunkId = createChunkId('chapter', chapterId);
    const sceneIds: ChunkId[] = [];
    
    // Remove existing scene chunks for this chapter
    const existingChapter = this.chunks.get(chapterChunkId);
    if (existingChapter) {
      for (const childId of [...existingChapter.childIds]) {
        if (parseChunkId(childId).level === 'scene') {
          this.removeChunk(childId);
        }
      }
    }
    
    // Create scene chunks
    for (let i = 0; i < structural.scenes.length; i++) {
      const scene = structural.scenes[i];
      const sceneId = createChunkId('scene', chapterId, String(i));
      const sceneText = chapterText.slice(scene.startOffset, scene.endOffset);
      
      this.registerChunk(
        sceneId,
        'scene',
        scene.startOffset,
        scene.endOffset,
        sceneText,
        chapterChunkId
      );
      
      sceneIds.push(sceneId);
    }
    
    return sceneIds;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // QUERIES
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get the aggregate summary for a chunk
   */
  getAggregate(id: ChunkId): AggregateSummary | undefined {
    return this.aggregates.get(id);
  }

  /**
   * Get all dirty chunk IDs
   */
  getDirtyChunks(): ChunkId[] {
    return [...this.dirtyQueue];
  }

  /**
   * Get count of dirty chunks
   */
  getDirtyCount(): number {
    return this.dirtyQueue.length;
  }

  /**
   * Check if any chunks are dirty
   */
  hasDirtyChunks(): boolean {
    return this.dirtyQueue.length > 0;
  }

  /**
   * Get chunk containing a specific offset in a chapter
   */
  getChunkAtOffset(chapterId: string, offset: number): ChunkRecord | undefined {
    const chapterChunkId = createChunkId('chapter', chapterId);
    const chapter = this.chunks.get(chapterChunkId);
    if (!chapter) return undefined;
    
    // Look for scene at offset
    for (const sceneId of chapter.childIds) {
      const scene = this.chunks.get(sceneId);
      if (scene && offset >= scene.startIndex && offset < scene.endIndex) {
        return scene;
      }
    }
    
    // Fall back to chapter
    return chapter;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SERIALIZATION
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Export state for persistence
   */
  exportState(): ChunkIndexState {
    const chunks: Record<ChunkId, ChunkRecord> = {};
    const aggregates: Record<ChunkId, AggregateSummary> = {};
    
    for (const [id, chunk] of this.chunks) {
      chunks[id] = chunk;
    }
    for (const [id, agg] of this.aggregates) {
      aggregates[id] = agg;
    }
    
    return {
      chunks,
      aggregates,
      dirtyQueue: [...this.dirtyQueue],
      lastFullRebuild: this.lastFullRebuild,
      totalChunks: this.chunks.size,
      dirtyCount: this.dirtyQueue.length,
    };
  }

  /**
   * Load state from persistence
   */
  loadState(state: ChunkIndexState): void {
    this.chunks.clear();
    this.aggregates.clear();
    
    for (const [id, chunk] of Object.entries(state.chunks)) {
      this.chunks.set(id, chunk);
    }
    for (const [id, agg] of Object.entries(state.aggregates)) {
      this.aggregates.set(id, agg);
    }
    
    this.dirtyQueue = [...state.dirtyQueue];
    this.lastFullRebuild = state.lastFullRebuild;
  }

  /**
   * Clear all state
   */
  clear(): void {
    this.chunks.clear();
    this.aggregates.clear();
    this.dirtyQueue = [];
    this.lastFullRebuild = null;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STATS
  // ─────────────────────────────────────────────────────────────────────────────

  getStats(): {
    totalChunks: number;
    dirtyCount: number;
    freshCount: number;
    processingCount: number;
    errorCount: number;
    byLevel: Record<ChunkLevel, number>;
  } {
    const byLevel: Record<ChunkLevel, number> = {
      scene: 0,
      chapter: 0,
      act: 0,
      book: 0,
    };
    
    let freshCount = 0;
    let processingCount = 0;
    let errorCount = 0;
    
    for (const chunk of this.chunks.values()) {
      byLevel[chunk.level]++;
      if (chunk.status === 'fresh') freshCount++;
      if (chunk.status === 'processing') processingCount++;
      if (chunk.status === 'error') errorCount++;
    }
    
    return {
      totalChunks: this.chunks.size,
      dirtyCount: this.dirtyQueue.length,
      freshCount,
      processingCount,
      errorCount,
      byLevel,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FACTORY
// ─────────────────────────────────────────────────────────────────────────────

export const createChunkIndex = (
  initialState?: ChunkIndexState,
  callbacks?: {
    onChunkDirty?: (chunkId: ChunkId) => void;
    onQueueUpdated?: (queue: ChunkId[]) => void;
  }
): ChunkIndex => {
  return new ChunkIndex(initialState, callbacks);
};
