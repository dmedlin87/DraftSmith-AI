import '@testing-library/jest-dom';
import { afterEach, vi } from 'vitest';
import { useProjectStore } from '@/features/project/store/useProjectStore';
import { useLayoutStore } from '@/features/layout/store/useLayoutStore';
import { useSettingsStore } from '@/features/settings/store/useSettingsStore';
import { db } from '@/services/db';

type StoreApi<T> = {
  getState: () => T;
  setState: (partial: T | Partial<T>, replace?: boolean) => void;
};

const stores: StoreApi<any>[] = [
  useProjectStore as unknown as StoreApi<any>,
  useLayoutStore as unknown as StoreApi<any>,
  useSettingsStore as unknown as StoreApi<any>,
];

const initialStates = new Map<StoreApi<any>, any>();

for (const store of stores) {
  if (!initialStates.has(store)) {
    initialStates.set(store, store.getState());
  }
}

// Global Dexie/IndexedDB mock: replace @/services/db with an in-memory implementation
vi.mock('@/services/db', () => {
  type WithId = { id: string };

  const createTable = <T extends WithId>() => {
    const data = new Map<string, T>();

    return {
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

// Mock matchMedia for components that use it
Object.defineProperty(window, 'matchMedia', {
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

const resetStores = () => {
  for (const store of stores) {
    const initial = initialStates.get(store);
    if (initial) {
      store.setState(initial, true);
    }
  }
};

afterEach(() => {
  resetStores();

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
