import { create } from 'zustand';
import { db } from '@/services/db';
import { Project, Chapter, Lore, ManuscriptIndex } from '@/types/schema';
import { AnalysisResult } from '@/types';
import { ParsedChapter } from '@/services/manuscriptParser';
import { createEmptyIndex } from '@/services/manuscriptIndexer';

interface ProjectState {
  // State
  projects: Project[];
  currentProject: Project | null;
  chapters: Chapter[];
  activeChapterId: string | null;
  isLoading: boolean;

  // Actions
  init: () => Promise<void>;
  createProject: (title: string, author?: string, setting?: { timePeriod: string; location: string }) => Promise<string>;
  importProject: (title: string, chapters: ParsedChapter[], author?: string, setting?: { timePeriod: string; location: string }) => Promise<string>;
  loadProject: (projectId: string) => Promise<void>;
  
  createChapter: (title?: string) => Promise<string>;
  selectChapter: (chapterId: string) => void;
  reorderChapters: (chapters: Chapter[]) => Promise<void>;
  updateChapterContent: (chapterId: string, content: string) => Promise<void>;
  updateChapterTitle: (chapterId: string, title: string) => Promise<void>;
  updateChapterAnalysis: (chapterId: string, analysis: AnalysisResult) => Promise<void>;
  updateProjectLore: (projectId: string, lore: Lore) => Promise<void>;
  updateManuscriptIndex: (projectId: string, index: ManuscriptIndex) => Promise<void>;
  deleteChapter: (chapterId: string) => Promise<void>;
  
  flushPendingWrites: () => Promise<void>;
  getActiveChapter: () => Chapter | undefined;
}

export const useProjectStore = create<ProjectState>((set, get) => {
  const WRITE_DEBOUNCE_MS = 400;
  const pendingChapterWrites = new Map<string, { timer: ReturnType<typeof setTimeout>; promise: Promise<void>; resolve?: () => void }>();
  const latestChapterContent = new Map<string, { content: string; updatedAt: number }>();

  const runProjectChapterTransaction = async (
    body: () => Promise<void>,
  ): Promise<void> => {
    const anyDb: any = db as any;
    if (typeof anyDb.transaction === 'function') {
      await anyDb.transaction('rw', anyDb.projects, anyDb.chapters, body);
    } else {
      await body();
    }
  };

  const persistChapter = async (chapterId: string, resolveFn?: () => void) => {
    try {
      const latest = latestChapterContent.get(chapterId);
      if (!latest) return;

      const chapter = await db.chapters.get(chapterId);
      const projectId = chapter?.projectId;

      if (!chapter || !projectId) {
        // Fallback: still persist chapter content if we can't resolve project
        await db.chapters.update(chapterId, { content: latest.content, updatedAt: latest.updatedAt });
      } else {
        await runProjectChapterTransaction(async () => {
          await db.chapters.update(chapterId, { content: latest.content, updatedAt: latest.updatedAt });
          await db.projects.update(projectId, { updatedAt: latest.updatedAt });
        });
      }
    } catch (error) {
      console.error('[ProjectStore] Failed to persist chapter content', error);
    } finally {
      latestChapterContent.delete(chapterId);
      pendingChapterWrites.delete(chapterId);
      resolveFn?.();
    }
  };

  const scheduleChapterPersist = (chapterId: string, payload: { content: string; updatedAt: number }) => {
    latestChapterContent.set(chapterId, payload);

    const existing = pendingChapterWrites.get(chapterId);
    if (existing?.timer) {
      clearTimeout(existing.timer);
    }

    let resolveFn = existing?.resolve;
    const promise = existing?.promise || new Promise<void>((resolve) => {
      resolveFn = resolve;
    });

    const timer = setTimeout(() => {
      void persistChapter(chapterId, resolveFn);
    }, WRITE_DEBOUNCE_MS);

    pendingChapterWrites.set(chapterId, { timer, promise, resolve: resolveFn });
    return promise;
  };

  const flushAllPendingWrites = async (): Promise<void> => {
    const entries = Array.from(pendingChapterWrites.entries());
    if (entries.length === 0) return;

    await Promise.all(
      entries.map(([chapterId, entry]) => {
        clearTimeout(entry.timer);
        return persistChapter(chapterId, entry.resolve);
      }),
    );
  };

  return {
    projects: [],
    currentProject: null,
    chapters: [],
    activeChapterId: null,
    isLoading: true,

  init: async () => {
    const projects = await db.projects.orderBy('updatedAt').reverse().toArray();
    set({ projects, isLoading: false });
    
    // Auto-load most recent if exists
    if (projects.length > 0) {
      get().loadProject(projects[0].id);
    }
  },

  createProject: async (title, author = 'Unknown', setting) => {
    const id = crypto.randomUUID();
    const newProject: Project = {
      id,
      title,
      author,
      setting,
      manuscriptIndex: createEmptyIndex(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    await db.projects.add(newProject);
    set(state => ({ projects: [newProject, ...state.projects] }));
    await get().loadProject(id);
    return id;
  },

  importProject: async (title, chapters, author = 'Unknown', setting) => {
    const projectId = crypto.randomUUID();
    
    // 1. Create Project
    const newProject: Project = {
      id: projectId,
      title,
      author,
      setting,
      manuscriptIndex: createEmptyIndex(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    // 2. Process Chapters (Parsing happens in UI/Wizard now)
    const chaptersToCreate: Chapter[] = chapters.map((pc, index) => ({
        id: crypto.randomUUID(),
        projectId,
        title: pc.title,
        content: pc.content,
        order: index,
        updatedAt: Date.now()
    }));

    await runProjectChapterTransaction(async () => {
      await db.projects.add(newProject);
      if (chaptersToCreate.length > 0) {
        await db.chapters.bulkAdd(chaptersToCreate);
      }
    });

    // 3. Update State
    set(state => ({ projects: [newProject, ...state.projects] }));
    
    // Select first chapter
    const activeId = chaptersToCreate.length > 0 ? chaptersToCreate[0].id : null;

    set({
        currentProject: newProject,
        chapters: chaptersToCreate,
        activeChapterId: activeId,
        isLoading: false
    });

    return projectId;
  },

  loadProject: async (projectId) => {
    set({ isLoading: true });
    const project = await db.projects.get(projectId);
    if (!project) {
        set({ isLoading: false });
        return;
    }

    const chapters = await db.chapters.where('projectId').equals(projectId).sortBy('order');
    
    let activeId = null;
    if (chapters.length === 0) {
        // Create first chapter if none exist
        activeId = crypto.randomUUID();
        const firstChapter: Chapter = {
            id: activeId,
            projectId,
            title: 'Chapter 1',
            content: '',
            order: 0,
            updatedAt: Date.now()
        };
        await db.chapters.add(firstChapter);
        chapters.push(firstChapter);
    } else {
        activeId = chapters[0].id;
    }

    set({
        currentProject: project,
        chapters,
        activeChapterId: activeId,
        isLoading: false
    });
  },

  flushPendingWrites: async () => {
    await flushAllPendingWrites();
  },

  createChapter: async (title) => {
    const { currentProject, chapters } = get();
    if (!currentProject) return '';

    const id = crypto.randomUUID();
    const order = chapters.length > 0 ? chapters[chapters.length - 1].order + 1 : 0;
    const newTitle = title || `Chapter ${order + 1}`;

    const newChapter: Chapter = {
        id,
        projectId: currentProject.id,
        title: newTitle,
        content: '',
        order,
        updatedAt: Date.now()
    };

    await db.chapters.add(newChapter);
    set(state => ({ 
        chapters: [...state.chapters, newChapter],
        activeChapterId: id 
    }));
    return id;
  },

  selectChapter: (chapterId) => {
      set({ activeChapterId: chapterId });
  },

  reorderChapters: async (newChapters) => {
      if (newChapters.length === 0) {
        set({ chapters: [] });
        return;
      }

      const updatedAt = Date.now();

      // Apply new order locally with synced metadata
      const reordered = newChapters.map((c, index) => ({
        ...c,
        order: index,
        updatedAt,
      }));

      set({ chapters: reordered });

      const projectId = reordered[0]?.projectId;

      // Persist order changes and bump project timestamp when available
      await runProjectChapterTransaction(async () => {
        await db.chapters.bulkPut(reordered);

        if (projectId) {
          await db.projects.update(projectId, { updatedAt });
        }
      });
  },

  updateChapterContent: async (chapterId, content) => {
      const updatedAt = Date.now();
      // Update local state immediately for responsiveness
      set(state => ({
          chapters: state.chapters.map(c => 
              c.id === chapterId ? { ...c, content, updatedAt } : c
          )
      }));

      return scheduleChapterPersist(chapterId, { content, updatedAt });
  },

  updateChapterTitle: async (chapterId, title) => {
    set(state => ({
        chapters: state.chapters.map(c => 
            c.id === chapterId ? { ...c, title, updatedAt: Date.now() } : c
        )
    }));
    await db.chapters.update(chapterId, { title, updatedAt: Date.now() });
  },
  
  updateChapterAnalysis: async (chapterId, analysis) => {
    set(state => ({
        chapters: state.chapters.map(c => 
            c.id === chapterId ? { ...c, lastAnalysis: analysis } : c
        )
    }));
    await db.chapters.update(chapterId, { lastAnalysis: analysis });
  },

  updateProjectLore: async (projectId, lore) => {
    set(state => ({
        currentProject: state.currentProject?.id === projectId ? { ...state.currentProject, lore } : state.currentProject,
        projects: state.projects.map(p => p.id === projectId ? { ...p, lore } : p)
    }));
    await db.projects.update(projectId, { lore, updatedAt: Date.now() });
  },

  updateManuscriptIndex: async (projectId, index) => {
    set(state => ({
        currentProject: state.currentProject?.id === projectId ? { ...state.currentProject, manuscriptIndex: index } : state.currentProject,
        projects: state.projects.map(p => p.id === projectId ? { ...p, manuscriptIndex: index } : p)
    }));
    await db.projects.update(projectId, { manuscriptIndex: index, updatedAt: Date.now() });
  },

  deleteChapter: async (chapterId) => {
      await db.chapters.delete(chapterId);
      set(state => {
          const newChapters = state.chapters.filter(c => c.id !== chapterId);
          let newActiveId = state.activeChapterId;
          
          if (state.activeChapterId === chapterId) {
              newActiveId = newChapters.length > 0 ? newChapters[0].id : null;
          }
          
          return { chapters: newChapters, activeChapterId: newActiveId };
      });
  },

  getActiveChapter: () => {
      const { chapters, activeChapterId } = get();
      return chapters.find(c => c.id === activeChapterId);
  }
  };
});
