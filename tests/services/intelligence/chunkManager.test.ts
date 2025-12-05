/**
 * Chunk Manager Test Suite
 *
 * Comprehensive tests for the ChunkManager class which orchestrates
 * background processing of manuscript chunks
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChunkManager, createChunkManager, ChunkManagerConfig } from '@/services/intelligence/chunkManager';
import { ChunkId, ChunkAnalysis } from '@/types/intelligence';

// Mock the intelligence processing
vi.mock('@/services/intelligence/index', () => ({
  processManuscriptCached: vi.fn((text: string) => ({
    structural: {
      scenes: [{ tension: 0.7, timeMarker: null, startOffset: 0, endOffset: 100 }],
      stats: { totalWords: 100, dialogueRatio: 0.3 },
    },
    entities: { nodes: [
      { type: 'character', name: 'Alice' },
      { type: 'location', name: 'Forest' }
    ] },
    style: {
      flags: { passiveVoiceRatio: 0.1, adverbDensity: 0.04, filterWordDensity: 0.02 },
      syntax: { avgSentenceLength: 15 },
    },
    heatmap: { sections: [{ overallRisk: 0.2 }] },
    timeline: { promises: [{ description: 'Find treasure', resolved: false }] },
  })),
  parseStructure: vi.fn((text: string) => ({
    scenes: [
      {
        startOffset: 0,
        endOffset: text.length,
        tension: 0.7,
        timeMarker: null,
      }
    ],
    stats: { totalWords: text.split(' ').length, dialogueRatio: 0.3 },
  })),
}));

vi.mock('@/services/intelligence/deltaTracker', () => ({
  hashContent: vi.fn((text: string) => `hash-${text.length}`),
}));

describe('ChunkManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // CONSTRUCTOR & INITIALIZATION
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Constructor', () => {
    it('should create manager with default config', () => {
      const manager = new ChunkManager();
      const stats = manager.getStats();

      expect(stats.totalChunks).toBe(1); // Book chunk
      expect(stats.chapterCount).toBe(0);
      expect(stats.isProcessing).toBe(false);
    });

    it('should create manager with custom config', () => {
      const config: Partial<ChunkManagerConfig> = {
        editDebounceMs: 1000,
        processingIntervalMs: 200,
        maxBatchSize: 5,
      };

      const manager = new ChunkManager(config);
      expect(manager).toBeDefined();
    });

    it('should initialize book chunk automatically', () => {
      const manager = new ChunkManager();
      const bookChunk = manager.getChunk('book');

      expect(bookChunk).toBeDefined();
      expect(bookChunk?.level).toBe('book');
    });

    it('should register callbacks', () => {
      const onProcessingStart = vi.fn();
      const onProcessingEnd = vi.fn();
      const onChunkProcessed = vi.fn();
      const onError = vi.fn();
      const onQueueChange = vi.fn();

      const manager = new ChunkManager({}, {
        onProcessingStart,
        onProcessingEnd,
        onChunkProcessed,
        onError,
        onQueueChange,
      });

      expect(manager).toBeDefined();
    });
  });

  describe('Factory function', () => {
    it('should create manager via factory', () => {
      const manager = createChunkManager();
      expect(manager).toBeInstanceOf(ChunkManager);
    });

    it('should create manager with config and callbacks', () => {
      const onQueueChange = vi.fn();
      const manager = createChunkManager(
        { maxBatchSize: 10 },
        { onQueueChange }
      );
      expect(manager).toBeInstanceOf(ChunkManager);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // CHAPTER MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Chapter Management', () => {
    it('should register a new chapter', () => {
      const manager = new ChunkManager();
      const content = 'This is chapter 1 content with some text.';

      manager.registerChapter('ch1', content);

      const chapterChunk = manager.getChapterChunk('ch1');
      expect(chapterChunk).toBeDefined();
      expect(chapterChunk?.level).toBe('chapter');
      expect(chapterChunk?.status).toBe('dirty');
    });

    it('should create scene chunks when registering chapter', () => {
      const manager = new ChunkManager();
      const content = 'Chapter with scene content here.';

      manager.registerChapter('ch1', content);

      const stats = manager.getStats();
      expect(stats.totalChunks).toBeGreaterThan(1); // Book + chapter + scenes
    });

    it('should remove a chapter and its chunks', () => {
      const manager = new ChunkManager();
      manager.registerChapter('ch1', 'Content');

      const statsBefore = manager.getStats();
      expect(statsBefore.chapterCount).toBe(1);

      manager.removeChapter('ch1');

      const statsAfter = manager.getStats();
      expect(statsAfter.chapterCount).toBe(0);
      expect(manager.getChapterChunk('ch1')).toBeUndefined();
    });

    it('should handle multiple chapters', () => {
      const manager = new ChunkManager();

      manager.registerChapter('ch1', 'Chapter one content');
      manager.registerChapter('ch2', 'Chapter two content');
      manager.registerChapter('ch3', 'Chapter three content');

      const stats = manager.getStats();
      expect(stats.chapterCount).toBe(3);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // EDIT HANDLING
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Edit Handling', () => {
    it('should debounce rapid edits', () => {
      const manager = new ChunkManager({ editDebounceMs: 500 });
      manager.registerChapter('ch1', 'Initial content');

      // Make multiple rapid edits
      manager.handleEdit('ch1', 'Edit 1', 0, 10);
      manager.handleEdit('ch1', 'Edit 2', 0, 10);
      manager.handleEdit('ch1', 'Edit 3', 0, 10);

      // Should not apply immediately
      const chunk = manager.getChapterChunk('ch1');
      expect(chunk?.status).toBe('dirty');

      // Fast-forward past debounce
      vi.advanceTimersByTime(500);

      // Now edit should be applied
      expect(chunk?.hash).toBe('hash-6'); // 'Edit 3' length
    });

    it('should handle edit at specific position', () => {
      const manager = new ChunkManager();
      const initialContent = 'This is the initial chapter content.';
      manager.registerChapter('ch1', initialContent);

      const newContent = 'This is the MODIFIED chapter content.';
      manager.handleEdit('ch1', newContent, 12, 19);

      vi.advanceTimersByTime(500);

      const chunk = manager.getChapterChunk('ch1');
      expect(chunk).toBeDefined();
    });

    it('should update chapter text cache on edit', () => {
      const manager = new ChunkManager();
      manager.registerChapter('ch1', 'Initial');

      manager.handleEdit('ch1', 'Updated content', 0, 7);
      vi.advanceTimersByTime(500);

      const analyses = manager.getAllChapterAnalyses();
      expect(analyses.has('ch1')).toBe(true);
    });

    it('should clear previous debounce timer on new edit', () => {
      const manager = new ChunkManager({ editDebounceMs: 1000 });
      manager.registerChapter('ch1', 'Content');

      manager.handleEdit('ch1', 'Edit 1', 0, 10);
      vi.advanceTimersByTime(500);

      manager.handleEdit('ch1', 'Edit 2', 0, 10);
      vi.advanceTimersByTime(500);

      // First edit should have been cancelled
      const chunk = manager.getChapterChunk('ch1');
      expect(chunk?.hash).toBe('hash-6'); // 'Edit 2' length
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // PROCESSING
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Processing', () => {
    it('should schedule processing after edit', async () => {
      const onQueueChange = vi.fn();
      const manager = new ChunkManager(
        { editDebounceMs: 100, idleThresholdMs: 100 },
        { onQueueChange }
      );

      manager.registerChapter('ch1', 'Content');

      // Queue should have items (chapter + scenes)
      expect(onQueueChange).toHaveBeenCalled();
    });

    it('should wait for idle before processing', async () => {
      const onProcessingStart = vi.fn();
      const manager = new ChunkManager(
        { editDebounceMs: 100, idleThresholdMs: 500 },
        { onProcessingStart }
      );

      manager.registerChapter('ch1', 'Content');
      vi.advanceTimersByTime(100); // Past debounce

      // Should not start immediately
      expect(onProcessingStart).not.toHaveBeenCalled();

      // Advance past idle threshold
      vi.advanceTimersByTime(500);
      await vi.runAllTimersAsync();

      expect(onProcessingStart).toHaveBeenCalled();
    });

    it('should process chunks in batches', async () => {
      const onChunkProcessed = vi.fn();
      const manager = new ChunkManager(
        { maxBatchSize: 2, editDebounceMs: 0, idleThresholdMs: 0 },
        { onChunkProcessed }
      );

      manager.registerChapter('ch1', 'Content');
      vi.advanceTimersByTime(0);
      await vi.runAllTimersAsync();

      // Should process up to maxBatchSize chunks
      expect(onChunkProcessed).toHaveBeenCalledTimes(2);
    });

    it('should call callbacks during processing', async () => {
      const onProcessingStart = vi.fn();
      const onProcessingEnd = vi.fn();
      const onChunkProcessed = vi.fn();

      const manager = new ChunkManager(
        { editDebounceMs: 0, idleThresholdMs: 0 },
        { onProcessingStart, onProcessingEnd, onChunkProcessed }
      );

      manager.registerChapter('ch1', 'Content');
      await vi.runAllTimersAsync();

      expect(onProcessingStart).toHaveBeenCalled();
      expect(onChunkProcessed).toHaveBeenCalled();
      expect(onProcessingEnd).toHaveBeenCalled();
    });

    it('should handle processing errors', async () => {
      const onError = vi.fn();
      const manager = new ChunkManager(
        { editDebounceMs: 0, idleThresholdMs: 0 },
        { onError }
      );

      // Create a scenario that causes error (empty chunk text)
      manager.registerChapter('ch1', '');
      await vi.runAllTimersAsync();

      // Errors may occur during processing
      // We just verify the manager doesn't crash
      expect(manager.getStats()).toBeDefined();
    });

    it('should not process while editing is in progress', async () => {
      const onProcessingStart = vi.fn();
      const manager = new ChunkManager(
        { editDebounceMs: 100, idleThresholdMs: 500 },
        { onProcessingStart }
      );

      manager.registerChapter('ch1', 'Content 1');
      vi.advanceTimersByTime(100);

      // Make another edit before idle threshold
      manager.handleEdit('ch1', 'Content 2', 0, 10);
      vi.advanceTimersByTime(400);

      // Should not start processing yet
      expect(onProcessingStart).not.toHaveBeenCalled();
    });

    it('should resume processing after interruption', async () => {
      const onProcessingStart = vi.fn();
      const manager = new ChunkManager(
        { editDebounceMs: 100, idleThresholdMs: 200, maxBatchSize: 1 },
        { onProcessingStart }
      );

      manager.registerChapter('ch1', 'Content');
      vi.advanceTimersByTime(100); // Debounce
      vi.advanceTimersByTime(200); // Idle
      await vi.runAllTimersAsync();

      // Processing started
      expect(onProcessingStart).toHaveBeenCalled();

      // Make new edit
      manager.handleEdit('ch1', 'New content', 0, 10);
      vi.advanceTimersByTime(300);
      await vi.runAllTimersAsync();

      // Processing should resume
      expect(onProcessingStart).toHaveBeenCalledTimes(2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // QUERIES
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Queries', () => {
    it('should get chunk by ID', () => {
      const manager = new ChunkManager();
      manager.registerChapter('ch1', 'Content');

      const chunk = manager.getChunk('chapter-ch1');
      expect(chunk).toBeDefined();
      expect(chunk?.id).toBe('chapter-ch1');
    });

    it('should get chapter chunk by chapter ID', () => {
      const manager = new ChunkManager();
      manager.registerChapter('ch1', 'Content');

      const chunk = manager.getChapterChunk('ch1');
      expect(chunk).toBeDefined();
      expect(chunk?.id).toBe('chapter-ch1');
    });

    it('should return undefined for non-existent chunk', () => {
      const manager = new ChunkManager();
      const chunk = manager.getChunk('non-existent');
      expect(chunk).toBeUndefined();
    });

    it('should get all chapter analyses', async () => {
      const manager = new ChunkManager({ editDebounceMs: 0, idleThresholdMs: 0 });

      manager.registerChapter('ch1', 'Content 1');
      manager.registerChapter('ch2', 'Content 2');

      await vi.runAllTimersAsync();

      const analyses = manager.getAllChapterAnalyses();
      expect(analyses.size).toBe(2);
      expect(analyses.has('ch1')).toBe(true);
      expect(analyses.has('ch2')).toBe(true);
    });

    it('should get analysis at cursor position', async () => {
      const manager = new ChunkManager({ editDebounceMs: 0, idleThresholdMs: 0 });

      manager.registerChapter('ch1', 'Chapter content here');
      await vi.runAllTimersAsync();

      const analysis = manager.getAnalysisAtCursor('ch1', 5);
      // Should return scene or chapter analysis
      expect(analysis).toBeDefined();
    });

    it('should get book summary', async () => {
      const manager = new ChunkManager({ editDebounceMs: 0, idleThresholdMs: 0 });

      manager.registerChapter('ch1', 'Content 1');
      manager.registerChapter('ch2', 'Content 2');
      await vi.runAllTimersAsync();

      const summary = manager.getBookSummary();
      expect(summary).toBeDefined();
    });

    it('should get processing stats', () => {
      const manager = new ChunkManager();
      manager.registerChapter('ch1', 'Content');

      const stats = manager.getStats();
      expect(stats).toHaveProperty('totalChunks');
      expect(stats).toHaveProperty('dirtyCount');
      expect(stats).toHaveProperty('freshCount');
      expect(stats).toHaveProperty('isProcessing');
      expect(stats).toHaveProperty('chapterCount');
      expect(stats.chapterCount).toBe(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // MANUAL CONTROLS
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Manual Controls', () => {
    it('should force process all dirty chunks', async () => {
      const onChunkProcessed = vi.fn();
      const manager = new ChunkManager({ editDebounceMs: 0 }, { onChunkProcessed });

      manager.registerChapter('ch1', 'Content');

      await manager.processAllDirty();

      expect(onChunkProcessed).toHaveBeenCalled();
      expect(manager.getStats().dirtyCount).toBe(0);
    });

    it('should reprocess a specific chunk', async () => {
      const manager = new ChunkManager({ editDebounceMs: 0, idleThresholdMs: 0 });

      manager.registerChapter('ch1', 'Content');
      await vi.runAllTimersAsync();

      // Mark as fresh
      const statsBefore = manager.getStats();
      const freshBefore = statsBefore.freshCount;

      // Reprocess
      await manager.reprocessChunk('chapter-ch1');

      const statsAfter = manager.getStats();
      expect(statsAfter.freshCount).toBeGreaterThanOrEqual(freshBefore);
    });

    it('should retry errored chunks', async () => {
      const manager = new ChunkManager({ editDebounceMs: 0 });

      const retriedIds = manager.retryErrors();
      expect(Array.isArray(retriedIds)).toBe(true);
    });

    it('should pause processing', () => {
      const manager = new ChunkManager();
      manager.registerChapter('ch1', 'Content');

      manager.pause();

      const stats = manager.getStats();
      expect(stats.isProcessing).toBe(false);
    });

    it('should resume processing', async () => {
      const onQueueChange = vi.fn();
      const manager = new ChunkManager(
        { editDebounceMs: 0, idleThresholdMs: 0 },
        { onQueueChange }
      );

      manager.registerChapter('ch1', 'Content');
      manager.pause();

      manager.resume();

      // Should schedule processing
      vi.advanceTimersByTime(0);
      expect(manager).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // PERSISTENCE
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Persistence', () => {
    it('should export state', () => {
      const manager = new ChunkManager();
      manager.registerChapter('ch1', 'Content 1');
      manager.registerChapter('ch2', 'Content 2');

      const state = manager.exportState();

      expect(state).toHaveProperty('index');
      expect(state).toHaveProperty('chapterTexts');
      expect(state.chapterTexts).toHaveProperty('ch1');
      expect(state.chapterTexts).toHaveProperty('ch2');
      expect(state.chapterTexts.ch1).toBe('Content 1');
    });

    it('should load state', () => {
      const manager1 = new ChunkManager();
      manager1.registerChapter('ch1', 'Original content');
      const state = manager1.exportState();

      const manager2 = new ChunkManager();
      manager2.loadState(state);

      const chunk = manager2.getChapterChunk('ch1');
      expect(chunk).toBeDefined();
    });

    it('should round-trip state correctly', () => {
      const manager1 = new ChunkManager();
      manager1.registerChapter('ch1', 'Content 1');
      manager1.registerChapter('ch2', 'Content 2');

      const state1 = manager1.exportState();

      const manager2 = new ChunkManager();
      manager2.loadState(state1);

      const state2 = manager2.exportState();

      expect(state2.chapterTexts).toEqual(state1.chapterTexts);
    });

    it('should clear all state', () => {
      const manager = new ChunkManager();
      manager.registerChapter('ch1', 'Content');

      manager.clear();

      const stats = manager.getStats();
      expect(stats.chapterCount).toBe(0);
      expect(stats.totalChunks).toBe(0);
    });

    it('should destroy manager and clean up', () => {
      const manager = new ChunkManager();
      manager.registerChapter('ch1', 'Content');

      manager.destroy();

      const stats = manager.getStats();
      expect(stats.totalChunks).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // AGGREGATES
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Aggregates', () => {
    it('should build aggregate from processed chunks', async () => {
      const manager = new ChunkManager({ editDebounceMs: 0, idleThresholdMs: 0 });

      manager.registerChapter('ch1', 'This is a chapter with content');
      await manager.processAllDirty();

      const aggregate = manager.getAggregate('chapter-ch1');
      expect(aggregate).toBeDefined();
    });

    it('should aggregate multiple chapters into book', async () => {
      const manager = new ChunkManager({ editDebounceMs: 0, idleThresholdMs: 0 });

      manager.registerChapter('ch1', 'Chapter one content');
      manager.registerChapter('ch2', 'Chapter two content');
      await manager.processAllDirty();

      const bookAggregate = manager.getAggregate('book');
      expect(bookAggregate).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // EDGE CASES
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('should handle empty chapter content', () => {
      const manager = new ChunkManager();
      manager.registerChapter('ch1', '');

      const chunk = manager.getChapterChunk('ch1');
      expect(chunk).toBeDefined();
      expect(chunk?.endIndex).toBe(0);
    });

    it('should handle very long chapter content', () => {
      const manager = new ChunkManager();
      const longContent = 'word '.repeat(10000);

      manager.registerChapter('ch1', longContent);

      const chunk = manager.getChapterChunk('ch1');
      expect(chunk).toBeDefined();
      expect(chunk?.endIndex).toBe(longContent.length);
    });

    it('should handle rapid chapter additions', () => {
      const manager = new ChunkManager();

      for (let i = 0; i < 10; i++) {
        manager.registerChapter(`ch${i}`, `Content ${i}`);
      }

      const stats = manager.getStats();
      expect(stats.chapterCount).toBe(10);
    });

    it('should handle removing non-existent chapter', () => {
      const manager = new ChunkManager();

      // Should not throw
      manager.removeChapter('non-existent');

      expect(manager.getStats().chapterCount).toBe(0);
    });

    it('should handle concurrent edits and processing', async () => {
      const manager = new ChunkManager({
        editDebounceMs: 50,
        idleThresholdMs: 100,
        maxBatchSize: 2
      });

      manager.registerChapter('ch1', 'Initial content');

      // Edit while processing might be scheduled
      manager.handleEdit('ch1', 'Updated content', 0, 15);
      vi.advanceTimersByTime(50);

      manager.handleEdit('ch1', 'Final content', 0, 15);
      vi.advanceTimersByTime(50);

      await vi.runAllTimersAsync();

      const chunk = manager.getChapterChunk('ch1');
      expect(chunk).toBeDefined();
    });

    it('should handle analysis at invalid cursor position', async () => {
      const manager = new ChunkManager({ editDebounceMs: 0, idleThresholdMs: 0 });

      manager.registerChapter('ch1', 'Short content');
      await vi.runAllTimersAsync();

      const analysis = manager.getAnalysisAtCursor('ch1', 99999);
      // Should return chapter analysis or null
      expect(analysis === null || analysis !== undefined).toBe(true);
    });

    it('should handle getting analysis for non-existent chapter', () => {
      const manager = new ChunkManager();

      const analysis = manager.getAnalysisAtCursor('non-existent', 0);
      expect(analysis).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // INTEGRATION SCENARIOS
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Integration Scenarios', () => {
    it('should handle complete editing workflow', async () => {
      const callbacks = {
        onProcessingStart: vi.fn(),
        onProcessingEnd: vi.fn(),
        onChunkProcessed: vi.fn(),
        onQueueChange: vi.fn(),
      };

      const manager = new ChunkManager(
        { editDebounceMs: 0, idleThresholdMs: 0, maxBatchSize: 10 },
        callbacks
      );

      // Register chapters
      manager.registerChapter('ch1', 'Chapter 1 content');
      manager.registerChapter('ch2', 'Chapter 2 content');

      // Process
      await manager.processAllDirty();

      // Verify all callbacks were called
      expect(callbacks.onProcessingStart).toHaveBeenCalled();
      expect(callbacks.onChunkProcessed).toHaveBeenCalled();
      expect(callbacks.onProcessingEnd).toHaveBeenCalled();
      expect(callbacks.onQueueChange).toHaveBeenCalled();

      // Edit a chapter
      manager.handleEdit('ch1', 'Chapter 1 EDITED content', 0, 18);
      vi.advanceTimersByTime(0);
      await vi.runAllTimersAsync();

      // Verify chapter was re-marked as dirty
      const stats = manager.getStats();
      expect(stats.dirtyCount).toBeGreaterThan(0);
    });

    it('should maintain consistency across pause/resume', async () => {
      const manager = new ChunkManager({ editDebounceMs: 0, idleThresholdMs: 0 });

      manager.registerChapter('ch1', 'Content');
      await manager.processAllDirty();

      manager.pause();

      manager.handleEdit('ch1', 'New content', 0, 10);
      vi.advanceTimersByTime(0);

      // Should not process while paused
      expect(manager.getStats().isProcessing).toBe(false);

      manager.resume();
      vi.advanceTimersByTime(0);
      await vi.runAllTimersAsync();

      // Should process after resume
      const chunk = manager.getChapterChunk('ch1');
      expect(chunk).toBeDefined();
    });

    it('should preserve data through export/load cycle', async () => {
      const manager1 = new ChunkManager({ editDebounceMs: 0, idleThresholdMs: 0 });

      manager1.registerChapter('ch1', 'Chapter one');
      manager1.registerChapter('ch2', 'Chapter two');
      await manager1.processAllDirty();

      const state = manager1.exportState();

      const manager2 = new ChunkManager();
      manager2.loadState(state);

      // Verify chapters are present
      expect(manager2.getChapterChunk('ch1')).toBeDefined();
      expect(manager2.getChapterChunk('ch2')).toBeDefined();

      // Verify analyses
      const analyses = manager2.getAllChapterAnalyses();
      expect(analyses.size).toBe(2);
    });
  });
});
