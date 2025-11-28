import { AnalysisResult } from '../types';

export interface Project {
  id: string;
  title: string;
  author: string;
  setting?: {
    timePeriod: string;
    location: string;
  };
  createdAt: number;
  updatedAt: number;
}

export interface Chapter {
  id: string;
  projectId: string;
  title: string;
  content: string;
  order: number;
  lastAnalysis?: AnalysisResult;
  updatedAt: number;
}

export interface AppState {
    activeProjectId: string | null;
    activeChapterId: string | null;
}