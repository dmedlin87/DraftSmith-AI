import Dexie, { Table } from 'dexie';
import { Project, Chapter } from '../types/schema';
import { MemoryNote, AgentGoal, WatchedEntity } from './memory/types';

export class QuillAIDB extends Dexie {
  projects!: Table<Project>;
  chapters!: Table<Chapter>;
  memories!: Table<MemoryNote>;
  goals!: Table<AgentGoal>;
  watchedEntities!: Table<WatchedEntity>;

  constructor() {
    super('QuillAIDB');

    // Version 1: Original schema
    (this as any).version(1).stores({
      projects: 'id, updatedAt',
      chapters: 'id, projectId, order, updatedAt' 
    });

    // Version 2: Agent Memory System
    // - memories: indexed by scope, projectId, type, and compound [scope+projectId]
    //   *topicTags creates a multi-entry index for tag-based queries
    // - goals: indexed by projectId and status for filtering
    // - watchedEntities: indexed by projectId for per-project retrieval
    (this as any).version(2).stores({
      projects: 'id, updatedAt',
      chapters: 'id, projectId, order, updatedAt',
      memories: 'id, scope, projectId, type, [scope+projectId], *topicTags, importance, createdAt',
      goals: 'id, projectId, status, [projectId+status], createdAt',
      watchedEntities: 'id, projectId, priority'
    });
  }
}

export const db = new QuillAIDB();