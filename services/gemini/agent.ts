import { Type, FunctionDeclaration, UsageMetadata } from "@google/genai";
import { AnalysisResult } from "../../types";
import { Lore } from "../../types/schema";
import { ModelConfig } from "../../config/models";
import { ai } from "./client";
import { REWRITE_SYSTEM_INSTRUCTION, CONTEXTUAL_HELP_SYSTEM_INSTRUCTION, AGENT_SYSTEM_INSTRUCTION } from "./prompts";
import { safeParseJson, validators } from "./resilientParser";
import { Persona, buildPersonaInstruction } from "../../types/personas";
import { CritiqueIntensity, DEFAULT_CRITIQUE_INTENSITY } from "../../types/critiqueSettings";
import { getIntensityModifier } from "./critiquePrompts";

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

export const createAgentSession = (
  lore?: Lore, 
  analysis?: AnalysisResult, 
  fullManuscriptContext?: string, 
  persona?: Persona,
  intensity: CritiqueIntensity = DEFAULT_CRITIQUE_INTENSITY
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

  let systemInstruction = AGENT_SYSTEM_INSTRUCTION
    .replace('{{INTENSITY_MODIFIER}}', intensityModifier)
    .replace('{{LORE_CONTEXT}}', loreContext)
    .replace('{{ANALYSIS_CONTEXT}}', analysisContext)
    .replace('{{FULL_MANUSCRIPT}}', fullManuscriptContext || "No manuscript content loaded.");

  // Apply persona instructions if provided
  if (persona) {
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
