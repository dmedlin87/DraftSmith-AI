import Dexie from 'dexie';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { QuillAIDB } from '../../services/db';

const loadDatabaseModule = async () => {
  vi.doUnmock('@/services/db');
  vi.doUnmock('../../services/db');
  return import('../../services/db');
};

const getStoresForVersion = (instance: QuillAIDB, version: number) => {
  const dexieVersions = (instance as unknown as { _versions: Array<{ _cfg: { version: number; storesSource: Record<string, string> } }> })._versions;
  const target = dexieVersions.find((entry) => entry._cfg.version === version);
  expect(target).toBeDefined();
  return target!._cfg.storesSource;
};

describe('QuillAIDB schema', () => {
  const originalIndexedDB = Dexie.dependencies.indexedDB;
  const originalIDBKeyRange = Dexie.dependencies.IDBKeyRange;

  beforeAll(() => {
    Dexie.dependencies.indexedDB = {} as IDBFactory;
    Dexie.dependencies.IDBKeyRange = {} as typeof IDBKeyRange;
  });

  afterAll(() => {
    Dexie.dependencies.indexedDB = originalIndexedDB;
    Dexie.dependencies.IDBKeyRange = originalIDBKeyRange;
  });

  it('defines version 1 schema for projects and chapters', async () => {
    const { QuillAIDB: RealQuillAIDB } = await loadDatabaseModule();
    const instance = new RealQuillAIDB();
    const stores = getStoresForVersion(instance, 1);

    expect(stores).toMatchObject({
      projects: 'id, updatedAt',
      chapters: 'id, projectId, order, updatedAt'
    });
    expect(Object.keys(stores)).toHaveLength(2);
  });

  it('defines version 2 schema with agent memory tables', async () => {
    const { QuillAIDB: RealQuillAIDB } = await loadDatabaseModule();
    const instance = new RealQuillAIDB();
    const stores = getStoresForVersion(instance, 2);

    expect(stores).toMatchObject({
      projects: 'id, updatedAt',
      chapters: 'id, projectId, order, updatedAt',
      memories: 'id, scope, projectId, type, [scope+projectId], *topicTags, importance, createdAt',
      goals: 'id, projectId, status, [projectId+status], createdAt',
      watchedEntities: 'id, projectId, priority'
    });
    expect(Object.keys(stores)).toHaveLength(5);
  });

  it('exports a reusable database instance', async () => {
    const { QuillAIDB: RealQuillAIDB, db } = await loadDatabaseModule();

    expect(db).toBeInstanceOf(RealQuillAIDB);
    expect(db.verno).toBe(2);

    const tableNames = db.tables.map((table) => table.name);
    expect(tableNames).toEqual(expect.arrayContaining(['projects', 'chapters', 'memories', 'goals', 'watchedEntities']));
  });
});
