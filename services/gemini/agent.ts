import { Type, FunctionDeclaration, UsageMetadata } from "@google/genai";
import { AnalysisResult, CharacterProfile } from "../../types";
import { Lore } from "../../types/schema";
import { ModelConfig } from "../../config/models";
import { ai } from "./client";
import { REWRITE_SYSTEM_INSTRUCTION, CONTEXTUAL_HELP_SYSTEM_INSTRUCTION, AGENT_SYSTEM_INSTRUCTION } from "./prompts";
import { safeParseJson, validators } from "./resilientParser";
import { Persona, buildPersonaInstruction } from "../../types/personas";
import { CritiqueIntensity, DEFAULT_CRITIQUE_INTENSITY } from "../../types/critiqueSettings";
import { ExperienceLevel, AutonomyMode, DEFAULT_EXPERIENCE, DEFAULT_AUTONOMY } from "../../types/experienceSettings";
import { getIntensityModifier } from "./critiquePrompts";
import { getExperienceModifier, getAutonomyModifier } from "./experiencePrompts";
import { ManuscriptHUD } from "../../types/intelligence";

/**
 * Build a roleplay interview block for a character, preserving manuscript context.
 */
const buildInterviewInstruction = (
  baseInstruction: string,
  character: CharacterProfile
): string => {
  const voice = character.voiceTraits?.trim() || 'Consistent with bio';
  const relationships = (character.relationships || []).length
    ? character.relationships
        .map(rel => `- ${rel.name} (${rel.type})${rel.dynamic ? `: ${rel.dynamic}` : ''}`)
        .join('\n')
    : '- None noted.';
  const plotThreads = (character.plotThreads || []).length
    ? character.plotThreads.map(thread => `- ${thread}`).join('\n')
    : '- None noted.';

  const interviewBlock = `
[INTERVIEW MODE: ${character.name}]
You are ${character.name}. This is a roleplay interview. Do not break character.

YOUR IDENTITY:
Bio: ${character.bio || 'No biography provided.'}
Arc: ${character.arc || 'No arc provided.'}
Voice: ${voice}

CONTEXT:
You are aware of the story world defined in the Lore.
Relationships:
${relationships}
Plot Threads:
${plotThreads}

You are talking to your Author. Answer their questions to help them write you better.
`;

  return baseInstruction.replace(
    '[FULL MANUSCRIPT CONTEXT]',
    `${interviewBlock}\n\n[FULL MANUSCRIPT CONTEXT]`
  );
};

// Import comprehensive tools - legacy agentTools kept for backward compatibility
import { 
  ALL_AGENT_TOOLS, 
  VOICE_SAFE_TOOLS, 
  QUICK_TOOLS,
  NAVIGATION_TOOLS,
  EDITING_TOOLS,
  ANALYSIS_TOOLS,
  UI_CONTROL_TOOLS,
  KNOWLEDGE_TOOLS,
  GENERATION_TOOLS,
} from './agentTools';

// Re-export for convenience
export { 
  ALL_AGENT_TOOLS, 
  VOICE_SAFE_TOOLS, 
  QUICK_TOOLS,
  NAVIGATION_TOOLS,
  EDITING_TOOLS,
  ANALYSIS_TOOLS,
  UI_CONTROL_TOOLS,
  KNOWLEDGE_TOOLS,
  GENERATION_TOOLS,
};

// Legacy tool set (backward compatibility) - use ALL_AGENT_TOOLS for full functionality
export const agentTools: FunctionDeclaration[] = [
  {
    name: 'update_manuscript',
    description: 'Replaces a specific section of text in the ACTIVE CHAPTER with new content. Use this to rewrite sentences, paragraphs, or fix typos. Provide the exact text to find and the replacement text.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        search_text: { type: Type.STRING, description: 'The exact text in the manuscript to be replaced.' },
        replacement_text: { type: Type.STRING, description: 'The new text to insert.' },
        description: { type: Type.STRING, description: 'A short summary of what changed (e.g. "Rewrote intro for clarity")' }
      },
      required: ['search_text', 'replacement_text', 'description']
    }
  },
  {
    name: 'append_to_manuscript',
    description: 'Adds new text to the very end of the ACTIVE CHAPTER.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        text_to_add: { type: Type.STRING, description: 'The text to append.' },
        description: { type: Type.STRING, description: 'Short summary of addition.' }
      },
      required: ['text_to_add', 'description']
    }
  },
  {
    name: 'undo_last_change',
    description: 'Reverts the manuscript to the previous version.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    }
  }
];

export const rewriteText = async (text: string, mode: string, tone?: string, setting?: { timePeriod: string, location: string }, _signal?: AbortSignal): Promise<{ result: string[]; usage?: UsageMetadata }> => {
  const model = ModelConfig.analysis;

  const settingInstruction = setting 
    ? `The manuscript is set in ${setting.timePeriod} in ${setting.location}. Ensure all language, objects, and dialogue are historically and geographically accurate to this setting.`
    : `Ensure the language matches the established tone of the text.`;

  const systemInstruction = REWRITE_SYSTEM_INSTRUCTION.replace('{{SETTING_INSTRUCTION}}', settingInstruction);

  const userMessage = `Original Text: "${text}"
Edit Mode: ${mode}
${mode === 'Tone Tuner' ? `Target Tone: ${tone}` : ''}`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: userMessage,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
            type: Type.OBJECT,
            properties: {
                variations: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                }
            },
            required: ["variations"]
        }
      },
    });

    // Use resilient parser
    const parseResult = safeParseJson(response.text, { variations: [] });
    
    if (!parseResult.success) {
      console.warn('[rewriteText] Parse failed:', parseResult.error);
    }
    
    const data = parseResult.data as { variations?: string[] };
    return {
      result: data?.variations || [],
      usage: response.usageMetadata
    };
  } catch (e) {
    console.error("Rewrite failed", e);
    return { result: [] };
  }
};

export const getContextualHelp = async (text: string, type: 'Explain' | 'Thesaurus', _signal?: AbortSignal): Promise<{ result: string; usage?: UsageMetadata }> => {
  const model = ModelConfig.tools; 
  
  const prompt = `Type: ${type}\nText: "${text}"\nKeep the answer short and helpful.`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: { systemInstruction: CONTEXTUAL_HELP_SYSTEM_INSTRUCTION }
  });
  
  return {
    result: response.text || "No result found.",
    usage: response.usageMetadata
  };
};

/**
 * Build intelligence context string from ManuscriptHUD for AI consumption
 */
const buildIntelligenceContext = (hud: ManuscriptHUD): string => {
  const { situational, context, styleAlerts, prioritizedIssues, stats } = hud;
  
  let ctx = `[INTELLIGENCE HUD - Real-time Awareness]\n\n`;
  
  // Situational awareness
  ctx += `[CURRENT POSITION]\n`;
  if (situational.currentScene) {
    ctx += `Scene Type: ${situational.currentScene.type}\n`;
    if (situational.currentScene.pov) {
      ctx += `POV Character: ${situational.currentScene.pov}\n`;
    }
    if (situational.currentScene.location) {
      ctx += `Location: ${situational.currentScene.location}\n`;
    }
    ctx += `Tension: ${situational.tensionLevel.toUpperCase()}\n`;
    ctx += `Dialogue Ratio: ${Math.round(situational.currentScene.dialogueRatio * 100)}%\n`;
  }
  ctx += `Pacing: ${situational.pacing}\n`;
  ctx += `Progress: Scene ${situational.narrativePosition.sceneIndex} of ${situational.narrativePosition.totalScenes} (${situational.narrativePosition.percentComplete}%)\n\n`;
  
  // Active entities
  if (context.activeEntities.length > 0) {
    ctx += `[ACTIVE CHARACTERS/ENTITIES]\n`;
    for (const entity of context.activeEntities.slice(0, 6)) {
      ctx += `• ${entity.name} (${entity.type}) - ${entity.mentionCount} mentions`;
      if (entity.aliases.length > 0) {
        ctx += ` [aliases: ${entity.aliases.slice(0, 2).join(', ')}]`;
      }
      ctx += `\n`;
    }
    ctx += `\n`;
  }
  
  // Active relationships
  if (context.activeRelationships.length > 0) {
    ctx += `[KEY RELATIONSHIPS IN SCENE]\n`;
    for (const rel of context.activeRelationships.slice(0, 5)) {
      const source = context.activeEntities.find(e => e.id === rel.source);
      const target = context.activeEntities.find(e => e.id === rel.target);
      if (source && target) {
        ctx += `• ${source.name} ←${rel.type}→ ${target.name} (${rel.coOccurrences} interactions)\n`;
      }
    }
    ctx += `\n`;
  }
  
  // Open plot threads
  if (context.openPromises.length > 0) {
    ctx += `[OPEN PLOT THREADS - Need Resolution]\n`;
    for (const promise of context.openPromises) {
      ctx += `⚡ [${promise.type.toUpperCase()}] ${promise.description.slice(0, 80)}...\n`;
    }
    ctx += `\n`;
  }
  
  // Recent timeline events
  if (context.recentEvents.length > 0) {
    ctx += `[RECENT NARRATIVE EVENTS]\n`;
    for (const event of context.recentEvents.slice(-3)) {
      ctx += `→ ${event.description.slice(0, 60)}`;
      if (event.temporalMarker) {
        ctx += ` (${event.temporalMarker})`;
      }
      ctx += `\n`;
    }
    ctx += `\n`;
  }
  
  // Style alerts (issues to be aware of)
  if (styleAlerts.length > 0) {
    ctx += `[STYLE ALERTS]\n`;
    for (const alert of styleAlerts) {
      ctx += `⚠️ ${alert}\n`;
    }
    ctx += `\n`;
  }
  
  // Priority issues
  if (prioritizedIssues.length > 0) {
    ctx += `[PRIORITY ISSUES TO ADDRESS]\n`;
    for (const issue of prioritizedIssues) {
      const icon = issue.severity > 0.7 ? '🔴' : issue.severity > 0.4 ? '🟡' : '🟢';
      ctx += `${icon} ${issue.description}\n`;
    }
    ctx += `\n`;
  }
  
  // Quick stats
  ctx += `[MANUSCRIPT METRICS]\n`;
  ctx += `Words: ${stats.wordCount.toLocaleString()} | `;
  ctx += `Reading: ~${stats.readingTime} min | `;
  ctx += `Dialogue: ${stats.dialoguePercent}% | `;
  ctx += `Avg Sentence: ${stats.avgSentenceLength} words\n`;
  
  return ctx;
};

export const createAgentSession = (
  lore?: Lore, 
  analysis?: AnalysisResult, 
  fullManuscriptContext?: string, 
  persona?: Persona,
  intensity: CritiqueIntensity = DEFAULT_CRITIQUE_INTENSITY,
  experience: ExperienceLevel = DEFAULT_EXPERIENCE,
  autonomy: AutonomyMode = DEFAULT_AUTONOMY,
  intelligenceHUD?: ManuscriptHUD,
  interviewTarget?: CharacterProfile
) => {
  let loreContext = "";
  if (lore) {
    const chars = lore.characters.map(c => `
    - Name: ${c.name}
    - Bio: ${c.bio}
    - Arc Summary: ${c.arc}
    - Key Development Suggestion: ${c.developmentSuggestion}
    - Known Inconsistencies: ${c.inconsistencies.map(i => i.issue).join(', ') || "None"}
    `).join('\n');
    
    const rules = lore.worldRules.map(r => `- ${r}`).join('\n');
    
    loreContext = `
    [LORE BIBLE & CONTEXTUAL MEMORY]
    Do not contradict these established facts about the story.
    
    CHARACTERS:
    ${chars}
    
    WORLD RULES / SETTING DETAILS:
    ${rules}
    `;
  }

  let analysisContext = "";
  if (analysis) {
    analysisContext = `
    [DEEP ANALYSIS INSIGHTS]
    Use these insights to answer questions about plot holes, pacing, and character arcs.
    
    SUMMARY: ${analysis.summary}
    STRENGTHS: ${analysis.strengths.join(', ')}
    WEAKNESSES: ${analysis.weaknesses.join(', ')}
    
    PLOT ISSUES:
    ${analysis.plotIssues.map(p => `- ${p.issue} (Fix: ${p.suggestion})`).join('\n')}
    
    CHARACTERS (FROM ANALYSIS):
    ${analysis.characters.map(c => `- ${c.name}: ${c.arc} (Suggestion: ${c.developmentSuggestion})`).join('\n')}
    `;
  }

  const intensityModifier = getIntensityModifier(intensity);
  const experienceModifier = getExperienceModifier(experience);
  const autonomyModifier = getAutonomyModifier(autonomy);

  let systemInstruction = AGENT_SYSTEM_INSTRUCTION
    .replace('{{INTENSITY_MODIFIER}}', intensityModifier)
    .replace('{{LORE_CONTEXT}}', loreContext)
    .replace('{{ANALYSIS_CONTEXT}}', analysisContext)
    .replace('{{FULL_MANUSCRIPT}}', fullManuscriptContext || "No manuscript content loaded.");

  // Append experience and autonomy modifiers
  systemInstruction += `\n\n${experienceModifier}\n\n${autonomyModifier}`;

  // Inject intelligence HUD context if available
  if (intelligenceHUD) {
    const intelligenceContext = buildIntelligenceContext(intelligenceHUD);
    systemInstruction += `\n\n${intelligenceContext}`;
  }

  // Apply persona instructions if provided
  if (interviewTarget) {
    systemInstruction = buildInterviewInstruction(systemInstruction, interviewTarget);
  } else if (persona) {
    systemInstruction = buildPersonaInstruction(systemInstruction, persona);
  }

  return ai.chats.create({
    model: ModelConfig.agent, 
    config: {
      systemInstruction,
      tools: [{ functionDeclarations: agentTools }]
    }
  });
};
