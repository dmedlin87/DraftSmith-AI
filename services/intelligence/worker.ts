/**
 * Intelligence Web Worker
 * 
 * Offloads heavy intelligence processing to a background thread.
 * Keeps the main UI thread responsive during full manuscript analysis.
 */

// Note: This file runs in a Web Worker context
const ctx: Worker = self as unknown as Worker;

// Import functions - these will be bundled into the worker
import { parseStructure } from './structuralParser';
import { extractEntities } from './entityExtractor';
import { buildTimeline } from './timelineTracker';
import { analyzeStyle } from './styleAnalyzer';
import { buildHeatmap } from './heatmapBuilder';
import { createDelta, createEmptyDelta } from './deltaTracker';
import { buildHUD } from './contextBuilder';
import { ManuscriptIntelligence, ManuscriptDelta } from '../../types/intelligence';

// ─────────────────────────────────────────────────────────────────────────────
// MESSAGE TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type WorkerMessageType = 
  | 'PROCESS_FULL'
  | 'PROCESS_STRUCTURAL'
  | 'PROCESS_ENTITIES'
  | 'PROCESS_STYLE'
  | 'CANCEL';

export interface WorkerRequest {
  type: WorkerMessageType;
  id: string;  // Request ID for correlation
  payload: {
    text: string;
    chapterId: string;
    previousText?: string;
    previousIntelligence?: ManuscriptIntelligence;
    cursorOffset?: number;
  };
}

export type WorkerResponseType = 
  | 'RESULT'
  | 'PARTIAL'
  | 'ERROR'
  | 'PROGRESS';

export interface WorkerResponse {
  type: WorkerResponseType;
  id: string;
  payload?: ManuscriptIntelligence | Partial<ManuscriptIntelligence>;
  error?: string;
  progress?: {
    stage: string;
    percent: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PROCESSING FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

const sendProgress = (id: string, stage: string, percent: number) => {
  const response: WorkerResponse = {
    type: 'PROGRESS',
    id,
    progress: { stage, percent },
  };
  ctx.postMessage(response);
};

const processFullManuscript = (
  text: string,
  chapterId: string,
  previousText?: string,
  previousIntelligence?: ManuscriptIntelligence,
  cursorOffset: number = 0,
  requestId: string = ''
): ManuscriptIntelligence => {
  // 1. Structural parsing (20%)
  sendProgress(requestId, 'Parsing structure', 10);
  const structural = parseStructure(text);
  sendProgress(requestId, 'Structure complete', 20);
  
  // 2. Entity extraction (40%)
  sendProgress(requestId, 'Extracting entities', 30);
  const entities = extractEntities(
    text,
    structural.paragraphs,
    structural.dialogueMap,
    chapterId
  );
  sendProgress(requestId, 'Entities complete', 40);
  
  // 3. Timeline building (55%)
  sendProgress(requestId, 'Building timeline', 50);
  const timeline = buildTimeline(text, structural.scenes, chapterId);
  sendProgress(requestId, 'Timeline complete', 55);
  
  // 4. Style analysis (70%)
  sendProgress(requestId, 'Analyzing style', 60);
  const style = analyzeStyle(text);
  sendProgress(requestId, 'Style complete', 70);
  
  // 5. Heatmap building (85%)
  sendProgress(requestId, 'Building heatmap', 80);
  const heatmap = buildHeatmap(text, structural, entities, timeline, style);
  sendProgress(requestId, 'Heatmap complete', 85);
  
  // 6. Delta tracking (90%)
  sendProgress(requestId, 'Tracking changes', 88);
  const delta: ManuscriptDelta = previousText && previousIntelligence
    ? createDelta(previousText, text, previousIntelligence.entities, previousIntelligence.timeline)
    : createEmptyDelta(text);
  sendProgress(requestId, 'Changes tracked', 90);
  
  // 7. Build HUD (100%)
  sendProgress(requestId, 'Building HUD', 95);
  const intelligence: ManuscriptIntelligence = {
    chapterId,
    structural,
    entities,
    timeline,
    style,
    heatmap,
    delta,
    hud: null as any, // Temporary
  };
  
  const hud = buildHUD(intelligence, cursorOffset);
  intelligence.hud = hud;
  
  sendProgress(requestId, 'Complete', 100);
  
  return intelligence;
};

// ─────────────────────────────────────────────────────────────────────────────
// MESSAGE HANDLER
// ─────────────────────────────────────────────────────────────────────────────

let currentRequestId: string | null = null;

ctx.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { type, id, payload } = event.data;
  
  // Handle cancellation
  if (type === 'CANCEL') {
    currentRequestId = null;
    return;
  }
  
  currentRequestId = id;
  
  try {
    switch (type) {
      case 'PROCESS_FULL': {
        const result = processFullManuscript(
          payload.text,
          payload.chapterId,
          payload.previousText,
          payload.previousIntelligence,
          payload.cursorOffset,
          id
        );
        
        // Only send result if not cancelled
        if (currentRequestId === id) {
          const response: WorkerResponse = {
            type: 'RESULT',
            id,
            payload: result,
          };
          ctx.postMessage(response);
        }
        break;
      }
      
      case 'PROCESS_STRUCTURAL': {
        const structural = parseStructure(payload.text);
        
        if (currentRequestId === id) {
          const response: WorkerResponse = {
            type: 'PARTIAL',
            id,
            payload: { structural } as Partial<ManuscriptIntelligence>,
          };
          ctx.postMessage(response);
        }
        break;
      }
      
      case 'PROCESS_ENTITIES': {
        // Requires structural data - parse first
        const structural = parseStructure(payload.text);
        const entities = extractEntities(
          payload.text,
          structural.paragraphs,
          structural.dialogueMap,
          payload.chapterId
        );
        
        if (currentRequestId === id) {
          const response: WorkerResponse = {
            type: 'PARTIAL',
            id,
            payload: { entities } as Partial<ManuscriptIntelligence>,
          };
          ctx.postMessage(response);
        }
        break;
      }
      
      case 'PROCESS_STYLE': {
        const style = analyzeStyle(payload.text);
        
        if (currentRequestId === id) {
          const response: WorkerResponse = {
            type: 'PARTIAL',
            id,
            payload: { style } as Partial<ManuscriptIntelligence>,
          };
          ctx.postMessage(response);
        }
        break;
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const response: WorkerResponse = {
      type: 'ERROR',
      id,
      error: errorMessage,
    };
    ctx.postMessage(response);
  }
  
  currentRequestId = null;
};

// Signal that worker is ready
ctx.postMessage({ type: 'READY', id: 'init' });
