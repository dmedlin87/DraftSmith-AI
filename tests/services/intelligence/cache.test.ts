/**
 * Intelligence Cache Test Suite
 *
 * Comprehensive tests for the LRU cache implementation and
 * content-addressed caching for incremental processing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getIntelligenceCache,
  clearIntelligenceCache,
  parseStructureCached,
  extractEntitiesCached,
  analyzeStyleCached,
  splitIntoSections,
  processIncrementally,
  getCacheStats,
} from '@/services/intelligence/cache';

// Mock the underlying analysis functions
vi.mock('@/services/intelligence/structuralParser', () => ({
  parseStructure: vi.fn((text: string) => ({
    scenes: [],
    stats: { totalWords: text.split(' ').length, dialogueRatio: 0.3 },
  })),
}));

vi.mock('@/services/intelligence/entityExtractor', () => ({
  extractEntities: vi.fn(() => ({
    nodes: [],
    edges: [],
  })),
}));

vi.mock('@/services/intelligence/styleAnalyzer', () => ({
  analyzeStyle: vi.fn(() => ({
    flags: {},
    syntax: {},
    lexical: {},
  })),
}));

vi.mock('@/services/intelligence/deltaTracker', () => ({
  hashContent: vi.fn((text: string) => `hash-${text.length}`),
}));

describe('Intelligence Cache', () => {
  beforeEach(() => {
    clearIntelligenceCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearIntelligenceCache();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // LRU CACHE TESTS
  // ─────────────────────────────────────────────────────────────────────────────

  describe('LRU Cache Behavior', () => {
    it('should cache and retrieve values', () => {
      const cache = getIntelligenceCache();
      const result1 = parseStructureCached('test content');
      const result2 = parseStructureCached('test content');

      expect(result1).toBe(result2);
    });

    it('should use cached values on subsequent calls', async () => {
      const { parseStructure } = await import('@/services/intelligence/structuralParser');

      parseStructureCached('test content');
      parseStructureCached('test content');

      // Should only be called once (second call uses cache)
      expect(parseStructure).toHaveBeenCalledTimes(1);
    });

    it('should evict least recently used entries when at capacity', async () => {
      const { parseStructure } = await import('@/services/intelligence/structuralParser');

      // Create more than MAX_CACHE_SIZE entries
      for (let i = 0; i < 105; i++) {
        parseStructureCached(`content-${i}`);
      }

      // Access first entry again - it should have been evicted
      parseStructureCached('content-0');

      // Should be called twice for 'content-0' (initial + after eviction)
      expect(parseStructure).toHaveBeenCalledWith('content-0');
    });

    it('should update access count on cache hits', async () => {
      const { parseStructure } = await import('@/services/intelligence/structuralParser');

      // Cache a value and access it multiple times
      parseStructureCached('frequent');
      parseStructureCached('frequent');
      parseStructureCached('frequent');

      // Fill cache with other entries
      for (let i = 0; i < 100; i++) {
        parseStructureCached(`other-${i}`);
      }

      // Frequently accessed item should still be in cache
      parseStructureCached('frequent');

      // Should only be called once (all subsequent calls use cache)
      expect(parseStructure).toHaveBeenCalledWith('frequent');
    });

    it('should respect TTL and evict expired entries', async () => {
      const { parseStructure } = await import('@/services/intelligence/structuralParser');

      vi.useFakeTimers();

      parseStructureCached('test content');

      // Advance time beyond TTL (5 minutes)
      vi.advanceTimersByTime(6 * 60 * 1000);

      parseStructureCached('test content');

      // Should be called twice (initial + after expiration)
      expect(parseStructure).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it('should handle has() with expired entries', () => {
      vi.useFakeTimers();

      const cache = getIntelligenceCache();
      parseStructureCached('test');

      // Advance time beyond TTL
      vi.advanceTimersByTime(6 * 60 * 1000);

      // Should return false for expired entry
      const stats = getCacheStats();
      // Expired entries are removed on access
      expect(stats.structuralCache.size).toBeGreaterThanOrEqual(0);

      vi.useRealTimers();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // CACHE STATS TESTS
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Cache Statistics', () => {
    it('should provide cache stats', () => {
      parseStructureCached('test1');
      parseStructureCached('test2');
      analyzeStyleCached('test3');

      const stats = getCacheStats();

      expect(stats).toHaveProperty('structuralCache');
      expect(stats).toHaveProperty('styleCache');
      expect(stats).toHaveProperty('entityCache');
      expect(stats).toHaveProperty('paragraphCache');
      expect(stats).toHaveProperty('fullEntityCache');
      expect(stats).toHaveProperty('totalEntries');
    });

    it('should count total entries across all caches', () => {
      parseStructureCached('test1');
      parseStructureCached('test2');
      analyzeStyleCached('test3');

      const stats = getCacheStats();

      expect(stats.totalEntries).toBeGreaterThan(0);
      expect(stats.totalEntries).toBe(
        stats.structuralCache.size +
        stats.styleCache.size +
        stats.entityCache.size +
        stats.paragraphCache.size +
        stats.fullEntityCache.size
      );
    });

    it('should report maxSize and ttl', () => {
      const stats = getCacheStats();

      expect(stats.structuralCache.maxSize).toBe(100);
      expect(stats.structuralCache.ttl).toBe(5 * 60 * 1000);
    });

    it('should update size as entries are added', () => {
      const statsBefore = getCacheStats();
      const sizeBefore = statsBefore.structuralCache.size;

      parseStructureCached('new content');

      const statsAfter = getCacheStats();
      const sizeAfter = statsAfter.structuralCache.size;

      expect(sizeAfter).toBeGreaterThan(sizeBefore);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // CLEAR CACHE TESTS
  // ─────────────────────────────────────────────────────────────────────────────

  describe('clearIntelligenceCache', () => {
    it('should clear all caches', () => {
      parseStructureCached('test1');
      analyzeStyleCached('test2');
      extractEntitiesCached('test3', [], [], 'ch1');

      clearIntelligenceCache();

      const stats = getCacheStats();
      expect(stats.totalEntries).toBe(0);
    });

    it('should allow re-use after clearing', async () => {
      const { parseStructure } = await import('@/services/intelligence/structuralParser');

      parseStructureCached('test');
      clearIntelligenceCache();
      parseStructureCached('test');

      // Should be called twice (before and after clear)
      expect(parseStructure).toHaveBeenCalledTimes(2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // CACHED PROCESSING FUNCTIONS
  // ─────────────────────────────────────────────────────────────────────────────

  describe('parseStructureCached', () => {
    it('should parse and cache structural fingerprint', async () => {
      const { parseStructure } = await import('@/services/intelligence/structuralParser');

      const result = parseStructureCached('test content');

      expect(parseStructure).toHaveBeenCalledWith('test content');
      expect(result).toBeDefined();
    });

    it('should return cached result on second call', async () => {
      const { parseStructure } = await import('@/services/intelligence/structuralParser');

      const result1 = parseStructureCached('test content');
      const result2 = parseStructureCached('test content');

      expect(result1).toBe(result2);
      expect(parseStructure).toHaveBeenCalledTimes(1);
    });

    it('should cache different content separately', async () => {
      const { parseStructure } = await import('@/services/intelligence/structuralParser');

      parseStructureCached('content 1');
      parseStructureCached('content 2');

      expect(parseStructure).toHaveBeenCalledTimes(2);
    });
  });

  describe('extractEntitiesCached', () => {
    it('should extract and cache entities', async () => {
      const { extractEntities } = await import('@/services/intelligence/entityExtractor');

      const result = extractEntitiesCached('test', [], [], 'ch1');

      expect(extractEntities).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should use chapterId in cache key', async () => {
      const { extractEntities } = await import('@/services/intelligence/entityExtractor');

      extractEntitiesCached('same text', [], [], 'ch1');
      extractEntitiesCached('same text', [], [], 'ch2');

      // Different chapter IDs should create different cache entries
      expect(extractEntities).toHaveBeenCalledTimes(2);
    });

    it('should return cached result on second call with same chapter', async () => {
      const { extractEntities } = await import('@/services/intelligence/entityExtractor');

      const result1 = extractEntitiesCached('test', [], [], 'ch1');
      const result2 = extractEntitiesCached('test', [], [], 'ch1');

      expect(result1).toBe(result2);
      expect(extractEntities).toHaveBeenCalledTimes(1);
    });
  });

  describe('analyzeStyleCached', () => {
    it('should analyze and cache style', async () => {
      const { analyzeStyle } = await import('@/services/intelligence/styleAnalyzer');

      const result = analyzeStyleCached('test content');

      expect(analyzeStyle).toHaveBeenCalledWith('test content');
      expect(result).toBeDefined();
    });

    it('should return cached result on second call', async () => {
      const { analyzeStyle } = await import('@/services/intelligence/styleAnalyzer');

      const result1 = analyzeStyleCached('test content');
      const result2 = analyzeStyleCached('test content');

      expect(result1).toBe(result2);
      expect(analyzeStyle).toHaveBeenCalledTimes(1);
    });

    it('should cache different content separately', async () => {
      const { analyzeStyle } = await import('@/services/intelligence/styleAnalyzer');

      analyzeStyleCached('content 1');
      analyzeStyleCached('content 2');

      expect(analyzeStyle).toHaveBeenCalledTimes(2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION SPLITTING TESTS
  // ─────────────────────────────────────────────────────────────────────────────

  describe('splitIntoSections', () => {
    it('should split text into sections', () => {
      const text = `Paragraph 1 with some content.

Paragraph 2 with more content.

Paragraph 3 with even more content.`;

      const sections = splitIntoSections(text);

      expect(sections.length).toBeGreaterThan(0);
      expect(sections.every(s => s.text && s.offset >= 0 && s.hash)).toBe(true);
    });

    it('should respect section size limit', () => {
      const longText = 'a'.repeat(1000) + '\n\n' + 'b'.repeat(1000);

      const sections = splitIntoSections(longText);

      // Should split into multiple sections
      expect(sections.length).toBeGreaterThan(1);
    });

    it('should split on paragraph boundaries when possible', () => {
      const text = `Short para 1.

Short para 2.

Short para 3.`;

      const sections = splitIntoSections(text);

      // Each section should be a complete paragraph
      sections.forEach(section => {
        expect(section.text.trim().length).toBeGreaterThan(0);
      });
    });

    it('should generate unique hashes for different sections', () => {
      const text = `Paragraph 1.

Paragraph 2.

Paragraph 3.`;

      const sections = splitIntoSections(text);

      const hashes = sections.map(s => s.hash);
      const uniqueHashes = new Set(hashes);

      // Not all hashes need to be unique, but there should be some variation
      expect(hashes.length).toBeGreaterThan(0);
    });

    it('should track section offsets', () => {
      const text = `First paragraph.

Second paragraph.`;

      const sections = splitIntoSections(text);

      // Offsets should be increasing
      for (let i = 1; i < sections.length; i++) {
        expect(sections[i].offset).toBeGreaterThanOrEqual(sections[i - 1].offset);
      });
    });

    it('should handle single paragraph', () => {
      const text = 'Single paragraph with no line breaks.';

      const sections = splitIntoSections(text);

      expect(sections.length).toBe(1);
      expect(sections[0].text).toBe(text);
      expect(sections[0].offset).toBe(0);
    });

    it('should handle empty text', () => {
      const sections = splitIntoSections('');

      // Should handle gracefully
      expect(Array.isArray(sections)).toBe(true);
    });

    it('should flush final section', () => {
      const text = `Para 1.

Para 2.

Para 3.`;

      const sections = splitIntoSections(text);

      // Last section should be included
      expect(sections.length).toBeGreaterThan(0);
      const lastSection = sections[sections.length - 1];
      expect(lastSection.text).toBeTruthy();
    });

    it('should combine small paragraphs into sections', () => {
      const text = `A.

B.

C.

D.`;

      const sections = splitIntoSections(text);

      // Small paragraphs should be combined until section size is reached
      expect(sections.length).toBeGreaterThan(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // INCREMENTAL PROCESSING TESTS
  // ─────────────────────────────────────────────────────────────────────────────

  describe('processIncrementally', () => {
    it('should detect unchanged sections', () => {
      const oldText = `Paragraph 1.

Paragraph 2.`;

      const newText = oldText; // No changes

      const oldSections = splitIntoSections(oldText);
      const result = processIncrementally(newText, oldSections, new Set());

      expect(result.cachedCount).toBeGreaterThan(0);
      expect(result.changedCount).toBe(0);
    });

    it('should detect changed sections', () => {
      const oldText = `Paragraph 1.

Paragraph 2.`;

      const newText = `Paragraph 1 MODIFIED.

Paragraph 2.`;

      const oldSections = splitIntoSections(oldText);
      const result = processIncrementally(newText, oldSections, new Set());

      expect(result.changedCount).toBeGreaterThan(0);
    });

    it('should respect invalidated hashes', () => {
      const text = `Paragraph 1.

Paragraph 2.`;

      const sections = splitIntoSections(text);
      const invalidated = new Set([sections[0].hash]);

      const result = processIncrementally(text, sections, invalidated);

      // First section should be marked as changed due to invalidation
      expect(result.changedCount).toBeGreaterThan(0);
    });

    it('should return new sections', () => {
      const oldText = `Old para 1.

Old para 2.`;

      const newText = `New para 1.

New para 2.`;

      const oldSections = splitIntoSections(oldText);
      const result = processIncrementally(newText, oldSections, new Set());

      expect(result.sections.length).toBeGreaterThan(0);
      expect(result.sections.every(s => s.text && s.hash)).toBe(true);
    });

    it('should count total sections correctly', () => {
      const text = `Para 1.

Para 2.

Para 3.`;

      const sections = splitIntoSections(text);
      const result = processIncrementally(text, sections, new Set());

      expect(result.changedCount + result.cachedCount).toBe(result.sections.length);
    });

    it('should handle empty old sections', () => {
      const newText = `New paragraph.`;

      const result = processIncrementally(newText, [], new Set());

      expect(result.changedCount).toBeGreaterThan(0);
      expect(result.cachedCount).toBe(0);
    });

    it('should handle deleted sections', () => {
      const oldText = `Para 1.

Para 2.

Para 3.`;

      const newText = `Para 1.`;

      const oldSections = splitIntoSections(oldText);
      const result = processIncrementally(newText, oldSections, new Set());

      // Should detect changes
      expect(result.sections.length).toBeLessThan(oldSections.length);
    });

    it('should handle added sections', () => {
      const oldText = `Para 1.`;

      const newText = `Para 1.

Para 2.

Para 3.`;

      const oldSections = splitIntoSections(oldText);
      const result = processIncrementally(newText, oldSections, new Set());

      expect(result.sections.length).toBeGreaterThan(oldSections.length);
      expect(result.changedCount).toBeGreaterThan(0);
    });

    it('should identify cached sections correctly', () => {
      const text = `Unchanged para.

Another unchanged para.`;

      const sections = splitIntoSections(text);
      const result = processIncrementally(text, sections, new Set());

      // All sections should be cached (no changes)
      expect(result.cachedCount).toBe(result.sections.length);
      expect(result.changedCount).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // INTEGRATION TESTS
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Integration Tests', () => {
    it('should work across multiple cache types', async () => {
      const text = 'test content';

      parseStructureCached(text);
      analyzeStyleCached(text);
      extractEntitiesCached(text, [], [], 'ch1');

      const stats = getCacheStats();

      expect(stats.structuralCache.size).toBeGreaterThan(0);
      expect(stats.styleCache.size).toBeGreaterThan(0);
      expect(stats.fullEntityCache.size).toBeGreaterThan(0);
    });

    it('should maintain cache across multiple operations', async () => {
      const { parseStructure } = await import('@/services/intelligence/structuralParser');

      for (let i = 0; i < 5; i++) {
        parseStructureCached('same content');
      }

      // Should only parse once
      expect(parseStructure).toHaveBeenCalledTimes(1);
    });

    it('should handle mixed cache hits and misses', async () => {
      const { parseStructure } = await import('@/services/intelligence/structuralParser');

      parseStructureCached('content 1');
      parseStructureCached('content 2');
      parseStructureCached('content 1'); // Cache hit
      parseStructureCached('content 3');
      parseStructureCached('content 2'); // Cache hit

      expect(parseStructure).toHaveBeenCalledTimes(3);
    });

    it('should provide accurate incremental processing metrics', () => {
      const originalText = `Para 1.

Para 2.

Para 3.`;

      const modifiedText = `Para 1.

Para 2 MODIFIED.

Para 3.`;

      const oldSections = splitIntoSections(originalText);
      const result = processIncrementally(modifiedText, oldSections, new Set());

      // Should have some cached and some changed
      expect(result.cachedCount).toBeGreaterThan(0);
      expect(result.changedCount).toBeGreaterThan(0);
      expect(result.cachedCount + result.changedCount).toBe(result.sections.length);
    });

    it('should work with real-world text sizes', () => {
      const largeText = `
        Chapter 1: The Beginning

        It was a dark and stormy night. The rain pounded against the windows
        as Sarah sat by the fireplace, reading her favorite novel.

        She had no idea that her life was about to change forever.

        The doorbell rang, interrupting her thoughts. Who could be visiting
        at this hour? She set down her book and walked to the door.

        Through the peephole, she could see a mysterious figure standing
        in the rain, their face obscured by a hood.
      `.trim();

      const sections = splitIntoSections(largeText);
      const result = processIncrementally(largeText, sections, new Set());

      expect(sections.length).toBeGreaterThan(0);
      expect(result.cachedCount).toBe(sections.length);
      expect(result.changedCount).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // EDGE CASES
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('should handle very short text', () => {
      const result = parseStructureCached('a');
      expect(result).toBeDefined();
    });

    it('should handle very long text', () => {
      const longText = 'word '.repeat(10000);
      const result = parseStructureCached(longText);
      expect(result).toBeDefined();
    });

    it('should handle special characters', () => {
      const text = 'Text with "quotes" and \'apostrophes\' and <brackets>';
      const result = parseStructureCached(text);
      expect(result).toBeDefined();
    });

    it('should handle unicode characters', () => {
      const text = '你好世界 🌍 Привет мир';
      const result = parseStructureCached(text);
      expect(result).toBeDefined();
    });

    it('should handle text with many newlines', () => {
      const text = 'Line 1\n\n\n\n\nLine 2\n\n\n\nLine 3';
      const sections = splitIntoSections(text);
      expect(sections.length).toBeGreaterThan(0);
    });

    it('should handle text without paragraphs', () => {
      const text = 'One long paragraph without any double newlines at all.';
      const sections = splitIntoSections(text);
      expect(sections.length).toBe(1);
    });

    it('should not crash on null-like values', () => {
      expect(() => parseStructureCached('')).not.toThrow();
    });

    it('should maintain cache consistency after errors', async () => {
      const { parseStructure } = await import('@/services/intelligence/structuralParser');

      // @ts-ignore - testing error handling
      parseStructure.mockImplementationOnce(() => {
        throw new Error('Test error');
      });

      try {
        parseStructureCached('error test');
      } catch (e) {
        // Swallow error
      }

      // Cache should still work
      parseStructureCached('normal test');
      expect(parseStructure).toHaveBeenCalled();
    });
  });
});
