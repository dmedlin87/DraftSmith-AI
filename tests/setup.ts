import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import React from 'react';

const windowRef =
  typeof window !== 'undefined'
    ? window
    : ((globalThis as any) as Window & typeof globalThis);

// Stores are now globally mocked, so no need for manual state tracking

// Lightweight global mock for @google/genai to avoid heavy SDK initialization in tests
// Individual test files can override this mock with vi.mock('@google/genai', ...) as needed.
vi.mock('@google/genai', () => {
  const Type = {
    OBJECT: 'OBJECT',
    ARRAY: 'ARRAY',
    STRING: 'STRING',
    NUMBER: 'NUMBER',
    BOOLEAN: 'BOOLEAN',
  } as const;

  const Modality = {
    AUDIO: 'AUDIO',
    TEXT: 'TEXT',
  } as const;

  class GoogleGenAI {
    models = {
      generateContent: async () => ({ text: '', usageMetadata: undefined }),
    };

    chats = {
      create: () => ({
        sendMessage: async () => ({ text: '', usageMetadata: undefined }),
      }),
    };

    live = {
      connect: async () => ({
        sendRealtimeInput: () => {},
        close: () => {},
      }),
    };
  }

  return { GoogleGenAI, Type, Modality };
});

// Provide minimal Web Audio / Speech API shims for environments without them
if (!(globalThis as any).AudioContext) {
  class StubAudioContext {
    sampleRate: number;
    constructor(options?: { sampleRate?: number }) {
      this.sampleRate = options?.sampleRate ?? 44100;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    decodeAudioData(_data: ArrayBuffer): Promise<AudioBuffer> {
      return Promise.resolve({} as AudioBuffer);
    }
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    close() {}
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    createBufferSource() { return { connect: vi.fn(), start: vi.fn(), stop: vi.fn() }; }
    destination = {} as AudioDestinationNode;
  }
  (globalThis as any).AudioContext = StubAudioContext;
  (globalThis as any).webkitAudioContext = StubAudioContext;
}

if (!(globalThis as any).speechSynthesis) {
  (globalThis as any).speechSynthesis = {
    speak: vi.fn(),
    cancel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    getVoices: vi.fn(() => []),
    onvoiceschanged: null,
  };
}

// Global Dexie/IndexedDB mock: replace @/services/db with an in-memory implementation
vi.mock('@/services/db', () => {
  type WithId = { id: string };

  const createTable = <T extends WithId>() => {
    const data = new Map<string, T>();

    return {
      async put(item: T) {
        data.set(item.id, item);
        return item.id;
      },
      async add(item: T) {
        data.set(item.id, item);
        return item.id;
      },
      async bulkAdd(items: T[]) {
        items.forEach((item) => data.set(item.id, item));
      },
      async bulkPut(items: T[]) {
        items.forEach((item) => data.set(item.id, item));
      },
      async update(id: string, changes: Partial<T>) {
        const current = data.get(id);
        if (!current) return;
        data.set(id, { ...current, ...changes });
      },
      async delete(id: string) {
        data.delete(id);
      },
      async get(id: string) {
        return data.get(id);
      },
      where<K extends keyof T>(field: K) {
        return {
          equals(value: T[K]) {
            const filtered = Array.from(data.values()).filter(
              (item) => (item as any)[field] === value,
            );
            return {
              async sortBy(sortField: keyof T) {
                return [...filtered].sort((a, b) => {
                  const av = (a as any)[sortField];
                  const bv = (b as any)[sortField];
                  if (av < bv) return -1;
                  if (av > bv) return 1;
                  return 0;
                });
              },
              async toArray() {
                return [...filtered];
              },
            };
          },
        };
      },
      orderBy(field: keyof T) {
        const sorted = Array.from(data.values()).sort((a, b) => {
          const av = (a as any)[field];
          const bv = (b as any)[field];
          if (av < bv) return -1;
          if (av > bv) return 1;
          return 0;
        });
        return {
          reverse() {
            const reversed = [...sorted].reverse();
            return {
              async toArray() {
                return reversed;
              },
            };
          },
          async toArray() {
            return sorted;
          },
        };
      },
      async toArray() {
        return Array.from(data.values());
      },
      _clear() {
        data.clear();
      },
    };
  };

  const createInMemoryDB = () => {
    const projects = createTable<any>();
    const chapters = createTable<any>();
    const memories = createTable<any>();
    const goals = createTable<any>();
    const watchedEntities = createTable<any>();

    const reset = () => {
      projects._clear();
      chapters._clear();
      memories._clear();
      goals._clear();
      watchedEntities._clear();
    };

    return {
      projects,
      chapters,
      memories,
      goals,
      watchedEntities,
      async transaction(_mode: string, ...args: any[]) {
        const body = args[args.length - 1];
        if (typeof body === 'function') {
          await body();
        }
      },
      reset,
    };
  };

  const inMemoryDb = createInMemoryDB();

  class QuillAIDBMock {}

  return {
    QuillAIDB: QuillAIDBMock,
    db: inMemoryDb,
  };
});

// Mock environment variables for Gemini API
vi.stubEnv('VITE_GEMINI_API_KEY', 'test-api-key-for-testing');

// Global mock for EditorContext to prevent crashes when components are loaded without providers
// Individual tests can override these mocks with vi.mock() as needed
vi.mock('@/features/core/context/EditorContext', () => ({
  EditorProvider: ({ children }: { children: React.ReactNode }) => children,
  useEditor: vi.fn(() => ({
    currentText: '',
    updateText: vi.fn(),
    setSelectionState: vi.fn(),
    selectionRange: null,
    selectionPos: null,
    activeHighlight: null,
    setEditor: vi.fn(),
    clearSelection: vi.fn(),
    editor: null,
    history: [],
    restore: vi.fn(),
    handleNavigateToIssue: vi.fn(),
  })),
  useEditorState: vi.fn(() => ({
    editor: null,
    currentText: '',
    history: [],
    redoStack: [],
    canUndo: false,
    canRedo: false,
    hasUnsavedChanges: false,
    selectionRange: null,
    selectionPos: null,
    cursorPosition: 0,
    activeHighlight: null,
    branches: [],
    activeBranchId: null,
    isOnMain: true,
    inlineComments: [],
    visibleComments: [],
    isZenMode: false,
  })),
  useEditorActions: vi.fn(() => ({
    setEditor: vi.fn(),
    updateText: vi.fn(),
    commit: vi.fn(),
    loadDocument: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    restore: vi.fn(),
    setSelection: vi.fn(),
    setSelectionState: vi.fn(),
    clearSelection: vi.fn(),
    handleNavigateToIssue: vi.fn(),
    scrollToPosition: vi.fn(),
    getEditorContext: vi.fn(),
    createBranch: vi.fn(),
    switchBranch: vi.fn(),
    mergeBranch: vi.fn(),
    deleteBranch: vi.fn(),
    renameBranch: vi.fn(),
    setInlineComments: vi.fn(),
    dismissComment: vi.fn(),
    clearComments: vi.fn(),
    toggleZenMode: vi.fn(),
  })),
  useManuscript: vi.fn(() => ({
    currentText: '',
    updateText: vi.fn(),
  })),
  ManuscriptProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Global mock for useProjectStore to prevent crashes
// Creates a mock that returns safe default values, can be overridden by individual tests
const createDefaultProjectState = () => ({
  projects: [],
  currentProject: null,
  chapters: [],
  activeChapterId: null,
  isLoading: false,
  error: null,
  init: vi.fn(),
  loadProject: vi.fn(),
  createProject: vi.fn().mockResolvedValue('mock-id'),
  importProject: vi.fn().mockResolvedValue('mock-id'),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  createChapter: vi.fn().mockResolvedValue('mock-chapter-id'),
  updateChapter: vi.fn(),
  deleteChapter: vi.fn(),
  selectChapter: vi.fn(),
  setActiveChapter: vi.fn(),
  getActiveChapter: () => undefined,
  reorderChapters: vi.fn(),
  updateProjectLore: vi.fn(),
  updateChapterContent: vi.fn(),
  updateChapterTitle: vi.fn(),
  updateChapterAnalysis: vi.fn(),
  updateManuscriptIndex: vi.fn(),
});

// Create a mock function that tracks calls and can be overridden
const mockUseProjectStore = vi.fn((selector?: (state: any) => any) => {
  const state = createDefaultProjectState();
  return typeof selector === 'function' ? selector(state) : state;
});

vi.mock('@/features/project/store/useProjectStore', () => ({
  useProjectStore: mockUseProjectStore,
}));

// Mock matchMedia for components that use it
Object.defineProperty(windowRef, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock Web Worker to avoid spawning real workers in tests
class MockWorker {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_url: string | URL, _options?: any) {}
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  postMessage(_message: any) {}
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  terminate() {}
  onmessage: ((this: Worker, ev: MessageEvent) => any) | null = null;
  onerror: ((this: Worker, ev: ErrorEvent) => any) | null = null;
}

// Always override to ensure consistency across environments
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).Worker = MockWorker as unknown as typeof Worker;

afterEach(async () => {
  // Clean up DOM between tests - critical for preventing test pollution
  cleanup();

  // Reset the in-memory database
  const { db } = await import('@/services/db');
  const anyDb = db as any;
  if (anyDb && typeof anyDb.reset === 'function') {
    anyDb.reset();
  }

  vi.clearAllMocks();

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.clear();
      window.sessionStorage?.clear();
    } catch {
      // ignore
    }
  }
});
