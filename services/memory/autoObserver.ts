/**
 * Auto-Observation Service
 * 
 * Automatically creates memory notes from analysis results.
 * Bridges the intelligence/analysis layer with the memory system.
 * 
 * Key responsibilities:
 * - Extract significant insights from analysis results
 * - Create memory notes with appropriate tags and importance
 * - Avoid duplicate observations
 * - Track character development and plot issues
 */

import { AnalysisResult, CharacterProfile } from '@/types';
import { ManuscriptIntelligence } from '@/types/intelligence';
import { createMemory, getMemories, searchMemoriesByTags } from './index';
import { MemoryNote, MemoryNoteType } from './types';

// ──────────────────────────────────────────────────────────────────────────────
// TYPES
// ──────────────────────────────────────────────────────────────────────────────

export interface ObservationResult {
  created: MemoryNote[];
  skipped: number;
  errors: string[];
}

export interface AutoObserverOptions {
  /** Project ID for scoping observations */
  projectId: string;
  /** Minimum importance threshold for creating memories (0-1) */
  minImportance?: number;
  /** Maximum observations to create per analysis */
  maxObservations?: number;
  /** Whether to check for duplicates before creating */
  deduplicateEnabled?: boolean;
}

// ──────────────────────────────────────────────────────────────────────────────
// DUPLICATE DETECTION
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Check if a similar observation already exists
 */
async function isDuplicate(
  projectId: string,
  text: string,
  tags: string[]
): Promise<boolean> {
  // Check for exact text match
  const existing = await getMemories({
    scope: 'project',
    projectId,
    limit: 50,
  });
  
  // Simple text similarity check (could be improved with embeddings)
  const textLower = text.toLowerCase();
  for (const note of existing) {
    const noteLower = note.text.toLowerCase();
    
    // Check for high text overlap (simple heuristic)
    if (textLower === noteLower) return true;
    if (textLower.includes(noteLower) || noteLower.includes(textLower)) return true;
    
    // Check if same entity + similar content
    const noteTagSet = new Set(note.topicTags);
    const hasOverlappingTags = tags.some(t => noteTagSet.has(t));
    
    if (hasOverlappingTags) {
      // More strict text similarity for same entity
      const words = new Set(textLower.split(/\s+/));
      const noteWords = noteLower.split(/\s+/);
      const overlap = noteWords.filter(w => words.has(w)).length / noteWords.length;
      
      if (overlap > 0.6) return true;
    }
  }
  
  return false;
}

// ──────────────────────────────────────────────────────────────────────────────
// CHARACTER OBSERVATIONS
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Create observations from character analysis
 */
async function observeCharacters(
  characters: CharacterProfile[],
  options: AutoObserverOptions
): Promise<ObservationResult> {
  const { projectId, minImportance = 0.4, deduplicateEnabled = true } = options;
  const result: ObservationResult = { created: [], skipped: 0, errors: [] };
  
  for (const char of characters) {
    const charTag = `character:${char.name.toLowerCase()}`;
    
    // 1. Character arc observations
    if (char.arc && char.arc.length > 20) {
      const arcText = `${char.name}'s arc: ${char.arc}`;
      const tags = [charTag, 'arc'];
      
      if (deduplicateEnabled && await isDuplicate(projectId, arcText, tags)) {
        result.skipped++;
      } else {
        try {
          const note = await createMemory({
            text: arcText,
            type: 'observation',
            scope: 'project',
            projectId,
            topicTags: tags,
            importance: 0.7,
          });
          result.created.push(note);
        } catch (e) {
          result.errors.push(`Failed to create arc observation for ${char.name}: ${e}`);
        }
      }
    }
    
    // 2. Relationship observations
    if (char.relationships && char.relationships.length > 0) {
      for (const rel of char.relationships.slice(0, 3)) {
        const relName = typeof rel === 'string' ? rel : rel.name;
        const relType = typeof rel === 'string' ? '' : ` (${rel.type})`;
        const relText = `${char.name} has relationship with ${relName}${relType}`;
        const tags = [charTag, `character:${relName.toLowerCase()}`, 'relationship'];
        
        if (deduplicateEnabled && await isDuplicate(projectId, relText, tags)) {
          result.skipped++;
        } else {
          try {
            const note = await createMemory({
              text: relText,
              type: 'fact',
              scope: 'project',
              projectId,
              topicTags: tags,
              importance: 0.5,
            });
            result.created.push(note);
          } catch (e) {
            result.errors.push(`Failed to create relationship observation: ${e}`);
          }
        }
      }
    }
    
    // 3. Inconsistency observations (high importance)
    if (char.inconsistencies && char.inconsistencies.length > 0) {
      for (const issue of char.inconsistencies) {
        const issueText = `Inconsistency in ${char.name}: ${issue.issue}`;
        const tags = [charTag, 'inconsistency', 'issue'];
        
        if (deduplicateEnabled && await isDuplicate(projectId, issueText, tags)) {
          result.skipped++;
        } else {
          try {
            const note = await createMemory({
              text: issueText,
              type: 'issue',
              scope: 'project',
              projectId,
              topicTags: tags,
              importance: 0.9,
            });
            result.created.push(note);
          } catch (e) {
            result.errors.push(`Failed to create inconsistency observation: ${e}`);
          }
        }
      }
    }
    
    // 4. Development suggestions
    if (char.developmentSuggestion && char.developmentSuggestion.length > 20) {
      const devText = `Suggestion for ${char.name}: ${char.developmentSuggestion}`;
      const tags = [charTag, 'development', 'suggestion'];
      
      if (deduplicateEnabled && await isDuplicate(projectId, devText, tags)) {
        result.skipped++;
      } else {
        try {
          const note = await createMemory({
            text: devText,
            type: 'plan',
            scope: 'project',
            projectId,
            topicTags: tags,
            importance: 0.6,
          });
          result.created.push(note);
        } catch (e) {
          result.errors.push(`Failed to create development suggestion: ${e}`);
        }
      }
    }
  }
  
  return result;
}

// ──────────────────────────────────────────────────────────────────────────────
// PLOT OBSERVATIONS
// ──────────────────────────────────────────────────────────────────────────────

interface PlotIssue {
  issue: string;
  location?: string;
  suggestion?: string;
  quote?: string;
}

/**
 * Create observations from plot analysis
 */
async function observePlotIssues(
  plotIssues: PlotIssue[],
  options: AutoObserverOptions
): Promise<ObservationResult> {
  const { projectId, deduplicateEnabled = true } = options;
  const result: ObservationResult = { created: [], skipped: 0, errors: [] };
  
  for (const issue of plotIssues) {
    const issueText = issue.suggestion 
      ? `Plot issue: ${issue.issue}. Suggestion: ${issue.suggestion}`
      : `Plot issue: ${issue.issue}`;
    
    const tags = ['plot', 'issue'];
    if (issue.location) tags.push(`location:${issue.location.toLowerCase()}`);
    
    if (deduplicateEnabled && await isDuplicate(projectId, issueText, tags)) {
      result.skipped++;
    } else {
      try {
        const note = await createMemory({
          text: issueText,
          type: 'issue',
          scope: 'project',
          projectId,
          topicTags: tags,
          importance: 0.8,
        });
        result.created.push(note);
      } catch (e) {
        result.errors.push(`Failed to create plot issue observation: ${e}`);
      }
    }
  }
  
  return result;
}

// ──────────────────────────────────────────────────────────────────────────────
// PACING OBSERVATIONS
// ──────────────────────────────────────────────────────────────────────────────

interface PacingAnalysis {
  pacingScore?: number;
  issues?: Array<{ description: string; quote?: string }>;
}

interface PacingData {
  score: number;
  analysis: string;
  slowSections: Array<{ description: string; quote?: string }> | string[];
  fastSections: Array<{ description: string; quote?: string }> | string[];
}

/**
 * Create observations from pacing analysis
 */
async function observePacingFromAnalysis(
  pacing: PacingData,
  options: AutoObserverOptions
): Promise<ObservationResult> {
  const { projectId, deduplicateEnabled = true } = options;
  const result: ObservationResult = { created: [], skipped: 0, errors: [] };
  
  // Process slow sections
  const slowSections = pacing.slowSections || [];
  for (const section of slowSections.slice(0, 3)) {
    const description = typeof section === 'string' ? section : section.description;
    const issueText = `Pacing (slow): ${description}`;
    const tags = ['pacing', 'slow'];
    
    if (deduplicateEnabled && await isDuplicate(projectId, issueText, tags)) {
      result.skipped++;
    } else {
      try {
        const note = await createMemory({
          text: issueText,
          type: 'issue',
          scope: 'project',
          projectId,
          topicTags: tags,
          importance: 0.6,
        });
        result.created.push(note);
      } catch (e) {
        result.errors.push(`Failed to create pacing observation: ${e}`);
      }
    }
  }
  
  // Process fast sections
  const fastSections = pacing.fastSections || [];
  for (const section of fastSections.slice(0, 3)) {
    const description = typeof section === 'string' ? section : section.description;
    const issueText = `Pacing (rushed): ${description}`;
    const tags = ['pacing', 'fast'];
    
    if (deduplicateEnabled && await isDuplicate(projectId, issueText, tags)) {
      result.skipped++;
    } else {
      try {
        const note = await createMemory({
          text: issueText,
          type: 'observation',
          scope: 'project',
          projectId,
          topicTags: tags,
          importance: 0.5,
        });
        result.created.push(note);
      } catch (e) {
        result.errors.push(`Failed to create pacing observation: ${e}`);
      }
    }
  }
  
  return result;
}

// ──────────────────────────────────────────────────────────────────────────────
// MAIN AUTO-OBSERVER
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Process analysis results and automatically create memory observations
 */
export async function observeAnalysisResults(
  analysis: AnalysisResult,
  options: AutoObserverOptions
): Promise<ObservationResult> {
  const { maxObservations = 20 } = options;
  const combined: ObservationResult = { created: [], skipped: 0, errors: [] };
  
  // 1. Character observations
  if (analysis.characters && analysis.characters.length > 0) {
    const charResult = await observeCharacters(analysis.characters, options);
    combined.created.push(...charResult.created);
    combined.skipped += charResult.skipped;
    combined.errors.push(...charResult.errors);
  }
  
  // 2. Plot issue observations
  if (analysis.plotIssues && analysis.plotIssues.length > 0) {
    const plotResult = await observePlotIssues(analysis.plotIssues, options);
    combined.created.push(...plotResult.created);
    combined.skipped += plotResult.skipped;
    combined.errors.push(...plotResult.errors);
  }
  
  // 3. Pacing observations (from slow/fast sections)
  if (analysis.pacing) {
    const pacingResult = await observePacingFromAnalysis(analysis.pacing, options);
    combined.created.push(...pacingResult.created);
    combined.skipped += pacingResult.skipped;
    combined.errors.push(...pacingResult.errors);
  }
  
  // Limit total observations
  if (combined.created.length > maxObservations) {
    // Keep highest importance
    combined.created.sort((a, b) => b.importance - a.importance);
    combined.created = combined.created.slice(0, maxObservations);
  }
  
  console.log(
    `[AutoObserver] Created ${combined.created.length} observations, ` +
    `skipped ${combined.skipped} duplicates, ` +
    `${combined.errors.length} errors`
  );
  
  return combined;
}

/**
 * Process intelligence layer results for additional insights
 */
export async function observeIntelligenceResults(
  intelligence: ManuscriptIntelligence,
  options: AutoObserverOptions
): Promise<ObservationResult> {
  const { projectId, deduplicateEnabled = true } = options;
  const result: ObservationResult = { created: [], skipped: 0, errors: [] };
  
  // 1. Extract entity relationships from intelligence
  if (intelligence.entities?.edges && intelligence.entities?.nodes) {
    for (const rel of intelligence.entities.edges.slice(0, 5)) {
      const source = intelligence.entities.nodes.find(c => c.id === rel.source);
      const target = intelligence.entities.nodes.find(c => c.id === rel.target);
      
      if (source && target) {
        const relText = `${source.name} and ${target.name} have ${rel.type} relationship (${rel.coOccurrences} interactions)`;
        const tags = [
          `character:${source.name.toLowerCase()}`,
          `character:${target.name.toLowerCase()}`,
          'relationship',
        ];
        
        if (deduplicateEnabled && await isDuplicate(projectId, relText, tags)) {
          result.skipped++;
        } else {
          try {
            const note = await createMemory({
              text: relText,
              type: 'fact',
              scope: 'project',
              projectId,
              topicTags: tags,
              importance: 0.5,
            });
            result.created.push(note);
          } catch (e) {
            result.errors.push(`Failed to create relationship observation: ${e}`);
          }
        }
      }
    }
  }
  
  // 2. Extract open plot threads (unresolved promises)
  if (intelligence.timeline?.promises) {
    const unresolved = intelligence.timeline.promises.filter(p => !p.resolved);
    for (const promise of unresolved.slice(0, 5)) {
      const promiseText = `Open plot thread (${promise.type}): ${promise.description}`;
      const tags = ['plot-thread', 'open', promise.type];
      
      if (deduplicateEnabled && await isDuplicate(projectId, promiseText, tags)) {
        result.skipped++;
      } else {
        try {
          const note = await createMemory({
            text: promiseText,
            type: 'observation',
            scope: 'project',
            projectId,
            topicTags: tags,
            importance: 0.7,
          });
          result.created.push(note);
        } catch (e) {
          result.errors.push(`Failed to create plot thread observation: ${e}`);
        }
      }
    }
  }
  
  return result;
}

/**
 * Convenience function to observe both analysis and intelligence results
 */
export async function observeAll(
  analysis: AnalysisResult | null,
  intelligence: ManuscriptIntelligence | null,
  options: AutoObserverOptions
): Promise<ObservationResult> {
  const combined: ObservationResult = { created: [], skipped: 0, errors: [] };
  
  if (analysis) {
    const analysisResult = await observeAnalysisResults(analysis, options);
    combined.created.push(...analysisResult.created);
    combined.skipped += analysisResult.skipped;
    combined.errors.push(...analysisResult.errors);
  }
  
  if (intelligence) {
    const intelligenceResult = await observeIntelligenceResults(intelligence, options);
    combined.created.push(...intelligenceResult.created);
    combined.skipped += intelligenceResult.skipped;
    combined.errors.push(...intelligenceResult.errors);
  }
  
  return combined;
}
