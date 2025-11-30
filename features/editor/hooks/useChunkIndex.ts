/**
 * useChunkIndex Hook
 * 
 * React integration for the chunk index system.
 * Provides:
 * - Automatic chunk registration when chapters load
 * - Edit handling with debounce
 * - Processing status and stats
 * - Access to chunk analyses
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChunkId,
  ChunkAnalysis,
  ChunkRecord,
  AggregateSummary,
} from '../../../types/intelligence';
import {
  ChunkManager,
  createChunkManager,
  ChunkManagerConfig,
} from '../../../services/intelligence/chunkManager';
import { createChunkId } from '../../../services/intelligence/chunkIndex';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface UseChunkIndexOptions {
  /** Custom manager config */
  config?: Partial<ChunkManagerConfig>;
  
  /** Auto-register chapters on mount */
  autoRegister?: boolean;
}

export interface ChunkIndexState {
  /** Whether the system is processing dirty chunks */
  isProcessing: boolean;
  
  /** Number of dirty chunks in queue */
  dirtyCount: number;
  
  /** Total chunks tracked */
  totalChunks: number;
  
  /** Processing error (if any) */
  lastError: string | null;
}

export interface UseChunkIndexReturn {
  /** Current state */
  state: ChunkIndexState;
  
  /** Register a chapter with its content */
  registerChapter: (chapterId: string, content: string) => void;
  
  /** Handle an edit in a chapter */
  handleEdit: (chapterId: string, newText: string, editStart: number, editEnd: number) => void;
  
  /** Get chunk by ID */
  getChunk: (chunkId: ChunkId) => ChunkRecord | undefined;
  
  /** Get chapter chunk */
  getChapterChunk: (chapterId: string) => ChunkRecord | undefined;
  
  /** Get analysis at cursor position */
  getAnalysisAtCursor: (chapterId: string, offset: number) => ChunkAnalysis | null;
  
  /** Get aggregate summary */
  getAggregate: (chunkId: ChunkId) => AggregateSummary | undefined;
  
  /** Get book-level summary */
  getBookSummary: () => AggregateSummary | undefined;
  
  /** Get all chapter analyses */
  getAllChapterAnalyses: () => Map<string, ChunkAnalysis | null>;
  
  /** Force process all dirty chunks */
  processAllDirty: () => Promise<void>;
  
  /** Reprocess a specific chunk */
  reprocessChunk: (chunkId: ChunkId) => Promise<void>;
  
  /** Retry all errored chunks */
  retryErrors: () => ChunkId[];
  
  /** Pause processing */
  pause: () => void;
  
  /** Resume processing */
  resume: () => void;
  
  /** Clear all state */
  clear: () => void;
  
  /** Get detailed stats */
  getStats: () => ReturnType<ChunkManager['getStats']>;
}

// ─────────────────────────────────────────────────────────────────────────────
// HOOK
// ─────────────────────────────────────────────────────────────────────────────

export function useChunkIndex(
  options: UseChunkIndexOptions = {}
): UseChunkIndexReturn {
  const { config } = options;
  
  // State
  const [state, setState] = useState<ChunkIndexState>({
    isProcessing: false,
    dirtyCount: 0,
    totalChunks: 0,
    lastError: null,
  });
  
  // Manager ref (stable across renders)
  const managerRef = useRef<ChunkManager | null>(null);
  
  // Initialize manager
  useEffect(() => {
    const manager = createChunkManager(config, {
      onProcessingStart: () => {
        setState(s => ({ ...s, isProcessing: true }));
      },
      onProcessingEnd: () => {
        setState(s => ({ ...s, isProcessing: false }));
      },
      onChunkProcessed: () => {
        // Update stats after each chunk
        if (managerRef.current) {
          const stats = managerRef.current.getStats();
          setState(s => ({
            ...s,
            totalChunks: stats.totalChunks,
            dirtyCount: stats.dirtyCount,
          }));
        }
      },
      onError: (_chunkId, error) => {
        setState(s => ({ ...s, lastError: error }));
      },
      onQueueChange: (dirtyCount) => {
        setState(s => ({ ...s, dirtyCount }));
      },
    });
    
    managerRef.current = manager;
    
    return () => {
      manager.destroy();
      managerRef.current = null;
    };
  }, [config]);
  
  // ─────────────────────────────────────────────────────────────────────────────
  // ACTIONS
  // ─────────────────────────────────────────────────────────────────────────────
  
  const registerChapter = useCallback((chapterId: string, content: string) => {
    managerRef.current?.registerChapter(chapterId, content);
    
    // Update stats
    if (managerRef.current) {
      const stats = managerRef.current.getStats();
      setState(s => ({
        ...s,
        totalChunks: stats.totalChunks,
        dirtyCount: stats.dirtyCount,
      }));
    }
  }, []);
  
  const handleEdit = useCallback((
    chapterId: string,
    newText: string,
    editStart: number,
    editEnd: number
  ) => {
    managerRef.current?.handleEdit(chapterId, newText, editStart, editEnd);
  }, []);
  
  const getChunk = useCallback((chunkId: ChunkId) => {
    return managerRef.current?.getChunk(chunkId);
  }, []);
  
  const getChapterChunk = useCallback((chapterId: string) => {
    return managerRef.current?.getChapterChunk(chapterId);
  }, []);
  
  const getAnalysisAtCursor = useCallback((chapterId: string, offset: number) => {
    return managerRef.current?.getAnalysisAtCursor(chapterId, offset) || null;
  }, []);
  
  const getAggregate = useCallback((chunkId: ChunkId) => {
    return managerRef.current?.getAggregate(chunkId);
  }, []);
  
  const getBookSummary = useCallback(() => {
    return managerRef.current?.getBookSummary();
  }, []);
  
  const getAllChapterAnalyses = useCallback(() => {
    return managerRef.current?.getAllChapterAnalyses() || new Map();
  }, []);
  
  const processAllDirty = useCallback(async () => {
    await managerRef.current?.processAllDirty();
  }, []);
  
  const reprocessChunk = useCallback(async (chunkId: ChunkId) => {
    await managerRef.current?.reprocessChunk(chunkId);
  }, []);
  
  const retryErrors = useCallback(() => {
    return managerRef.current?.retryErrors() || [];
  }, []);
  
  const pause = useCallback(() => {
    managerRef.current?.pause();
  }, []);
  
  const resume = useCallback(() => {
    managerRef.current?.resume();
  }, []);
  
  const clear = useCallback(() => {
    managerRef.current?.clear();
    setState({
      isProcessing: false,
      dirtyCount: 0,
      totalChunks: 0,
      lastError: null,
    });
  }, []);
  
  const getStats = useCallback(() => {
    return managerRef.current?.getStats() || {
      totalChunks: 0,
      dirtyCount: 0,
      freshCount: 0,
      processingCount: 0,
      errorCount: 0,
      byLevel: { scene: 0, chapter: 0, act: 0, book: 0 },
      isProcessing: false,
      chapterCount: 0,
    };
  }, []);
  
  return {
    state,
    registerChapter,
    handleEdit,
    getChunk,
    getChapterChunk,
    getAnalysisAtCursor,
    getAggregate,
    getBookSummary,
    getAllChapterAnalyses,
    processAllDirty,
    reprocessChunk,
    retryErrors,
    pause,
    resume,
    clear,
    getStats,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER HOOK: Auto-sync with editor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hook that auto-syncs chunk index with editor content changes
 */
export function useChunkIndexSync(
  chapterId: string | null,
  content: string,
  cursorOffset: number,
  chunkIndex: UseChunkIndexReturn
): {
  currentChunk: ChunkRecord | undefined;
  currentAnalysis: ChunkAnalysis | null;
} {
  const lastContentRef = useRef<string>('');
  const lastChapterIdRef = useRef<string | null>(null);
  
  // Register chapter when it changes
  useEffect(() => {
    if (chapterId && chapterId !== lastChapterIdRef.current) {
      chunkIndex.registerChapter(chapterId, content);
      lastChapterIdRef.current = chapterId;
      lastContentRef.current = content;
    }
  }, [chapterId, content, chunkIndex]);
  
  // Handle edits when content changes
  useEffect(() => {
    if (!chapterId) return;
    if (content === lastContentRef.current) return;
    
    // Simple diff: find first differing position
    const oldContent = lastContentRef.current;
    let editStart = 0;
    while (editStart < oldContent.length && editStart < content.length && oldContent[editStart] === content[editStart]) {
      editStart++;
    }
    
    // Find end of change from the back
    let oldEnd = oldContent.length;
    let newEnd = content.length;
    while (oldEnd > editStart && newEnd > editStart && oldContent[oldEnd - 1] === content[newEnd - 1]) {
      oldEnd--;
      newEnd--;
    }
    
    chunkIndex.handleEdit(chapterId, content, editStart, oldEnd);
    lastContentRef.current = content;
  }, [chapterId, content, chunkIndex]);
  
  // Get current chunk at cursor
  const currentChunk = chapterId
    ? chunkIndex.getChunk(createChunkId('chapter', chapterId))
    : undefined;
  
  const currentAnalysis = chapterId
    ? chunkIndex.getAnalysisAtCursor(chapterId, cursorOffset)
    : null;
  
  return {
    currentChunk,
    currentAnalysis,
  };
}

export default useChunkIndex;
