import { Type, UsageMetadata } from "@google/genai";
import { AnalysisResult, AnalysisResultSchema, PlotSuggestion, CharacterProfile, AnalysisWarning } from "../../types";
import { ManuscriptIndex } from "../../types/schema";
import { ModelConfig, ThinkingBudgets } from "../../config/models";
import { ai } from "./client";
import { 
  ANALYSIS_PROMPT, 
  PLOT_IDEAS_PROMPT, 
  PACING_PROMPT, 
  CHARACTER_PROMPT, 
  PLOT_PROMPT, 
  SETTING_PROMPT 
} from "./prompts";
import { safeParseJson } from "./resilientParser";
import { prepareAnalysisText } from "./tokenGuard";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES FOR PARALLEL ANALYSIS
// ─────────────────────────────────────────────────────────────────────────────

export interface PacingAnalysisResult {
  pacing: AnalysisResult['pacing'];
  generalSuggestions: string[];
}

export interface CharacterAnalysisResult {
  characters: CharacterProfile[];
}

export interface PlotAnalysisResult {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  plotIssues: AnalysisResult['plotIssues'];
}

export interface SettingAnalysisResult {
  settingAnalysis: AnalysisResult['settingAnalysis'];
}

/** Default/fallback analysis result for error cases */
const EMPTY_ANALYSIS: AnalysisResult = {
  summary: 'Analysis could not be completed.',
  strengths: [],
  weaknesses: [],
  pacing: { score: 0, analysis: '', slowSections: [], fastSections: [] },
  plotIssues: [],
  characters: [],
  generalSuggestions: [],
};

export const analyzeDraft = async (
    text: string,
    setting?: { timePeriod: string, location: string },
    manuscriptIndex?: ManuscriptIndex,
    _signal?: AbortSignal
): Promise<{ result: AnalysisResult; usage?: UsageMetadata; warning?: AnalysisWarning }> => {
  const model = ModelConfig.analysis; 
  
  const settingContext = setting 
    ? `SETTING CONTEXT: Time Period: ${setting.timePeriod}, Location: ${setting.location}.` 
    : `SETTING CONTEXT: General Fiction (Unknown setting).`;

  const indexContext = manuscriptIndex 
  ? `KNOWN CHARACTER FACTS (from previous chapters):
     ${Object.entries(manuscriptIndex.characters).map(([name, data]) => 
         `${name}: ${Object.entries(data.attributes || {})
           .map(([attr, vals]) => `${attr}=${vals[0]?.value}`)
           .join(', ')}`
       ).join('\n')}`
  : '';

  // Prepare text with token guard
  const { text: safeText, warning } = prepareAnalysisText(text);

  const prompt = ANALYSIS_PROMPT
    .replace('{{SETTING_CONTEXT}}', settingContext)
    .replace('{{INDEX_CONTEXT}}', indexContext)
    .replace('{{SETTING_LABEL}}', setting ? 'specified time period' : 'apparent setting')
    .replace('{{TEXT}}', safeText);

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      thinkingConfig: { thinkingBudget: ThinkingBudgets.analysis },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
          weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
          pacing: {
            type: Type.OBJECT,
            properties: {
              score: { type: Type.NUMBER, description: "1-10" },
              analysis: { type: Type.STRING, description: "Overall analysis of flow and structure" },
              slowSections: { type: Type.ARRAY, items: { type: Type.STRING } },
              fastSections: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ["score", "analysis", "slowSections", "fastSections"]
          },
          settingAnalysis: {
            type: Type.OBJECT,
            properties: {
                score: { type: Type.NUMBER, description: "1-10" },
                analysis: { type: Type.STRING },
                issues: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            quote: { type: Type.STRING },
                            issue: { type: Type.STRING, description: "Description of the anachronism or tone error"},
                            suggestion: { type: Type.STRING },
                            alternatives: { type: Type.ARRAY, items: { type: Type.STRING } }
                        },
                        required: ["quote", "issue", "suggestion"]
                    }
                }
            },
            required: ["score", "analysis", "issues"]
          },
          plotIssues: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                issue: { type: Type.STRING },
                location: { type: Type.STRING, description: "Where in the text this happens" },
                suggestion: { type: Type.STRING, description: "How to resolve it" },
                quote: { type: Type.STRING, description: "Exact quote from text evidencing this issue (max 20 words)" }
              },
              required: ["issue", "location", "suggestion"]
            }
          },
          characters: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                bio: { type: Type.STRING },
                arc: { type: Type.STRING },
                arcStages: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            stage: { type: Type.STRING},
                            description: { type: Type.STRING}
                        },
                        required: ["stage", "description"]
                    }
                },
                relationships: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            name: { type: Type.STRING },
                            type: { type: Type.STRING },
                            dynamic: { type: Type.STRING }
                        },
                        required: ["name", "type", "dynamic"]
                    }
                },
                plotThreads: {
                    type: Type.ARRAY, 
                    items: { type: Type.STRING }
                },
                inconsistencies: { 
                    type: Type.ARRAY, 
                    items: { 
                        type: Type.OBJECT,
                        properties: {
                            issue: { type: Type.STRING },
                            quote: { type: Type.STRING, description: "Exact quote from text evidencing this inconsistency" }
                        },
                        required: ["issue"]
                    } 
                },
                developmentSuggestion: { type: Type.STRING }
              },
              required: ["name", "bio", "arc", "arcStages", "relationships", "plotThreads", "inconsistencies", "developmentSuggestion"]
            }
          },
          generalSuggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["summary", "strengths", "weaknesses", "pacing", "plotIssues", "characters", "generalSuggestions"],
      },
    },
  });

  // Use resilient parser for non-deterministic LLM output
  const parseResult = safeParseJson<AnalysisResult>(response.text, EMPTY_ANALYSIS);
  
  if (!parseResult.success) {
    console.warn('[analyzeDraft] Parse failed:', parseResult.error);
  }

  // Zod runtime validation
  const zodResult = AnalysisResultSchema.safeParse(parseResult.data);
  
  if (!zodResult.success) {
    console.error('[analyzeDraft] Zod validation failed:', zodResult.error.format());
    return {
      result: EMPTY_ANALYSIS,
      usage: response.usageMetadata,
      warning: 'AI response failed validation - using default analysis',
    };
  }

  return {
    result: zodResult.data as AnalysisResult,
    usage: response.usageMetadata,
    warning: warning || (parseResult.sanitized ? 'AI response needed cleanup; results may be incomplete.' : undefined),
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// PARALLEL ANALYSIS FUNCTIONS
// These can be called independently for incremental UI updates
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch pacing analysis independently
 */
export const fetchPacingAnalysis = async (
  text: string,
  setting?: { timePeriod: string; location: string },
  signal?: AbortSignal
): Promise<PacingAnalysisResult> => {
  const model = ModelConfig.analysis;
  const { text: safeText } = prepareAnalysisText(text);
  
  const settingContext = setting 
    ? `SETTING CONTEXT: Time Period: ${setting.timePeriod}, Location: ${setting.location}.` 
    : '';

  const prompt = PACING_PROMPT
    .replace('{{SETTING_CONTEXT}}', settingContext)
    .replace('{{TEXT}}', safeText);

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      thinkingConfig: { thinkingBudget: ThinkingBudgets.analysis / 2 },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          pacing: {
            type: Type.OBJECT,
            properties: {
              score: { type: Type.NUMBER },
              analysis: { type: Type.STRING },
              slowSections: { type: Type.ARRAY, items: { type: Type.STRING } },
              fastSections: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ["score", "analysis", "slowSections", "fastSections"]
          },
          generalSuggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["pacing", "generalSuggestions"]
      }
    }
  });

  const parseResult = safeParseJson<PacingAnalysisResult>(response.text, {
    pacing: { score: 0, analysis: '', slowSections: [], fastSections: [] },
    generalSuggestions: []
  });

  return parseResult.data!;
};

/**
 * Fetch character analysis independently
 */
export const fetchCharacterAnalysis = async (
  text: string,
  manuscriptIndex?: ManuscriptIndex,
  signal?: AbortSignal
): Promise<CharacterAnalysisResult> => {
  const model = ModelConfig.analysis;
  const { text: safeText } = prepareAnalysisText(text);

  const indexContext = manuscriptIndex 
    ? `KNOWN CHARACTER FACTS:\n${Object.entries(manuscriptIndex.characters).map(([name, data]) => 
        `${name}: ${Object.entries(data.attributes || {}).map(([attr, vals]) => `${attr}=${vals[0]?.value}`).join(', ')}`
      ).join('\n')}`
    : '';

  const prompt = CHARACTER_PROMPT
    .replace('{{INDEX_CONTEXT}}', indexContext)
    .replace('{{TEXT}}', safeText);

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      thinkingConfig: { thinkingBudget: ThinkingBudgets.analysis / 2 },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          characters: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                bio: { type: Type.STRING },
                arc: { type: Type.STRING },
                arcStages: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      stage: { type: Type.STRING },
                      description: { type: Type.STRING }
                    },
                    required: ["stage", "description"]
                  }
                },
                relationships: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      type: { type: Type.STRING },
                      dynamic: { type: Type.STRING }
                    },
                    required: ["name", "type", "dynamic"]
                  }
                },
                plotThreads: { type: Type.ARRAY, items: { type: Type.STRING } },
                inconsistencies: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      issue: { type: Type.STRING },
                      quote: { type: Type.STRING }
                    },
                    required: ["issue"]
                  }
                },
                developmentSuggestion: { type: Type.STRING }
              },
              required: ["name", "bio", "arc", "arcStages", "relationships", "plotThreads", "inconsistencies", "developmentSuggestion"]
            }
          }
        },
        required: ["characters"]
      }
    }
  });

  const parseResult = safeParseJson<CharacterAnalysisResult>(response.text, { characters: [] });
  return parseResult.data!;
};

/**
 * Fetch plot analysis independently
 */
export const fetchPlotAnalysis = async (
  text: string,
  signal?: AbortSignal
): Promise<PlotAnalysisResult> => {
  const model = ModelConfig.analysis;
  const { text: safeText } = prepareAnalysisText(text);

  const prompt = PLOT_PROMPT.replace('{{TEXT}}', safeText);

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      thinkingConfig: { thinkingBudget: ThinkingBudgets.analysis / 2 },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
          weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
          plotIssues: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                issue: { type: Type.STRING },
                location: { type: Type.STRING },
                suggestion: { type: Type.STRING },
                quote: { type: Type.STRING, description: "Exact quote from text (max 30 words)" }
              },
              required: ["issue", "location", "suggestion"]
            }
          }
        },
        required: ["summary", "strengths", "weaknesses", "plotIssues"]
      }
    }
  });

  const parseResult = safeParseJson<PlotAnalysisResult>(response.text, {
    summary: '',
    strengths: [],
    weaknesses: [],
    plotIssues: []
  });

  return parseResult.data!;
};

/**
 * Fetch setting/anachronism analysis independently
 */
export const fetchSettingAnalysis = async (
  text: string,
  setting: { timePeriod: string; location: string },
  signal?: AbortSignal
): Promise<SettingAnalysisResult> => {
  const model = ModelConfig.analysis;
  const { text: safeText } = prepareAnalysisText(text);

  const prompt = SETTING_PROMPT
    .replace('{{TIME_PERIOD}}', setting.timePeriod)
    .replace('{{LOCATION}}', setting.location)
    .replace('{{TEXT}}', safeText);

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      thinkingConfig: { thinkingBudget: ThinkingBudgets.analysis / 2 },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          settingAnalysis: {
            type: Type.OBJECT,
            properties: {
              score: { type: Type.NUMBER },
              analysis: { type: Type.STRING },
              issues: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    quote: { type: Type.STRING },
                    issue: { type: Type.STRING },
                    suggestion: { type: Type.STRING },
                    alternatives: { type: Type.ARRAY, items: { type: Type.STRING } }
                  },
                  required: ["quote", "issue", "suggestion"]
                }
              }
            },
            required: ["score", "analysis", "issues"]
          }
        },
        required: ["settingAnalysis"]
      }
    }
  });

  const parseResult = safeParseJson<SettingAnalysisResult>(response.text, {
    settingAnalysis: { score: 0, analysis: '', issues: [] }
  });

  return parseResult.data!;
};

// ─────────────────────────────────────────────────────────────────────────────
// PLOT IDEAS
// ─────────────────────────────────────────────────────────────────────────────

export const generatePlotIdeas = async (text: string, userInstruction?: string, suggestionType: string = 'General'): Promise<{ result: PlotSuggestion[]; usage?: UsageMetadata; warning?: string }> => {
  const model = ModelConfig.analysis;
  
  // Prepare text with token guard
  const { text: safeText, warning } = prepareAnalysisText(text);

  const prompt = PLOT_IDEAS_PROMPT
    .replace('{{SUGGESTION_TYPE}}', suggestionType)
    .replace('{{USER_INSTRUCTION}}', userInstruction || 'None - provide best options based on analysis')
    .replace('{{TEXT}}', safeText);

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      thinkingConfig: { thinkingBudget: ThinkingBudgets.plotIdeas },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: {
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                reasoning: { type: Type.STRING, description: "How this links to existing plot/characters" }
            },
            required: ["title", "description", "reasoning"]
        }
      }
    }
  });

  // Use resilient parser
  const parseResult = safeParseJson<PlotSuggestion[]>(response.text, []);
  
  if (!parseResult.success) {
    console.warn('[generatePlotIdeas] Parse failed:', parseResult.error);
  }

  return {
    result: parseResult.data!,
    usage: response.usageMetadata,
    warning: warning || (parseResult.sanitized ? 'Response required sanitization' : undefined),
  };
};
