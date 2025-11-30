/**
 * Centralized Model Configuration
 * 
 * All Gemini model IDs are defined here to enable easy version upgrades
 * and ensure consistency across the application.
 */
 
type ModelRole = 'analysis' | 'agent' | 'tts' | 'liveAudio' | 'tools';

type Provider = 'gemini' | 'openai';

interface ModelDefinition {
  id: string;
  provider: Provider;
  role: ModelRole;
  maxTokens?: number;
  costTier?: 'cheap' | 'balanced' | 'premium';
  latencyTier?: 'fast' | 'medium' | 'slow';
  defaultThinkingBudget?: number;
}

type ModelBuildKey = 'default' | 'cheap' | 'deepThinking';

type ModelBuild = Record<ModelRole, ModelDefinition>;

const MODEL_BUILD_ENV = (process.env.VITE_MODEL_BUILD || process.env.MODEL_BUILD) as
  | ModelBuildKey
  | undefined;

export const ModelBuilds: Record<ModelBuildKey, ModelBuild> = {
  default: {
    analysis: {
      id: 'gemini-3-pro-preview',
      provider: 'gemini',
      role: 'analysis',
      maxTokens: 1_000_000,
      costTier: 'balanced',
      latencyTier: 'medium',
      defaultThinkingBudget: 32768,
    },
    agent: {
      id: 'gemini-2.5-flash',
      provider: 'gemini',
      role: 'agent',
      costTier: 'cheap',
      latencyTier: 'fast',
    },
    tts: {
      id: 'gemini-2.5-flash-preview-tts',
      provider: 'gemini',
      role: 'tts',
      maxTokens: 8_000,
      costTier: 'balanced',
      latencyTier: 'medium',
    },
    liveAudio: {
      id: 'gemini-2.5-flash-native-audio-preview-09-2025',
      provider: 'gemini',
      role: 'liveAudio',
      maxTokens: 32_000,
      costTier: 'balanced',
      latencyTier: 'medium',
    },
    tools: {
      id: 'gemini-2.5-flash',
      provider: 'gemini',
      role: 'tools',
      costTier: 'cheap',
      latencyTier: 'fast',
    },
  },
  cheap: {
    analysis: {
      id: 'gemini-2.5-flash',
      provider: 'gemini',
      role: 'analysis',
      maxTokens: 1_000_000,
      costTier: 'cheap',
      latencyTier: 'fast',
      defaultThinkingBudget: 16384,
    },
    agent: {
      id: 'gemini-2.5-flash',
      provider: 'gemini',
      role: 'agent',
      costTier: 'cheap',
      latencyTier: 'fast',
    },
    tts: {
      id: 'gemini-2.5-flash-preview-tts',
      provider: 'gemini',
      role: 'tts',
      maxTokens: 8_000,
      costTier: 'cheap',
      latencyTier: 'fast',
    },
    liveAudio: {
      id: 'gemini-2.5-flash-native-audio-preview-09-2025',
      provider: 'gemini',
      role: 'liveAudio',
      maxTokens: 32_000,
      costTier: 'cheap',
      latencyTier: 'fast',
    },
    tools: {
      id: 'gemini-2.5-flash',
      provider: 'gemini',
      role: 'tools',
      costTier: 'cheap',
      latencyTier: 'fast',
    },
  },
  deepThinking: {
    analysis: {
      id: 'gemini-3-pro-preview',
      provider: 'gemini',
      role: 'analysis',
      maxTokens: 1_000_000,
      costTier: 'premium',
      latencyTier: 'slow',
      defaultThinkingBudget: 65536,
    },
    agent: {
      id: 'gemini-3-pro-preview',
      provider: 'gemini',
      role: 'agent',
      maxTokens: 1_000_000,
      costTier: 'premium',
      latencyTier: 'medium',
    },
    tts: {
      id: 'gemini-2.5-flash-preview-tts',
      provider: 'gemini',
      role: 'tts',
      maxTokens: 8_000,
      costTier: 'balanced',
      latencyTier: 'medium',
    },
    liveAudio: {
      id: 'gemini-2.5-flash-native-audio-preview-09-2025',
      provider: 'gemini',
      role: 'liveAudio',
      maxTokens: 32_000,
      costTier: 'balanced',
      latencyTier: 'medium',
    },
    tools: {
      id: 'gemini-3-pro-preview',
      provider: 'gemini',
      role: 'tools',
      maxTokens: 1_000_000,
      costTier: 'premium',
      latencyTier: 'medium',
    },
  },
};

const ACTIVE_BUILD_KEY: ModelBuildKey =
  MODEL_BUILD_ENV && MODEL_BUILD_ENV in ModelBuilds ? MODEL_BUILD_ENV : 'default';

export const ActiveModels: ModelBuild = ModelBuilds[ACTIVE_BUILD_KEY];

export const ModelConfig = {
  get analysis() {
    return ActiveModels.analysis.id;
  },
  get agent() {
    return ActiveModels.agent.id;
  },
  get tts() {
    return ActiveModels.tts.id;
  },
  get liveAudio() {
    return ActiveModels.liveAudio.id;
  },
  get tools() {
    return ActiveModels.tools.id;
  },
  get pro() {
    return this.analysis;
  },
  get flash() {
    return this.agent;
  },
} as const;

/**
 * Token limits per model (approximate)
 * Used by tokenGuard to prevent context window overflow
 */
export const TokenLimits = {
  'gemini-3-pro-preview': 1_000_000,
  'gemini-2.5-flash': 1_000_000,
  'gemini-2.5-flash-preview-tts': 8_000,
  'gemini-2.5-flash-native-audio-preview-09-2025': 32_000,
} as const;

/**
 * Default thinking budgets for deep analysis
 */
export const ThinkingBudgets = {
  analysis: 32768,
  plotIdeas: 8192,
  rewrite: 4096,
} as const;

export type ModelId = keyof typeof TokenLimits;
