import { create } from 'zustand';
import { db } from '../services/db';
import { Project, Chapter } from '../types/schema';
import { AnalysisResult } from '../types';
import { ParsedChapter } from '../services/manuscriptParser';

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
  deleteChapter: (chapterId: string) => Promise<void>;
  
  getActiveChapter: () => Chapter | undefined;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
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
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await db.projects.add(newProject);

    // 2. Process Chapters (Parsing happens in UI/Wizard now)
    const chaptersToCreate: Chapter[] = chapters.map((pc, index) => ({
        id: crypto.randomUUID(),
        projectId,
        title: pc.title,
        content: pc.content,
        order: index,
        updatedAt: Date.now()
    }));

    await db.chapters.bulkAdd(chaptersToCreate);

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
      // Optimistic update
      set({ chapters: newChapters });

      // Update Order in DB
      const updates = newChapters.map((c, index) => ({
          ...c,
          order: index
      }));
      await db.chapters.bulkPut(updates);
  },

  updateChapterContent: async (chapterId, content) => {
      // Update local state immediately for responsiveness
      set(state => ({
          chapters: state.chapters.map(c => 
              c.id === chapterId ? { ...c, content, updatedAt: Date.now() } : c
          )
      }));

      // Persist to DB (debounce could be handled here or in UI, relying on fast IndexedDB for now)
      await db.chapters.update(chapterId, { content, updatedAt: Date.now() });
      
      const { currentProject } = get();
      if (currentProject) {
          await db.projects.update(currentProject.id, { updatedAt: Date.now() });
      }
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
}));