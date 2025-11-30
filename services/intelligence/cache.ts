/**
 * Intelligence Cache
 * 
 * Content-addressed caching for incremental processing.
 * Caches structural, entity, and style analysis by content hash.
 */

import {
  StructuralFingerprint,
  EntityGraph,
  StyleFingerprint,
  ClassifiedParagraph,
  EntityNode,
} from '../../types/intelligence';
import { hashContent } from './deltaTracker';

// ─────────────────────────────────────────────────────────────────────────────
// CACHE CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

const MAX_CACHE_SIZE = 100;        // Maximum entries per cache type
const CACHE_TTL = 5 * 60 * 1000;   // 5 minutes TTL

// ─────────────────────────────────────────────────────────────────────────────
// CACHE ENTRY TYPE
// ─────────────────────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  accessCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// LRU CACHE IMPLEMENTATION
// ─────────────────────────────────────────────────────────────────────────────

class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private maxSize: number;
  private ttl: number;

  constructor(maxSize: number = MAX_CACHE_SIZE, ttl: number = CACHE_TTL) {
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    // Update access count for LRU
    entry.accessCount++;
    return entry.data;
  }

  set(key: string, data: T): void {
    // Evict if at capacity
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      accessCount: 1,
    });
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    // Check TTL
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  private evictLRU(): void {
    let lruKey: string | null = null;
    let minAccess = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.accessCount < minAccess) {
        minAccess = entry.accessCount;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
    }
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  // Get cache stats for debugging
  getStats(): { size: number; maxSize: number; ttl: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttl: this.ttl,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// INTELLIGENCE CACHE
// ─────────────────────────────────────────────────────────────────────────────

export interface IntelligenceCache {
  // Section-level caches (keyed by section content hash)
  paragraphCache: LRUCache<ClassifiedParagraph[]>;
  entityCache: LRUCache<EntityNode[]>;
  styleCache: LRUCache<StyleFingerprint>;
  
  // Full document caches (keyed by full document hash)
  structuralCache: LRUCache<StructuralFingerprint>;
  fullEntityCache: LRUCache<EntityGraph>;
}

// Global cache instance
let globalCache: IntelligenceCache | null = null;

export const getIntelligenceCache = (): IntelligenceCache => {
  if (!globalCache) {
    globalCache = {
      paragraphCache: new LRUCache<ClassifiedParagraph[]>(),
      entityCache: new LRUCache<EntityNode[]>(),
      styleCache: new LRUCache<StyleFingerprint>(),
      structuralCache: new LRUCache<StructuralFingerprint>(),
      fullEntityCache: new LRUCache<EntityGraph>(),
    };
  }
  return globalCache;
};

export const clearIntelligenceCache = (): void => {
  if (globalCache) {
    globalCache.paragraphCache.clear();
    globalCache.entityCache.clear();
    globalCache.styleCache.clear();
    globalCache.structuralCache.clear();
    globalCache.fullEntityCache.clear();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CACHED PROCESSING FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

import { parseStructure } from './structuralParser';
import { extractEntities } from './entityExtractor';
import { analyzeStyle } from './styleAnalyzer';

/**
 * Parse structure with caching
 */
export const parseStructureCached = (text: string): StructuralFingerprint => {
  const cache = getIntelligenceCache();
  const hash = hashContent(text);
  
  // Check cache
  const cached = cache.structuralCache.get(hash);
  if (cached) {
    return cached;
  }
  
  // Parse and cache
  const result = parseStructure(text);
  cache.structuralCache.set(hash, result);
  
  return result;
};

/**
 * Extract entities with caching
 */
export const extractEntitiesCached = (
  text: string,
  paragraphs: ClassifiedParagraph[],
  dialogueMap: any[],
  chapterId: string
): EntityGraph => {
  const cache = getIntelligenceCache();
  const hash = hashContent(text + chapterId);
  
  // Check cache
  const cached = cache.fullEntityCache.get(hash);
  if (cached) {
    return cached;
  }
  
  // Extract and cache
  const result = extractEntities(text, paragraphs, dialogueMap, chapterId);
  cache.fullEntityCache.set(hash, result);
  
  return result;
};

/**
 * Analyze style with caching
 */
export const analyzeStyleCached = (text: string): StyleFingerprint => {
  const cache = getIntelligenceCache();
  const hash = hashContent(text);
  
  // Check cache
  const cached = cache.styleCache.get(hash);
  if (cached) {
    return cached;
  }
  
  // Analyze and cache
  const result = analyzeStyle(text);
  cache.styleCache.set(hash, result);
  
  return result;
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION-BASED INCREMENTAL PROCESSING
// ─────────────────────────────────────────────────────────────────────────────

const SECTION_SIZE = 500; // Characters per section

/**
 * Split text into cacheable sections
 */
export const splitIntoSections = (text: string): Array<{ text: string; offset: number; hash: string }> => {
  const sections: Array<{ text: string; offset: number; hash: string }> = [];
  
  // Split on paragraph boundaries when possible
  const paragraphs = text.split(/\n\s*\n/);
  let currentOffset = 0;
  let currentSection = '';
  let sectionStart = 0;
  
  for (const para of paragraphs) {
    if (currentSection.length + para.length > SECTION_SIZE && currentSection.length > 0) {
      // Flush current section
      sections.push({
        text: currentSection,
        offset: sectionStart,
        hash: hashContent(currentSection),
      });
      currentSection = para;
      sectionStart = currentOffset;
    } else {
      currentSection += (currentSection ? '\n\n' : '') + para;
    }
    currentOffset += para.length + 2; // +2 for paragraph separator
  }
  
  // Don't forget the last section
  if (currentSection) {
    sections.push({
      text: currentSection,
      offset: sectionStart,
      hash: hashContent(currentSection),
    });
  }
  
  return sections;
};

/**
 * Process only changed sections, using cache for unchanged ones
 */
export const processIncrementally = (
  newText: string,
  oldSections: Array<{ text: string; offset: number; hash: string }>,
  invalidatedHashes: Set<string>
): {
  changedCount: number;
  cachedCount: number;
  sections: Array<{ text: string; offset: number; hash: string }>;
} => {
  const newSections = splitIntoSections(newText);
  let changedCount = 0;
  let cachedCount = 0;
  
  // Track which sections changed
  const oldHashSet = new Set(oldSections.map(s => s.hash));
  
  for (const section of newSections) {
    if (oldHashSet.has(section.hash) && !invalidatedHashes.has(section.hash)) {
      cachedCount++;
    } else {
      changedCount++;
    }
  }
  
  return {
    changedCount,
    cachedCount,
    sections: newSections,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// CACHE STATISTICS
// ─────────────────────────────────────────────────────────────────────────────

export interface CacheStats {
  paragraphCache: { size: number; maxSize: number; ttl: number };
  entityCache: { size: number; maxSize: number; ttl: number };
  styleCache: { size: number; maxSize: number; ttl: number };
  structuralCache: { size: number; maxSize: number; ttl: number };
  fullEntityCache: { size: number; maxSize: number; ttl: number };
  totalEntries: number;
}

export const getCacheStats = (): CacheStats => {
  const cache = getIntelligenceCache();
  
  return {
    paragraphCache: cache.paragraphCache.getStats(),
    entityCache: cache.entityCache.getStats(),
    styleCache: cache.styleCache.getStats(),
    structuralCache: cache.structuralCache.getStats(),
    fullEntityCache: cache.fullEntityCache.getStats(),
    totalEntries: 
      cache.paragraphCache.size +
      cache.entityCache.size +
      cache.styleCache.size +
      cache.structuralCache.size +
      cache.fullEntityCache.size,
  };
};
