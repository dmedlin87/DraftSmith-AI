/**
 * Chunk Index Test Suite
 *
 * Comprehensive tests for the ChunkIndex class - the core data structure
 * for managing manuscript chunks and their processing state
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ChunkIndex,
  createChunkIndex,
  createChunkId,
  parseChunkId,
} from '@/services/intelligence/chunkIndex';
import { ChunkLevel, ChunkAnalysis, ChunkEdit, StructuralFingerprint } from '@/types/intelligence';

// Mock hashContent
vi.mock('@/services/intelligence/deltaTracker', () => ({
  hashContent: vi.fn((text: string) => `hash-${text.length}`),
}));

describe('ChunkIndex', () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // CHUNK ID UTILITIES
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Chunk ID Utilities', () => {
    describe('createChunkId', () => {
      it('should create book ID', () => {
        const id = createChunkId('book');
        expect(id).toBe('book');
      });

      it('should create act ID', () => {
        const id = createChunkId('act', '1');
        expect(id).toBe('act-1');
      });

      it('should create chapter ID', () => {
        const id = createChunkId('chapter', 'ch1');
        expect(id).toBe('chapter-ch1');
      });

      it('should create scene ID', () => {
        const id = createChunkId('scene', 'ch1', '0');
        expect(id).toBe('chapter-ch1-scene-0');
      });
    });

    describe('parseChunkId', () => {
      it('should parse book ID', () => {
        const parsed = parseChunkId('book');
        expect(parsed.level).toBe('book');
        expect(parsed.parts).toEqual([]);
      });

      it('should parse act ID', () => {
        const parsed = parseChunkId('act-1');
        expect(parsed.level).toBe('act');
        expect(parsed.parts).toEqual(['1']);
      });

      it('should parse chapter ID', () => {
        const parsed = parseChunkId('chapter-ch1');
        expect(parsed.level).toBe('chapter');
        expect(parsed.parts).toEqual(['ch1']);
      });

      it('should parse scene ID', () => {
        const parsed = parseChunkId('chapter-ch1-scene-0');
        expect(parsed.level).toBe('scene');
        expect(parsed.parts).toEqual(['ch1', '0']);
      });

      it('should handle malformed IDs gracefully', () => {
        const parsed = parseChunkId('unknown-format');
        expect(parsed.level).toBe('chapter');
        expect(parsed.parts).toEqual(['unknown-format']);
      });
    });

    describe('ID round-trip', () => {
      it('should create and parse IDs consistently', () => {
        const levels: ChunkLevel[] = ['book', 'act', 'chapter', 'scene'];

        levels.forEach(level => {
          let id: string;
          if (level === 'book') id = createChunkId(level);
          else if (level === 'act') id = createChunkId(level, '1');
          else if (level === 'chapter') id = createChunkId(level, 'test');
          else id = createChunkId(level, 'test', '0');

          const parsed = parseChunkId(id);
          expect(parsed.level).toBe(level);
        });
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // CONSTRUCTOR & INITIALIZATION
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Constructor', () => {
    it('should create empty index', () => {
      const index = new ChunkIndex();
      const stats = index.getStats();

      expect(stats.totalChunks).toBe(0);
      expect(stats.dirtyCount).toBe(0);
    });

    it('should create index with callbacks', () => {
      const onChunkDirty = vi.fn();
      const onQueueUpdated = vi.fn();

      const index = new ChunkIndex(undefined, { onChunkDirty, onQueueUpdated });
      expect(index).toBeDefined();
    });

    it('should create index with initial state', () => {
      const index1 = new ChunkIndex();
      index1.registerChunk('test-chunk', 'chapter', 0, 100, 'content', null);

      const state = index1.exportState();
      const index2 = new ChunkIndex(state);

      expect(index2.getChunk('test-chunk')).toBeDefined();
    });
  });

  describe('Factory function', () => {
    it('should create index via factory', () => {
      const index = createChunkIndex();
      expect(index).toBeInstanceOf(ChunkIndex);
    });

    it('should create index with callbacks via factory', () => {
      const onChunkDirty = vi.fn();
      const index = createChunkIndex(undefined, { onChunkDirty });
      expect(index).toBeInstanceOf(ChunkIndex);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // CHUNK CRUD OPERATIONS
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Chunk CRUD', () => {
    let index: ChunkIndex;

    beforeEach(() => {
      index = new ChunkIndex();
    });

    describe('registerChunk', () => {
      it('should register a new chunk', () => {
        const chunk = index.registerChunk(
          'chapter-1',
          'chapter',
          0,
          100,
          'content',
          null
        );

        expect(chunk).toBeDefined();
        expect(chunk.id).toBe('chapter-1');
        expect(chunk.level).toBe('chapter');
        expect(chunk.status).toBe('dirty');
        expect(chunk.startIndex).toBe(0);
        expect(chunk.endIndex).toBe(100);
      });

      it('should add chunk to parent children', () => {
        index.registerChunk('book', 'book', 0, 0, '', null);
        index.registerChunk('chapter-1', 'chapter', 0, 100, 'content', 'book');

        const parent = index.getChunk('book');
        expect(parent?.childIds).toContain('chapter-1');
      });

      it('should mark new chunks as dirty', () => {
        index.registerChunk('chapter-1', 'chapter', 0, 100, 'content', null);

        expect(index.getDirtyCount()).toBe(1);
        expect(index.hasDirtyChunks()).toBe(true);
      });

      it('should trigger onChunkDirty callback', () => {
        const onChunkDirty = vi.fn();
        const idx = new ChunkIndex(undefined, { onChunkDirty });

        idx.registerChunk('test', 'chapter', 0, 10, 'text', null);

        expect(onChunkDirty).toHaveBeenCalledWith('test');
      });

      it('should not add duplicate child IDs', () => {
        index.registerChunk('book', 'book', 0, 0, '', null);
        index.registerChunk('chapter-1', 'chapter', 0, 100, 'content', 'book');

        // Re-register with same parent
        index.registerChunk('chapter-1', 'chapter', 0, 100, 'content', 'book');

        const parent = index.getChunk('book');
        const count = parent?.childIds.filter(id => id === 'chapter-1').length;
        expect(count).toBe(1);
      });
    });

    describe('getChunk', () => {
      it('should retrieve registered chunk', () => {
        index.registerChunk('chapter-1', 'chapter', 0, 100, 'content', null);

        const chunk = index.getChunk('chapter-1');
        expect(chunk).toBeDefined();
        expect(chunk?.id).toBe('chapter-1');
      });

      it('should return undefined for non-existent chunk', () => {
        const chunk = index.getChunk('non-existent');
        expect(chunk).toBeUndefined();
      });
    });

    describe('getChunksByLevel', () => {
      it('should get all chunks at specific level', () => {
        index.registerChunk('chapter-1', 'chapter', 0, 100, 'c1', null);
        index.registerChunk('chapter-2', 'chapter', 0, 100, 'c2', null);
        index.registerChunk('scene-1', 'scene', 0, 50, 's1', 'chapter-1');

        const chapters = index.getChunksByLevel('chapter');
        expect(chapters).toHaveLength(2);

        const scenes = index.getChunksByLevel('scene');
        expect(scenes).toHaveLength(1);
      });

      it('should return empty array if no chunks at level', () => {
        const acts = index.getChunksByLevel('act');
        expect(acts).toEqual([]);
      });
    });

    describe('getChildren', () => {
      it('should get all children of a chunk', () => {
        index.registerChunk('book', 'book', 0, 0, '', null);
        index.registerChunk('chapter-1', 'chapter', 0, 100, 'c1', 'book');
        index.registerChunk('chapter-2', 'chapter', 0, 100, 'c2', 'book');

        const children = index.getChildren('book');
        expect(children).toHaveLength(2);
        expect(children.map(c => c.id)).toContain('chapter-1');
        expect(children.map(c => c.id)).toContain('chapter-2');
      });

      it('should return empty array for chunk with no children', () => {
        index.registerChunk('chapter-1', 'chapter', 0, 100, 'content', null);

        const children = index.getChildren('chapter-1');
        expect(children).toEqual([]);
      });

      it('should return empty array for non-existent chunk', () => {
        const children = index.getChildren('non-existent');
        expect(children).toEqual([]);
      });
    });

    describe('removeChunk', () => {
      it('should remove chunk and its children', () => {
        index.registerChunk('book', 'book', 0, 0, '', null);
        index.registerChunk('chapter-1', 'chapter', 0, 100, 'c1', 'book');
        index.registerChunk('scene-1', 'scene', 0, 50, 's1', 'chapter-1');

        index.removeChunk('chapter-1');

        expect(index.getChunk('chapter-1')).toBeUndefined();
        expect(index.getChunk('scene-1')).toBeUndefined();
      });

      it('should remove chunk from parent childIds', () => {
        index.registerChunk('book', 'book', 0, 0, '', null);
        index.registerChunk('chapter-1', 'chapter', 0, 100, 'c1', 'book');

        index.removeChunk('chapter-1');

        const parent = index.getChunk('book');
        expect(parent?.childIds).not.toContain('chapter-1');
      });

      it('should remove chunk from dirty queue', () => {
        index.registerChunk('chapter-1', 'chapter', 0, 100, 'content', null);

        expect(index.hasDirtyChunks()).toBe(true);

        index.removeChunk('chapter-1');

        expect(index.hasDirtyChunks()).toBe(false);
      });

      it('should handle removing non-existent chunk', () => {
        // Should not throw
        index.removeChunk('non-existent');
        expect(index.getStats().totalChunks).toBe(0);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // EDIT HANDLING
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Edit Handling', () => {
    let index: ChunkIndex;

    beforeEach(() => {
      index = new ChunkIndex();
    });

    describe('applyEdit', () => {
      it('should create chapter chunk if it does not exist', () => {
        const edit: ChunkEdit = {
          chapterId: 'ch1',
          start: 0,
          end: 0,
          newLength: 10,
          timestamp: Date.now(),
        };

        const affected = index.applyEdit(edit, 'new content');

        expect(affected).toContain('chapter-ch1');
        expect(index.getChunk('chapter-ch1')).toBeDefined();
      });

      it('should mark chapter dirty if content changed', () => {
        index.registerChunk('chapter-ch1', 'chapter', 0, 100, 'old content', 'book');
        const chunk = index.getChunk('chapter-ch1');
        if (chunk) chunk.status = 'fresh';

        const edit: ChunkEdit = {
          chapterId: 'ch1',
          start: 0,
          end: 11,
          newLength: 11,
          timestamp: Date.now(),
        };

        index.applyEdit(edit, 'new content');

        expect(chunk?.status).toBe('dirty');
      });

      it('should update chapter hash on edit', () => {
        index.registerChunk('chapter-ch1', 'chapter', 0, 100, 'old', 'book');

        const edit: ChunkEdit = {
          chapterId: 'ch1',
          start: 0,
          end: 3,
          newLength: 10,
          timestamp: Date.now(),
        };

        index.applyEdit(edit, 'new content');

        const chunk = index.getChunk('chapter-ch1');
        expect(chunk?.hash).toBe('hash-11'); // 'new content' length
      });

      it('should propagate dirty status to parent', () => {
        index.registerChunk('book', 'book', 0, 0, '', null);
        index.registerChunk('chapter-ch1', 'chapter', 0, 100, 'content', 'book');

        const book = index.getChunk('book');
        if (book) book.status = 'fresh';

        const edit: ChunkEdit = {
          chapterId: 'ch1',
          start: 0,
          end: 7,
          newLength: 11,
          timestamp: Date.now(),
        };

        index.applyEdit(edit, 'new content');

        expect(book?.status).toBe('dirty');
      });

      it('should not mark dirty if content unchanged', () => {
        const content = 'same content';
        index.registerChunk('chapter-ch1', 'chapter', 0, content.length, content, null);

        const chunk = index.getChunk('chapter-ch1');
        if (chunk) chunk.status = 'fresh';

        const edit: ChunkEdit = {
          chapterId: 'ch1',
          start: 0,
          end: content.length,
          newLength: content.length,
          timestamp: Date.now(),
        };

        index.applyEdit(edit, content);

        expect(chunk?.status).toBe('fresh');
      });
    });

    describe('markDirty', () => {
      it('should mark chunk as dirty', () => {
        index.registerChunk('chapter-1', 'chapter', 0, 100, 'content', null);

        const chunk = index.getChunk('chapter-1');
        if (chunk) chunk.status = 'fresh';

        index.markDirty('chapter-1');

        expect(chunk?.status).toBe('dirty');
      });

      it('should invalidate cached analysis', () => {
        index.registerChunk('chapter-1', 'chapter', 0, 100, 'content', null);

        const chunk = index.getChunk('chapter-1');
        if (chunk) {
          chunk.analysis = { wordCount: 10 } as ChunkAnalysis;
          chunk.status = 'fresh';
        }

        index.markDirty('chapter-1');

        expect(chunk?.analysis).toBeNull();
      });

      it('should add to dirty queue', () => {
        index.registerChunk('chapter-1', 'chapter', 0, 100, 'content', null);

        const chunk = index.getChunk('chapter-1');
        if (chunk) chunk.status = 'fresh';

        const dirtyBefore = index.getDirtyCount();

        index.markDirty('chapter-1');

        expect(index.getDirtyCount()).toBeGreaterThan(dirtyBefore);
      });

      it('should trigger callback', () => {
        const onChunkDirty = vi.fn();
        const idx = new ChunkIndex(undefined, { onChunkDirty });

        idx.registerChunk('chapter-1', 'chapter', 0, 100, 'content', null);
        const chunk = idx.getChunk('chapter-1');
        if (chunk) chunk.status = 'fresh';

        onChunkDirty.mockClear();

        idx.markDirty('chapter-1');

        expect(onChunkDirty).toHaveBeenCalledWith('chapter-1');
      });

      it('should not duplicate in queue if already dirty', () => {
        index.registerChunk('chapter-1', 'chapter', 0, 100, 'content', null);

        index.markDirty('chapter-1');
        const count1 = index.getDirtyCount();

        index.markDirty('chapter-1');
        const count2 = index.getDirtyCount();

        expect(count2).toBe(count1);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // PROCESSING QUEUE
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Processing Queue', () => {
    let index: ChunkIndex;

    beforeEach(() => {
      index = new ChunkIndex();
    });

    describe('dequeueNext', () => {
      it('should return null for empty queue', () => {
        const next = index.dequeueNext();
        expect(next).toBeNull();
      });

      it('should dequeue dirty chunks', () => {
        index.registerChunk('chapter-1', 'chapter', 0, 100, 'content', null);

        const next = index.dequeueNext();
        expect(next).toBe('chapter-1');
      });

      it('should prioritize scenes over chapters', () => {
        index.registerChunk('chapter-1', 'chapter', 0, 100, 'content', null);
        index.registerChunk('scene-1', 'scene', 0, 50, 'scene', 'chapter-1');

        const next = index.dequeueNext();
        const parsed = parseChunkId(next!);
        expect(parsed.level).toBe('scene');
      });

      it('should remove dequeued chunk from queue', () => {
        index.registerChunk('chapter-1', 'chapter', 0, 100, 'content', null);

        const countBefore = index.getDirtyCount();
        index.dequeueNext();
        const countAfter = index.getDirtyCount();

        expect(countAfter).toBe(countBefore - 1);
      });

      it('should prioritize by level: scene < chapter < act < book', () => {
        index.registerChunk('book', 'book', 0, 0, '', null);
        index.registerChunk('act-1', 'act', 0, 0, '', 'book');
        index.registerChunk('chapter-1', 'chapter', 0, 100, 'c', 'act-1');
        index.registerChunk('scene-1', 'scene', 0, 50, 's', 'chapter-1');

        const first = index.dequeueNext();
        expect(parseChunkId(first!).level).toBe('scene');

        const second = index.dequeueNext();
        expect(parseChunkId(second!).level).toBe('chapter');

        const third = index.dequeueNext();
        expect(parseChunkId(third!).level).toBe('act');

        const fourth = index.dequeueNext();
        expect(parseChunkId(fourth!).level).toBe('book');
      });
    });

    describe('markProcessing', () => {
      it('should change status to processing', () => {
        index.registerChunk('chapter-1', 'chapter', 0, 100, 'content', null);

        index.markProcessing('chapter-1');

        const chunk = index.getChunk('chapter-1');
        expect(chunk?.status).toBe('processing');
      });

      it('should not affect non-existent chunk', () => {
        index.markProcessing('non-existent');
        // Should not throw
        expect(true).toBe(true);
      });
    });

    describe('updateAnalysis', () => {
      it('should update chunk with analysis', () => {
        index.registerChunk('chapter-1', 'chapter', 0, 100, 'content', null);

        const analysis: ChunkAnalysis = {
          summary: 'Test',
          wordCount: 100,
          dialogueRatio: 0.3,
          avgTension: 0.7,
          characterNames: ['Alice'],
          locationNames: ['Forest'],
          timeMarkers: [],
          openPromises: [],
          styleFlags: [],
          riskScore: 0.2,
          processedAt: Date.now(),
        };

        index.updateAnalysis('chapter-1', analysis);

        const chunk = index.getChunk('chapter-1');
        expect(chunk?.analysis).toEqual(analysis);
        expect(chunk?.status).toBe('fresh');
        expect(chunk?.lastProcessedAt).toBeDefined();
      });

      it('should clear error message on successful update', () => {
        index.registerChunk('chapter-1', 'chapter', 0, 100, 'content', null);

        const chunk = index.getChunk('chapter-1');
        if (chunk) chunk.errorMessage = 'Previous error';

        const analysis: ChunkAnalysis = {
          summary: 'Test',
          wordCount: 100,
          dialogueRatio: 0.3,
          avgTension: 0.7,
          characterNames: [],
          locationNames: [],
          timeMarkers: [],
          openPromises: [],
          styleFlags: [],
          riskScore: 0,
          processedAt: Date.now(),
        };

        index.updateAnalysis('chapter-1', analysis);

        expect(chunk?.errorMessage).toBeUndefined();
      });

      it('should trigger parent aggregation when all siblings fresh', () => {
        index.registerChunk('book', 'book', 0, 0, '', null);
        index.registerChunk('chapter-1', 'chapter', 0, 100, 'c1', 'book');
        index.registerChunk('chapter-2', 'chapter', 0, 100, 'c2', 'book');

        const analysis: ChunkAnalysis = {
          summary: 'Test',
          wordCount: 100,
          dialogueRatio: 0.3,
          avgTension: 0.7,
          characterNames: [],
          locationNames: [],
          timeMarkers: [],
          openPromises: [],
          styleFlags: [],
          riskScore: 0,
          processedAt: Date.now(),
        };

        index.updateAnalysis('chapter-1', analysis);
        index.updateAnalysis('chapter-2', analysis);

        const aggregate = index.getAggregate('book');
        expect(aggregate).toBeDefined();
      });
    });

    describe('markError', () => {
      it('should mark chunk with error status and message', () => {
        index.registerChunk('chapter-1', 'chapter', 0, 100, 'content', null);

        index.markError('chapter-1', 'Test error message');

        const chunk = index.getChunk('chapter-1');
        expect(chunk?.status).toBe('error');
        expect(chunk?.errorMessage).toBe('Test error message');
      });
    });

    describe('retryErroredChunks', () => {
      it('should retry all errored chunks', () => {
        index.registerChunk('chapter-1', 'chapter', 0, 100, 'c1', null);
        index.registerChunk('chapter-2', 'chapter', 0, 100, 'c2', null);

        index.markError('chapter-1', 'Error 1');
        index.markError('chapter-2', 'Error 2');

        const retried = index.retryErroredChunks();

        expect(retried).toHaveLength(2);
        expect(retried).toContain('chapter-1');
        expect(retried).toContain('chapter-2');

        const chunk1 = index.getChunk('chapter-1');
        expect(chunk1?.status).toBe('dirty');
        expect(chunk1?.errorMessage).toBeUndefined();
      });

      it('should return empty array if no errors', () => {
        index.registerChunk('chapter-1', 'chapter', 0, 100, 'content', null);

        const retried = index.retryErroredChunks();

        expect(retried).toEqual([]);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SCENE CHUNKING
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Scene Chunking', () => {
    let index: ChunkIndex;

    beforeEach(() => {
      index = new ChunkIndex();
    });

    it('should register scenes for a chapter', () => {
      index.registerChunk('chapter-ch1', 'chapter', 0, 200, 'content', 'book');

      const structural: StructuralFingerprint = {
        scenes: [
          { startOffset: 0, endOffset: 100, tension: 0.5, timeMarker: null } as any,
          { startOffset: 100, endOffset: 200, tension: 0.7, timeMarker: null } as any,
        ],
        stats: { totalWords: 100, dialogueRatio: 0.3 },
      };

      const sceneIds = index.registerScenesForChapter('ch1', 'chapter content here', structural);

      expect(sceneIds).toHaveLength(2);
      expect(index.getChunk(sceneIds[0])).toBeDefined();
      expect(index.getChunk(sceneIds[1])).toBeDefined();
    });

    it('should remove existing scenes before registering new ones', () => {
      index.registerChunk('chapter-ch1', 'chapter', 0, 200, 'content', 'book');

      const structural1: StructuralFingerprint = {
        scenes: [{ startOffset: 0, endOffset: 200, tension: 0.5, timeMarker: null } as any],
        stats: { totalWords: 100, dialogueRatio: 0.3 },
      };

      index.registerScenesForChapter('ch1', 'content', structural1);

      const scenes1 = index.getChunksByLevel('scene');
      const count1 = scenes1.length;

      const structural2: StructuralFingerprint = {
        scenes: [
          { startOffset: 0, endOffset: 100, tension: 0.5, timeMarker: null } as any,
          { startOffset: 100, endOffset: 200, tension: 0.7, timeMarker: null } as any,
        ],
        stats: { totalWords: 100, dialogueRatio: 0.3 },
      };

      index.registerScenesForChapter('ch1', 'content', structural2);

      const scenes2 = index.getChunksByLevel('scene');
      expect(scenes2.length).toBe(2);
    });

    it('should add scenes as children of chapter', () => {
      index.registerChunk('chapter-ch1', 'chapter', 0, 200, 'content', 'book');

      const structural: StructuralFingerprint = {
        scenes: [
          { startOffset: 0, endOffset: 100, tension: 0.5, timeMarker: null } as any,
          { startOffset: 100, endOffset: 200, tension: 0.7, timeMarker: null } as any,
        ],
        stats: { totalWords: 100, dialogueRatio: 0.3 },
      };

      index.registerScenesForChapter('ch1', 'content', structural);

      const chapter = index.getChunk('chapter-ch1');
      const sceneChildren = chapter?.childIds.filter(id => parseChunkId(id).level === 'scene');

      expect(sceneChildren?.length).toBe(2);
    });

    it('should handle empty scenes array', () => {
      index.registerChunk('chapter-ch1', 'chapter', 0, 100, 'content', 'book');

      const structural: StructuralFingerprint = {
        scenes: [],
        stats: { totalWords: 50, dialogueRatio: 0 },
      };

      const sceneIds = index.registerScenesForChapter('ch1', 'content', structural);

      expect(sceneIds).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // QUERIES
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Queries', () => {
    let index: ChunkIndex;

    beforeEach(() => {
      index = new ChunkIndex();
    });

    describe('getChunkAtOffset', () => {
      it('should find scene containing offset', () => {
        index.registerChunk('chapter-ch1', 'chapter', 0, 200, 'content', 'book');

        const structural: StructuralFingerprint = {
          scenes: [
            { startOffset: 0, endOffset: 100, tension: 0.5, timeMarker: null } as any,
            { startOffset: 100, endOffset: 200, tension: 0.7, timeMarker: null } as any,
          ],
          stats: { totalWords: 100, dialogueRatio: 0.3 },
        };

        index.registerScenesForChapter('ch1', 'content', structural);

        const chunk = index.getChunkAtOffset('ch1', 50);
        expect(chunk).toBeDefined();
        expect(chunk?.startIndex).toBe(0);
        expect(chunk?.endIndex).toBe(100);
      });

      it('should return chapter if no scene contains offset', () => {
        index.registerChunk('chapter-ch1', 'chapter', 0, 100, 'content', 'book');

        const chunk = index.getChunkAtOffset('ch1', 50);
        expect(chunk?.id).toBe('chapter-ch1');
      });

      it('should return undefined for non-existent chapter', () => {
        const chunk = index.getChunkAtOffset('non-existent', 0);
        expect(chunk).toBeUndefined();
      });
    });

    describe('getDirtyChunks', () => {
      it('should return all dirty chunk IDs', () => {
        index.registerChunk('chapter-1', 'chapter', 0, 100, 'c1', null);
        index.registerChunk('chapter-2', 'chapter', 0, 100, 'c2', null);

        const dirty = index.getDirtyChunks();
        expect(dirty).toHaveLength(2);
      });

      it('should return copy of queue', () => {
        index.registerChunk('chapter-1', 'chapter', 0, 100, 'content', null);

        const dirty1 = index.getDirtyChunks();
        const dirty2 = index.getDirtyChunks();

        expect(dirty1).not.toBe(dirty2);
        expect(dirty1).toEqual(dirty2);
      });
    });

    describe('hasDirtyChunks', () => {
      it('should return true if dirty chunks exist', () => {
        index.registerChunk('chapter-1', 'chapter', 0, 100, 'content', null);

        expect(index.hasDirtyChunks()).toBe(true);
      });

      it('should return false if no dirty chunks', () => {
        expect(index.hasDirtyChunks()).toBe(false);
      });
    });

    describe('getAggregate', () => {
      it('should return aggregate summary for chunk', () => {
        index.registerChunk('book', 'book', 0, 0, '', null);
        index.registerChunk('chapter-1', 'chapter', 0, 100, 'c1', 'book');

        const analysis: ChunkAnalysis = {
          summary: 'Test',
          wordCount: 100,
          dialogueRatio: 0.3,
          avgTension: 0.7,
          characterNames: ['Alice'],
          locationNames: ['Forest'],
          timeMarkers: [],
          openPromises: [],
          styleFlags: [],
          riskScore: 0.2,
          processedAt: Date.now(),
        };

        index.updateAnalysis('chapter-1', analysis);

        const aggregate = index.getAggregate('book');
        expect(aggregate).toBeDefined();
        expect(aggregate?.totalWordCount).toBe(100);
        expect(aggregate?.allCharacters).toContain('Alice');
      });

      it('should return undefined for chunk without aggregate', () => {
        index.registerChunk('chapter-1', 'chapter', 0, 100, 'content', null);

        const aggregate = index.getAggregate('chapter-1');
        expect(aggregate).toBeUndefined();
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SERIALIZATION
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Serialization', () => {
    it('should export state', () => {
      const index = new ChunkIndex();
      index.registerChunk('chapter-1', 'chapter', 0, 100, 'content', null);

      const state = index.exportState();

      expect(state).toHaveProperty('chunks');
      expect(state).toHaveProperty('aggregates');
      expect(state).toHaveProperty('dirtyQueue');
      expect(state).toHaveProperty('totalChunks');
      expect(state).toHaveProperty('dirtyCount');
      expect(state.chunks).toHaveProperty('chapter-1');
    });

    it('should load state', () => {
      const index1 = new ChunkIndex();
      index1.registerChunk('chapter-1', 'chapter', 0, 100, 'content', null);

      const state = index1.exportState();

      const index2 = new ChunkIndex();
      index2.loadState(state);

      expect(index2.getChunk('chapter-1')).toBeDefined();
      expect(index2.getDirtyChunks()).toEqual(index1.getDirtyChunks());
    });

    it('should clear all state', () => {
      const index = new ChunkIndex();
      index.registerChunk('chapter-1', 'chapter', 0, 100, 'content', null);

      index.clear();

      expect(index.getStats().totalChunks).toBe(0);
      expect(index.hasDirtyChunks()).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // STATS
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Stats', () => {
    it('should provide accurate stats', () => {
      const index = new ChunkIndex();

      index.registerChunk('book', 'book', 0, 0, '', null);
      index.registerChunk('chapter-1', 'chapter', 0, 100, 'c1', 'book');
      index.registerChunk('scene-1', 'scene', 0, 50, 's1', 'chapter-1');

      const analysis: ChunkAnalysis = {
        summary: 'Test',
        wordCount: 100,
        dialogueRatio: 0.3,
        avgTension: 0.7,
        characterNames: [],
        locationNames: [],
        timeMarkers: [],
        openPromises: [],
        styleFlags: [],
        riskScore: 0,
        processedAt: Date.now(),
      };

      index.updateAnalysis('scene-1', analysis);
      index.markError('chapter-1', 'Error');

      const stats = index.getStats();

      expect(stats.totalChunks).toBe(3);
      expect(stats.freshCount).toBe(1);
      expect(stats.errorCount).toBe(1);
      expect(stats.byLevel.book).toBe(1);
      expect(stats.byLevel.chapter).toBe(1);
      expect(stats.byLevel.scene).toBe(1);
    });
  });
});
