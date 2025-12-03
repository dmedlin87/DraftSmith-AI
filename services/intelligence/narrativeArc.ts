/**
 * Narrative Arc Analyzer
 * 
 * Analyzes story structure to identify narrative arc phases:
 * - Setup / Exposition
 * - Rising Action
 * - Climax
 * - Falling Action
 * - Resolution
 * 
 * Uses tension curves, event density, and structural markers.
 */

import { Scene, StructuralFingerprint } from '../../types/intelligence';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type ArcPhase = 
  | 'setup'
  | 'rising_action'
  | 'climax'
  | 'falling_action'
  | 'resolution';

export interface NarrativeArc {
  phase: ArcPhase;
  startOffset: number;
  endOffset: number;
  startScene: number;    // Scene index
  endScene: number;      // Scene index
  avgTension: number;
  sceneCount: number;
  keyMoments: string[];  // Descriptions of key events
}

export interface ArcAnalysis {
  arcs: NarrativeArc[];
  tensionCurve: number[];        // Tension at each scene
  climaxSceneIndex: number;      // Index of highest tension scene
  pacingScore: number;           // 0-1, how well paced is the arc
  structureType: StoryStructure;
  suggestions: string[];
}

export type StoryStructure = 
  | 'three_act'        // Traditional beginning/middle/end
  | 'hero_journey'     // Monomyth structure
  | 'in_medias_res'    // Starts in action
  | 'episodic'         // Series of events
  | 'frame_story'      // Story within story
  | 'nonlinear'        // Jumbled timeline
  | 'unknown';

// ─────────────────────────────────────────────────────────────────────────────
// TENSION ANALYSIS
// ─────────────────────────────────────────────────────────────────────────────

const buildTensionCurve = (scenes: Scene[]): number[] => {
  return scenes.map(s => s.tension);
};

const findLocalMaxima = (curve: number[]): number[] => {
  const maxima: number[] = [];
  
  for (let i = 1; i < curve.length - 1; i++) {
    if (curve[i] > curve[i - 1] && curve[i] > curve[i + 1]) {
      maxima.push(i);
    }
  }
  
  // Also check endpoints
  if (curve.length > 0 && curve[0] > curve[1]) {
    maxima.unshift(0);
  }
  if (curve.length > 1 && curve[curve.length - 1] > curve[curve.length - 2]) {
    maxima.push(curve.length - 1);
  }
  
  return maxima;
};

const findClimaxIndex = (tensionCurve: number[]): number => {
  if (tensionCurve.length === 0) return 0;
  
  let maxIndex = 0;
  let maxValue = tensionCurve[0];
  
  for (let i = 1; i < tensionCurve.length; i++) {
    if (tensionCurve[i] > maxValue) {
      maxValue = tensionCurve[i];
      maxIndex = i;
    }
  }
  
  return maxIndex;
};

// ─────────────────────────────────────────────────────────────────────────────
// ARC PHASE DETECTION
// ─────────────────────────────────────────────────────────────────────────────

const detectArcPhases = (
  scenes: Scene[],
  tensionCurve: number[],
  climaxIndex: number
): NarrativeArc[] => {
  const arcs: NarrativeArc[] = [];
  const totalScenes = scenes.length;
  
  if (totalScenes === 0) return arcs;
  if (totalScenes === 1) {
    return [{
      phase: 'setup',
      startOffset: scenes[0].startOffset,
      endOffset: scenes[0].endOffset,
      startScene: 0,
      endScene: 0,
      avgTension: scenes[0].tension,
      sceneCount: 1,
      keyMoments: [],
    }];
  }
  
  // Divide into phases based on climax position
  // Traditional structure: climax at ~75% through
  const climaxPosition = climaxIndex / totalScenes;
  
  // Setup: First ~20% of scenes (introduction)
  const setupEnd = Math.max(1, Math.floor(totalScenes * 0.2));
  
  // Rising action: From setup to just before climax
  const risingStart = setupEnd;
  const risingEnd = climaxIndex;
  
  // Climax: The peak scene(s)
  const climaxStart = climaxIndex;
  const climaxEnd = Math.min(climaxIndex + 1, totalScenes - 1);
  
  // Falling action: After climax
  const fallingStart = climaxEnd + 1;

  // Resolution: Reserve the final stretch (~15%) for resolution so we always
  // surface a closing phase when there are enough scenes.
  const resolutionStart = totalScenes > 1
    ? Math.min(totalScenes - 1, Math.max(fallingStart + 1, Math.floor(totalScenes * 0.85)))
    : totalScenes - 1;
  const fallingEnd = resolutionStart - 1;
  
  // Build arc objects
  const buildArc = (phase: ArcPhase, start: number, end: number): NarrativeArc | null => {
    if (start > end || start >= totalScenes) return null;
    
    const phaseScenes = scenes.slice(start, end + 1);
    const phaseTension = tensionCurve.slice(start, end + 1);
    
    return {
      phase,
      startOffset: scenes[start].startOffset,
      endOffset: scenes[Math.min(end, totalScenes - 1)].endOffset,
      startScene: start,
      endScene: Math.min(end, totalScenes - 1),
      avgTension: phaseTension.length > 0 
        ? phaseTension.reduce((a, b) => a + b, 0) / phaseTension.length 
        : 0,
      sceneCount: phaseScenes.length,
      keyMoments: [],
    };
  };
  
  // Add phases (only if they have content)
  const setupArc = buildArc('setup', 0, setupEnd - 1);
  if (setupArc && setupArc.sceneCount > 0) arcs.push(setupArc);
  
  if (risingStart < risingEnd) {
    const risingArc = buildArc('rising_action', risingStart, risingEnd - 1);
    if (risingArc && risingArc.sceneCount > 0) arcs.push(risingArc);
  }
  
  const climaxArc = buildArc('climax', climaxStart, climaxEnd);
  if (climaxArc) arcs.push(climaxArc);
  
  if (fallingStart <= fallingEnd) {
    const fallingArc = buildArc('falling_action', fallingStart, fallingEnd);
    if (fallingArc && fallingArc.sceneCount > 0) arcs.push(fallingArc);
  }
  
  if (resolutionStart < totalScenes) {
    const resolutionArc = buildArc('resolution', resolutionStart, totalScenes - 1);
    if (resolutionArc && resolutionArc.sceneCount > 0) arcs.push(resolutionArc);
  }
  
  return arcs;
};

// ─────────────────────────────────────────────────────────────────────────────
// STRUCTURE DETECTION
// ─────────────────────────────────────────────────────────────────────────────

const detectStoryStructure = (
  tensionCurve: number[],
  climaxIndex: number,
  totalScenes: number
): StoryStructure => {
  if (totalScenes < 3) return 'unknown';
  
  const climaxPosition = climaxIndex / totalScenes;
  const maxima = findLocalMaxima(tensionCurve);
  
  // Check for high tension start (in medias res)
  const startTension = tensionCurve[0];
  const avgTension = tensionCurve.reduce((a, b) => a + b, 0) / tensionCurve.length;
  
  if (startTension > avgTension * 1.3) {
    return 'in_medias_res';
  }
  
  // Check for multiple peaks (episodic)
  if (maxima.length >= 3) {
    const peakVariance = maxima.map(i => tensionCurve[i]);
    const peakDiff = Math.max(...peakVariance) - Math.min(...peakVariance);
    if (peakDiff < 0.2) {
      return 'episodic';
    }
  }
  
  // Check climax position for structure type
  if (climaxPosition >= 0.6 && climaxPosition <= 0.85) {
    return 'three_act';
  }
  
  // Hero's journey has climax later
  if (climaxPosition > 0.85) {
    return 'hero_journey';
  }
  
  return 'three_act'; // Default
};

// ─────────────────────────────────────────────────────────────────────────────
// PACING ANALYSIS
// ─────────────────────────────────────────────────────────────────────────────

const calculatePacingScore = (
  tensionCurve: number[],
  climaxIndex: number
): number => {
  if (tensionCurve.length < 3) return 0.5;

  let score = 0.5;

  const averageTension = tensionCurve.reduce((a, b) => a + b, 0) / tensionCurve.length;
  const variance = tensionCurve.reduce((sum, value) => sum + Math.pow(value - averageTension, 2), 0) / tensionCurve.length;
  
  // Good pacing has gradual rise to climax
  const preClimax = tensionCurve.slice(0, climaxIndex + 1);
  if (preClimax.length > 1) {
    let risingCount = 0;
    for (let i = 1; i < preClimax.length; i++) {
      if (preClimax[i] >= preClimax[i - 1]) risingCount++;
    }
    // Score for rising trend
    score += 0.2 * (risingCount / (preClimax.length - 1));
  }
  
  // Good pacing has some release after climax
  const postClimax = tensionCurve.slice(climaxIndex);
  if (postClimax.length > 1) {
    let fallingCount = 0;
    for (let i = 1; i < postClimax.length; i++) {
      if (postClimax[i] <= postClimax[i - 1]) fallingCount++;
    }
    score += 0.2 * (fallingCount / (postClimax.length - 1));
  }
  
  // Penalize if climax is too early or too late
  const climaxPosition = climaxIndex / tensionCurve.length;
  if (climaxPosition >= 0.5 && climaxPosition <= 0.85) {
    score += 0.1;
  }

  // Flat or low-variance curves indicate poor pacing
  if (variance < 0.005) {
    score -= 0.2;
  }

  return Math.min(1, Math.max(0, score));
};

// ─────────────────────────────────────────────────────────────────────────────
// SUGGESTIONS
// ─────────────────────────────────────────────────────────────────────────────

const generateSuggestions = (
  arcs: NarrativeArc[],
  tensionCurve: number[],
  climaxIndex: number,
  pacingScore: number
): string[] => {
  const suggestions: string[] = [];

  if (tensionCurve.length === 0) {
    return suggestions;
  }
  
  const totalScenes = tensionCurve.length;
  const climaxPosition = climaxIndex / totalScenes;
  
  // Check setup length
  const setupArc = arcs.find(a => a.phase === 'setup');
  if (setupArc && setupArc.sceneCount / totalScenes > 0.35) {
    suggestions.push('The setup/exposition phase is quite long. Consider getting into the main conflict sooner.');
  }
  
  // Check for missing resolution
  const resolutionArc = arcs.find(a => a.phase === 'resolution');
  if (!resolutionArc || resolutionArc.sceneCount < 1) {
    suggestions.push('The story may end abruptly. Consider adding resolution scenes to provide closure.');
  }
  
  // Check climax timing
  if (climaxPosition < 0.4) {
    suggestions.push('The climax occurs quite early. The story may feel front-loaded or anti-climactic.');
  } else if (climaxPosition > 0.85) {
    suggestions.push('The climax is very close to the end. Consider allowing more space for falling action.');
  }
  
  // Check for tension valleys
  const risingArc = arcs.find(a => a.phase === 'rising_action');
  if (risingArc) {
    const risingTension = tensionCurve.slice(risingArc.startScene, risingArc.endScene + 1);
    const avgRising = risingTension.reduce((a, b) => a + b, 0) / risingTension.length;
    if (avgRising < 0.4) {
      suggestions.push('Tension during rising action is low. Consider adding more conflict or stakes.');
    }
  }
  
  // Overall pacing
  if (pacingScore < 0.6) {
    suggestions.push('The overall pacing may feel uneven. Consider smoothing out tension transitions.');
  }
  
  return suggestions;
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────

export const analyzeNarrativeArc = (
  structural: StructuralFingerprint
): ArcAnalysis => {
  const { scenes } = structural;
  
  // Build tension curve
  const tensionCurve = buildTensionCurve(scenes);
  
  // Find climax
  const climaxIndex = findClimaxIndex(tensionCurve);
  
  // Detect arc phases
  const arcs = detectArcPhases(scenes, tensionCurve, climaxIndex);
  
  // Detect structure type
  const structureType = detectStoryStructure(tensionCurve, climaxIndex, scenes.length);
  
  // Calculate pacing score
  const pacingScore = calculatePacingScore(tensionCurve, climaxIndex);
  
  // Generate suggestions
  const suggestions = generateSuggestions(arcs, tensionCurve, climaxIndex, pacingScore);
  
  return {
    arcs,
    tensionCurve,
    climaxSceneIndex: climaxIndex,
    pacingScore,
    structureType,
    suggestions,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

export const getCurrentArcPhase = (
  analysis: ArcAnalysis,
  cursorOffset: number
): NarrativeArc | null => {
  for (const arc of analysis.arcs) {
    if (cursorOffset >= arc.startOffset && cursorOffset <= arc.endOffset) {
      return arc;
    }
  }
  return null;
};

export const getArcPhaseLabel = (phase: ArcPhase): string => {
  switch (phase) {
    case 'setup': return 'Setup / Exposition';
    case 'rising_action': return 'Rising Action';
    case 'climax': return 'Climax';
    case 'falling_action': return 'Falling Action';
    case 'resolution': return 'Resolution';
    default: return 'Unknown';
  }
};

export const getStructureDescription = (structure: StoryStructure): string => {
  switch (structure) {
    case 'three_act': return 'Classic three-act structure (Beginning, Middle, End)';
    case 'hero_journey': return "Hero's Journey / Monomyth structure";
    case 'in_medias_res': return 'In Medias Res (starts in the middle of action)';
    case 'episodic': return 'Episodic structure (series of events)';
    case 'frame_story': return 'Frame narrative (story within a story)';
    case 'nonlinear': return 'Non-linear / fragmented timeline';
    default: return 'Structure not clearly identifiable';
  }
};
