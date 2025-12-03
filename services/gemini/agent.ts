import { Type, FunctionDeclaration, UsageMetadata } from "@google/genai";
import { AnalysisResult, CharacterProfile } from "../../types";
import { Lore } from "../../types/schema";
import { ModelConfig } from "../../config/models";
import { ai } from "./client";
import {
  REWRITE_SYSTEM_INSTRUCTION,
  CONTEXTUAL_HELP_SYSTEM_INSTRUCTION,
  AGENT_SYSTEM_INSTRUCTION,
  CONTINUATION_SYSTEM_INSTRUCTION,
} from "./prompts";
import { safeParseJsonWithValidation, validators } from "./resilientParser";
import { Persona, buildPersonaInstruction } from "../../types/personas";
import { CritiqueIntensity, DEFAULT_CRITIQUE_INTENSITY } from "../../types/critiqueSettings";
import { ExperienceLevel, AutonomyMode, DEFAULT_EXPERIENCE, DEFAULT_AUTONOMY } from "../../types/experienceSettings";
import { getIntensityModifier } from "./critiquePrompts";
import { getExperienceModifier, getAutonomyModifier } from "./experiencePrompts";
import { ManuscriptHUD, VoiceFingerprint } from "../../types/intelligence";
import type { Chat } from "@google/genai";
import { AIError, normalizeAIError } from "./errors";

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

    // Use resilient parser with schema validation for variations array
    const parseResult = safeParseJsonWithValidation(
      response.text,
      validators.isVariationsResponse,
      { variations: [] }
    );
    
    if (!parseResult.success) {
      console.warn('[rewriteText] Parse failed:', parseResult.error);
    }
    
    const data = parseResult.data as { variations: string[] };
    return {
      result: data.variations ?? [],
      usage: response.usageMetadata
    };
  } catch (e) {
    console.error("Rewrite failed", e);
    return { result: [] };
  }
};

export const generateContinuation = async (
  context: string,
  _signal?: AbortSignal
): Promise<{ result: string; usage?: UsageMetadata }> => {
  const model = ModelConfig.analysis;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: `Manuscript context (continue seamlessly):\n${context}`,
      config: {
        systemInstruction: CONTINUATION_SYSTEM_INSTRUCTION,
      },
    });

    const continuation = response.text?.trim();

    if (!continuation) {
      throw new AIError('No continuation was returned from the model.');
    }

    return { result: continuation, usage: response.usageMetadata };
  } catch (error) {
    const normalized = normalizeAIError(error, { contextLength: context.length });
    console.error('[generateContinuation] Failed to generate continuation', normalized);
    throw normalized;
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

class PromptBuilder {
  private readonly template: string;
  private intensityModifier = "";
  private loreContext = "";
  private analysisContext = "";
  private memoryContext = "";
  private fullManuscript = "No manuscript content loaded.";
  private experienceModifier = "";
  private autonomyModifier = "";
  private extraBlocks: string[] = [];

  constructor(template: string) {
    this.template = template;
  }

  setIntensity(modifier: string): this {
    this.intensityModifier = modifier;
    return this;
  }

  addLore(lore?: Lore): this {
    if (!lore) return this;

    const chars = lore.characters
      .map(c => `
    - Name: ${c.name}
    - Bio: ${c.bio}
    - Arc Summary: ${c.arc}
    - Key Development Suggestion: ${c.developmentSuggestion}
    - Known Inconsistencies: ${c.inconsistencies.map(i => i.issue).join(', ') || "None"}
    `)
      .join("\n");

    const rules = lore.worldRules.map(r => `- ${r}`).join("\n");

    this.loreContext = `
    [LORE BIBLE & CONTEXTUAL MEMORY]
    Do not contradict these established facts about the story.
    
    CHARACTERS:
    ${chars}
    
    WORLD RULES / SETTING DETAILS:
    ${rules}
    `;

    return this;
  }

  addAnalysis(analysis?: AnalysisResult, voiceFingerprint?: VoiceFingerprint, deepAnalysis?: boolean): this {
    if (!analysis) return this;

    let analysisContext = `
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

    if (deepAnalysis && voiceFingerprint && Object.keys(voiceFingerprint.profiles).length > 0) {
      const profiles = Object.values(voiceFingerprint.profiles);
      let voiceContext = `
    [DEEP ANALYSIS: VOICE FINGERPRINTS]
    `;
      for (const profile of profiles.slice(0, 5)) {
        const latinatePct = Math.round(profile.metrics.latinateRatio * 100);
        const contractionPct = Math.round(profile.metrics.contractionRatio * 100);
        voiceContext += `• ${profile.speakerName}: ${profile.impression} (${latinatePct}% Formal, ${contractionPct}% Casual).\n`;
      }
      voiceContext += 'Use these metrics to ensure character voice consistency.\n';

      analysisContext += `\n${voiceContext}`;
    }

    this.analysisContext = analysisContext;
    return this;
  }

  addContext(options: {
    fullManuscriptContext?: string;
    memoryContext?: string;
    defaultMemoryContext: string;
    experienceModifier: string;
    autonomyModifier: string;
    intelligenceHUD?: ManuscriptHUD;
  }): this {
    const {
      fullManuscriptContext,
      memoryContext,
      defaultMemoryContext,
      experienceModifier,
      autonomyModifier,
      intelligenceHUD,
    } = options;

    if (fullManuscriptContext) {
      this.fullManuscript = fullManuscriptContext;
    }

    this.memoryContext = memoryContext || defaultMemoryContext;
    this.experienceModifier = experienceModifier;
    this.autonomyModifier = autonomyModifier;

    if (intelligenceHUD) {
      const intelligenceContext = buildIntelligenceContext(intelligenceHUD);
      this.extraBlocks.push(intelligenceContext);
    }

    return this;
  }

  build(): string {
    let systemInstruction = this.template
      .replace('{{INTENSITY_MODIFIER}}', this.intensityModifier)
      .replace('{{LORE_CONTEXT}}', this.loreContext)
      .replace('{{ANALYSIS_CONTEXT}}', this.analysisContext)
      .replace('{{MEMORY_CONTEXT}}', this.memoryContext)
      .replace('{{FULL_MANUSCRIPT}}', this.fullManuscript);

    if (this.experienceModifier || this.autonomyModifier) {
      systemInstruction += `\n\n${this.experienceModifier}\n\n${this.autonomyModifier}`;
    }

    if (this.extraBlocks.length > 0) {
      systemInstruction += `\n\n${this.extraBlocks.join('\n\n')}`;
    }

    return systemInstruction;
  }
}

export interface CreateAgentSessionOptions {
  lore?: Lore;
  analysis?: AnalysisResult;
  fullManuscriptContext?: string;
  persona?: Persona;
  intensity?: CritiqueIntensity;
  experience?: ExperienceLevel;
  autonomy?: AutonomyMode;
  intelligenceHUD?: ManuscriptHUD;
  interviewTarget?: CharacterProfile;
  /** Pre-formatted memory context string (from buildAgentContextWithMemory) */
  memoryContext?: string;
  /** Optional voice fingerprint for deep analysis mode */
  voiceFingerprint?: VoiceFingerprint;
  /** If true, include deep voice analytics in the system prompt */
  deepAnalysis?: boolean;
  /** Switch to a voice-safe model/toolset */
  mode?: 'text' | 'voice';
}

export const createAgentSession = (options: CreateAgentSessionOptions = {}) => {
  const {
    lore,
    analysis,
    fullManuscriptContext,
    persona,
    intensity = DEFAULT_CRITIQUE_INTENSITY,
    experience = DEFAULT_EXPERIENCE,
    autonomy = DEFAULT_AUTONOMY,
    intelligenceHUD,
    interviewTarget,
    memoryContext,
    voiceFingerprint,
    deepAnalysis,
    mode = 'text',
  } = options;

  const intensityModifier = getIntensityModifier(intensity);
  const experienceModifier = getExperienceModifier(experience);
  const autonomyModifier = getAutonomyModifier(autonomy);

  const builder = new PromptBuilder(AGENT_SYSTEM_INSTRUCTION)
    .setIntensity(intensityModifier)
    .addLore(lore)
    .addAnalysis(analysis, voiceFingerprint, deepAnalysis)
    .addContext({
      fullManuscriptContext,
      memoryContext,
      defaultMemoryContext:
        '[AGENT MEMORY]\n(No memories loaded yet. Use memory tools to start building your knowledge base.)',
      experienceModifier,
      autonomyModifier,
      intelligenceHUD,
    });

  let systemInstruction = builder.build();

  // Apply persona instructions if provided
  if (interviewTarget) {
    systemInstruction = buildInterviewInstruction(systemInstruction, interviewTarget);
  } else if (persona) {
    systemInstruction = buildPersonaInstruction(systemInstruction, persona);
  }

  const toolset = mode === 'voice' ? VOICE_SAFE_TOOLS : ALL_AGENT_TOOLS;
  const model = mode === 'voice' ? ModelConfig.liveAudio : ModelConfig.agent;

  return ai.chats.create({
    model,
    config: {
      systemInstruction,
      tools: [{ functionDeclarations: toolset }]
    }
  });
};

/**
 * Legacy wrapper for backward compatibility
 * @deprecated Use createAgentSession with options object instead
 */
export const createAgentSessionLegacy = (
  lore?: Lore, 
  analysis?: AnalysisResult, 
  fullManuscriptContext?: string, 
  persona?: Persona,
  intensity: CritiqueIntensity = DEFAULT_CRITIQUE_INTENSITY,
  experience: ExperienceLevel = DEFAULT_EXPERIENCE,
  autonomy: AutonomyMode = DEFAULT_AUTONOMY,
  intelligenceHUD?: ManuscriptHUD,
  interviewTarget?: CharacterProfile
) => createAgentSession({
  lore,
  analysis,
  fullManuscriptContext,
  persona,
  intensity,
  experience,
  autonomy,
  intelligenceHUD,
  interviewTarget,
});

export interface QuillAgentOptions extends CreateAgentSessionOptions {
  /** Optional telemetry / logging context */
  telemetryContext?: Record<string, unknown>;
}

export class QuillAgent {
  private session: Chat | null = null;

  constructor(private readonly options: QuillAgentOptions) {}

  /**
   * Initializes the underlying Gemini Chat session.
   * Must be called before sendMessage.
   */
  async initialize(): Promise<void> {
    try {
      this.session = await createAgentSession(this.options);
    } catch (error) {
      throw normalizeAIError(error, {
        phase: "initialize",
        source: "QuillAgent",
        ...this.options.telemetryContext,
      });
    }
  }

  /**
   * Thin wrapper over Chat.sendMessage that normalizes SDK errors
   * into typed AIError instances.
   */
  async sendMessage(
    payload: Parameters<Chat["sendMessage"]>[0]
  ): Promise<Awaited<ReturnType<Chat["sendMessage"]>>> {
    if (!this.session) {
      throw new AIError(
        "Agent session is not initialized. Call initialize() before sendMessage().",
      );
    }

    try {
      const result = await this.session.sendMessage(payload as any);
      return result as Awaited<ReturnType<Chat["sendMessage"]>>;
    } catch (error) {
      throw normalizeAIError(error, {
        phase: "sendMessage",
        source: "QuillAgent",
        ...this.options.telemetryContext,
      });
    }
  }

  /**
   * Convenience helper for plain-text prompts.
   */
  async sendText(message: string): Promise<string> {
    const result = await this.sendMessage({ message } as any);
    // Result shape is the Gemini ChatResponse; prefer .text fallback.
    return (result as any)?.text ?? "";
  }
}
