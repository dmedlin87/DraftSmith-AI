/**
 * App Brain Context Builder
 * 
 * Generates context strings for AI consumption from unified app state.
 * Provides multiple formats for different use cases (full, compressed, focused).
 */

import { AppBrainState, AppBrainContext, AgentContextOptions } from './types';
import { eventBus } from './eventBus';
import {
  getMemoriesForContext,
  getActiveGoals,
  formatMemoriesForPrompt,
  formatGoalsForPrompt,
} from '../memory';
import { getCommandHistory } from '../commands/history';

/**
 * Build full context string for agent system prompt
 */
export const buildAgentContext = (
  state: AppBrainState,
  options?: AgentContextOptions,
): string => {
  const { manuscript, intelligence, analysis, lore, ui, session } = state;
  let ctx = '';

  // ─────────────────────────────────────────────────────────────────────────
  // MANUSCRIPT STATE
  // ─────────────────────────────────────────────────────────────────────────
  ctx += `[MANUSCRIPT STATE]\n`;
  ctx += `Project: ${manuscript.projectTitle}\n`;
  ctx += `Chapters: ${manuscript.chapters.length}\n`;
  
  const activeChapter = manuscript.chapters.find(c => c.id === manuscript.activeChapterId);
  if (activeChapter) {
    ctx += `Active Chapter: "${activeChapter.title}" (${manuscript.currentText.length} chars)\n`;
  }
  
  if (manuscript.setting) {
    ctx += `Setting: ${manuscript.setting.timePeriod}, ${manuscript.setting.location}\n`;
  }
  
  if (manuscript.branches.length > 0) {
    ctx += `Branches: ${manuscript.branches.length}${manuscript.activeBranchId ? ' (on branch)' : ' (on main)'}\n`;
  }
  ctx += '\n';

  // ─────────────────────────────────────────────────────────────────────────
  // UI STATE (What user is doing right now)
  // ─────────────────────────────────────────────────────────────────────────
  ctx += `[CURRENT USER STATE]\n`;
  ctx += `Cursor Position: ${ui.cursor.position}`;
  if (ui.cursor.scene) ctx += ` (${ui.cursor.scene} scene)`;
  ctx += '\n';
  
  if (ui.selection) {
    const previewText = ui.selection.text.length > 100 
      ? ui.selection.text.slice(0, 100) + '...' 
      : ui.selection.text;
    ctx += `Selection: "${previewText}" [${ui.selection.start}-${ui.selection.end}]\n`;
  } else {
    ctx += `Selection: None\n`;
  }
  
  ctx += `Active Panel: ${ui.activePanel}\n`;
  ctx += `View Mode: ${ui.activeView}${ui.isZenMode ? ' (Zen Mode)' : ''}\n`;
  ctx += '\n';

  // ─────────────────────────────────────────────────────────────────────────
  // INTELLIGENCE HUD (if available)
  // ─────────────────────────────────────────────────────────────────────────
  if (intelligence.hud) {
    const hud = intelligence.hud;
    
    ctx += `[INTELLIGENCE HUD]\n`;
    
    // Current scene context
    if (hud.situational.currentScene) {
      const scene = hud.situational.currentScene;
      ctx += `Scene: ${scene.type}`;
      if (scene.pov) ctx += `, POV: ${scene.pov}`;
      if (scene.location) ctx += `, Location: ${scene.location}`;
      ctx += `\n`;
    }
    
    ctx += `Tension: ${hud.situational.tensionLevel.toUpperCase()}\n`;
    ctx += `Pacing: ${hud.situational.pacing}\n`;
    ctx += `Progress: Scene ${hud.situational.narrativePosition.sceneIndex} of ${hud.situational.narrativePosition.totalScenes} (${hud.situational.narrativePosition.percentComplete}%)\n`;
    
    // Active entities
    if (hud.context.activeEntities.length > 0) {
      ctx += `\nActive Characters:\n`;
      for (const entity of hud.context.activeEntities.slice(0, 5)) {
        ctx += `• ${entity.name} (${entity.type}) - ${entity.mentionCount} mentions\n`;
      }
    }
    
    // Active relationships
    if (hud.context.activeRelationships.length > 0) {
      ctx += `\nKey Relationships:\n`;
      for (const rel of hud.context.activeRelationships.slice(0, 3)) {
        const source = hud.context.activeEntities.find(e => e.id === rel.source);
        const target = hud.context.activeEntities.find(e => e.id === rel.target);
        if (source && target) {
          ctx += `• ${source.name} ←${rel.type}→ ${target.name}\n`;
        }
      }
    }
    
    // Open plot threads
    if (hud.context.openPromises.length > 0) {
      ctx += `\nOpen Plot Threads:\n`;
      for (const promise of hud.context.openPromises.slice(0, 3)) {
        ctx += `⚡ [${promise.type.toUpperCase()}] ${promise.description.slice(0, 60)}...\n`;
      }
    }
    
    // Style alerts
    if (hud.styleAlerts.length > 0) {
      ctx += `\nStyle Alerts:\n`;
      for (const alert of hud.styleAlerts) {
        ctx += `⚠️ ${alert}\n`;
      }
    }
    
    // Priority issues
    if (hud.prioritizedIssues.length > 0) {
      ctx += `\nPriority Issues:\n`;
      for (const issue of hud.prioritizedIssues) {
        const icon = issue.severity > 0.7 ? '🔴' : issue.severity > 0.4 ? '🟡' : '🟢';
        ctx += `${icon} ${issue.description}\n`;
      }
    }
    
    ctx += '\n';
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ANALYSIS RESULTS
  // ─────────────────────────────────────────────────────────────────────────
  if (analysis.result) {
    const result = analysis.result;
    
    ctx += `[ANALYSIS INSIGHTS]\n`;
    
    if (result.summary) {
      ctx += `Summary: ${result.summary.slice(0, 200)}...\n`;
    }
    
    if (result.strengths.length > 0) {
      ctx += `Strengths: ${result.strengths.slice(0, 3).join(', ')}\n`;
    }
    
    if (result.weaknesses.length > 0) {
      ctx += `Weaknesses: ${result.weaknesses.slice(0, 3).join(', ')}\n`;
    }
    
    if (result.plotIssues.length > 0) {
      ctx += `\nPlot Issues:\n`;
      for (const issue of result.plotIssues.slice(0, 3)) {
        ctx += `• ${issue.issue} (Fix: ${issue.suggestion?.slice(0, 50)}...)\n`;
      }
    }
    
    ctx += '\n';
  }
  
  // Inline comments status
  if (analysis.inlineComments.length > 0) {
    const activeComments = analysis.inlineComments.filter(c => !c.dismissed);
    ctx += `Active Inline Comments: ${activeComments.length}\n\n`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LORE CONTEXT
  // ─────────────────────────────────────────────────────────────────────────
  if (lore.characters.length > 0 || lore.worldRules.length > 0) {
    ctx += `[LORE BIBLE]\n`;
    
    if (lore.characters.length > 0) {
      ctx += `Characters (${lore.characters.length}):\n`;
      for (const char of lore.characters.slice(0, 5)) {
        ctx += `• ${char.name}: ${char.bio?.slice(0, 60) || 'No bio'}...\n`;
        if (char.inconsistencies && char.inconsistencies.length > 0) {
          ctx += `  ⚠️ Has ${char.inconsistencies.length} inconsistencies\n`;
        }
      }
    }
    
    if (lore.worldRules.length > 0) {
      ctx += `\nWorld Rules (${lore.worldRules.length}):\n`;
      for (const rule of lore.worldRules.slice(0, 3)) {
        ctx += `• ${rule.slice(0, 80)}...\n`;
      }
    }
    
    ctx += '\n';
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RECENT ACTIVITY
  // ─────────────────────────────────────────────────────────────────────────
  const recentEvents = eventBus.formatRecentEventsForAI(5);
  if (recentEvents) {
    ctx += recentEvents;
    ctx += '\n';
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RECENT AGENT ACTIONS (from Command History)
  // ─────────────────────────────────────────────────────────────────────────
  const commandHistory = getCommandHistory().formatForPrompt(5);
  if (commandHistory) {
    ctx += commandHistory;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DEEP ANALYSIS: VOICE FINGERPRINTS (optional)
  // ─────────────────────────────────────────────────────────────────────────
  if (options?.deepAnalysis && intelligence.full?.voice) {
    const voice = intelligence.full.voice;
    const profiles = Object.values(voice.profiles);

    if (profiles.length > 0) {
      ctx += `[DEEP ANALYSIS: VOICE FINGERPRINTS]\n`;
      for (const profile of profiles.slice(0, 5)) {
        const latinatePct = Math.round(profile.metrics.latinateRatio * 100);
        const contractionPct = Math.round(profile.metrics.contractionRatio * 100);
        ctx += `• ${profile.speakerName}: ${profile.impression} (${latinatePct}% Formal, ${contractionPct}% Casual).\n`;
      }
      ctx += 'Use these metrics to ensure character voice consistency.\n\n';
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // AGENT MEMORY (async section - placeholder, populated separately)
  // ─────────────────────────────────────────────────────────────────────────
  // Memory is injected via buildAgentContextWithMemory() for async retrieval
  ctx += `[AGENT MEMORY]\n`;
  ctx += `(Memory context loaded separately - see buildAgentContextWithMemory)\n\n`;

  // ─────────────────────────────────────────────────────────────────────────
  // SESSION STATE
  // ─────────────────────────────────────────────────────────────────────────
  if (session.lastAgentAction) {
    ctx += `[LAST AGENT ACTION]\n`;
    ctx += `${session.lastAgentAction.type}: ${session.lastAgentAction.description}\n`;
    ctx += `Result: ${session.lastAgentAction.success ? 'Success' : 'Failed'}\n\n`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // QUICK STATS
  // ─────────────────────────────────────────────────────────────────────────
  if (intelligence.hud) {
    const stats = intelligence.hud.stats;
    ctx += `[STATS]\n`;
    ctx += `Words: ${stats.wordCount.toLocaleString()} | `;
    ctx += `Reading: ~${stats.readingTime} min | `;
    ctx += `Dialogue: ${stats.dialoguePercent}% | `;
    ctx += `Avg Sentence: ${stats.avgSentenceLength} words\n`;
  }

  return ctx;
};

/**
 * Build full context string with memory (async)
 * This is the primary context builder for agent sessions.
 */
export const buildAgentContextWithMemory = async (
  state: AppBrainState,
  projectId: string | null
): Promise<string> => {
  // Start with base context
  let ctx = buildAgentContext(state);

  // Replace the placeholder memory section with actual memory
  if (projectId) {
    try {
      const [{ author, project }, goals] = await Promise.all([
        getMemoriesForContext(projectId, { limit: 25 }),
        getActiveGoals(projectId),
      ]);

      // Build memory section
      let memorySection = '[AGENT MEMORY]\n';
      
      const formattedMemories = formatMemoriesForPrompt({ author, project }, { maxLength: 1500 });
      if (formattedMemories) {
        memorySection += formattedMemories + '\n';
      } else {
        memorySection += 'No memories stored yet.\n';
      }

      const formattedGoals = formatGoalsForPrompt(goals);
      if (formattedGoals) {
        memorySection += '\n' + formattedGoals + '\n';
      }

      memorySection += '\n';

      // Replace placeholder with actual memory content
      ctx = ctx.replace(
        /\[AGENT MEMORY\]\n\(Memory context loaded separately - see buildAgentContextWithMemory\)\n\n/,
        memorySection
      );
    } catch (error) {
      console.warn('Failed to load memory context:', error);
      // Leave placeholder if memory fails
    }
  }

  return ctx;
};

/**
 * Build compressed context for token efficiency (voice mode, etc.)
 */
export const buildCompressedContext = (state: AppBrainState): string => {
  const { manuscript, intelligence, ui } = state;
  let ctx = '';

  // Minimal manuscript info
  const activeChapter = manuscript.chapters.find(c => c.id === manuscript.activeChapterId);
  ctx += `ch:${activeChapter?.title || 'None'}|`;
  ctx += `pos:${ui.cursor.position}|`;
  
  if (ui.selection) {
    ctx += `sel:${ui.selection.text.slice(0, 30)}...|`;
  }

  // Minimal intelligence
  if (intelligence.hud) {
    const hud = intelligence.hud;
    if (hud.situational.currentScene) {
      ctx += `scene:${hud.situational.currentScene.type}|`;
    }
    ctx += `tension:${hud.situational.tensionLevel}|`;
    
    const topEntities = hud.context.activeEntities.slice(0, 3).map(e => e.name);
    if (topEntities.length > 0) {
      ctx += `chars:${topEntities.join(',')}|`;
    }
    
    ctx += `words:${hud.stats.wordCount}`;
  }

  return ctx;
};

/**
 * Build navigation-focused context (for search/navigate tools)
 */
export const buildNavigationContext = (state: AppBrainState): string => {
  const { manuscript, intelligence } = state;
  let ctx = '[NAVIGATION CONTEXT]\n\n';

  // Chapter list
  ctx += 'Chapters:\n';
  for (const chapter of manuscript.chapters) {
    const isActive = chapter.id === manuscript.activeChapterId;
    ctx += `${isActive ? '→ ' : '  '}${chapter.order + 1}. "${chapter.title}"\n`;
  }
  ctx += '\n';

  // Entity directory (for character search)
  if (intelligence.entities) {
    const characters = intelligence.entities.nodes.filter(n => n.type === 'character');
    if (characters.length > 0) {
      ctx += 'Characters (searchable):\n';
      for (const char of characters.slice(0, 10)) {
        ctx += `• ${char.name}`;
        if (char.aliases.length > 0) {
          ctx += ` (aliases: ${char.aliases.join(', ')})`;
        }
        ctx += ` - ${char.mentionCount} mentions\n`;
      }
      ctx += '\n';
    }
  }

  // Scene types in current chapter
  if (intelligence.full?.structural) {
    const scenes = intelligence.full.structural.scenes;
    const sceneTypes = [...new Set(scenes.map(s => s.type))];
    ctx += `Scene types in chapter: ${sceneTypes.join(', ')}\n`;
  }

  return ctx;
};

/**
 * Build editing-focused context (for edit tools)
 */
export const buildEditingContext = (state: AppBrainState): string => {
  const { manuscript, ui, intelligence } = state;
  let ctx = '[EDITING CONTEXT]\n\n';

  // Current text state
  ctx += `Current chapter: "${manuscript.chapters.find(c => c.id === manuscript.activeChapterId)?.title}"\n`;
  ctx += `Text length: ${manuscript.currentText.length} characters\n`;
  ctx += `Cursor at: ${ui.cursor.position}\n`;

  // Selection info
  if (ui.selection) {
    ctx += `\nSELECTED TEXT:\n"${ui.selection.text}"\n`;
    ctx += `[Position: ${ui.selection.start}-${ui.selection.end}]\n`;
  }

  // Style context for selection/cursor
  if (intelligence.hud) {
    ctx += `\nSTYLE CONTEXT:\n`;
    ctx += `Pacing: ${intelligence.hud.situational.pacing}\n`;
    ctx += `Tension: ${intelligence.hud.situational.tensionLevel}\n`;
    
    if (intelligence.hud.styleAlerts.length > 0) {
      ctx += `Alerts: ${intelligence.hud.styleAlerts.join('; ')}\n`;
    }
  }

  // Branching state
  if (manuscript.activeBranchId) {
    const branch = manuscript.branches.find(b => b.id === manuscript.activeBranchId);
    ctx += `\nOn branch: "${branch?.name || 'Unknown'}"\n`;
  }

  return ctx;
};

/**
 * Create context builder functions bound to current state
 */
export const createContextBuilder = (getState: () => AppBrainState): AppBrainContext => {
  return {
    getAgentContext: (options?: AgentContextOptions) => buildAgentContext(getState(), options),
    getAgentContextWithMemory: (projectId: string | null) => 
      buildAgentContextWithMemory(getState(), projectId),
    getCompressedContext: () => buildCompressedContext(getState()),
    getNavigationContext: () => buildNavigationContext(getState()),
    getEditingContext: () => buildEditingContext(getState()),
    getRecentEvents: (count?: number) => eventBus.getRecentEvents(count),
  };
};
