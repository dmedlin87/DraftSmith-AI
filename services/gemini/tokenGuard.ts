/**
 * Token Guard
 * 
 * Validates input length before sending to LLM to prevent
 * context window overflow errors.
 */

import { TokenLimits, ModelId } from '../../config/models';
import { ApiDefaults, estimateTokens } from '../../config/api';
import { AnalysisWarning } from '../../types';

export interface TokenCheckResult {
  valid: boolean;
  estimatedTokens: number;
  limit: number;
  overflow: number;
  suggestion?: string;
}

/**
 * Checks if input text fits within model context window.
 * Returns detailed result with overflow information.
 */
export function checkTokenLimit(
  text: string,
  model: ModelId,
  reserveTokens: number = 4000 // Reserve for response
): TokenCheckResult {
  const limit = TokenLimits[model] ?? 32_000;
  const rawLimit = limit;
  const availableTokens = Math.max(0, rawLimit - reserveTokens);
  const estimatedTokens = estimateTokens(text);
  const overflow = Math.max(0, estimatedTokens - availableTokens);
  
  const result: TokenCheckResult = {
    valid: overflow === 0 && availableTokens > 0,
    estimatedTokens,
    limit: availableTokens,
    overflow,
  };
  
  if (availableTokens === 0) {
    result.suggestion = 'Token configuration leaves no room for input.';
  } else if (!result.valid) {
    const charsToRemove = overflow * ApiDefaults.charsPerToken;
    result.suggestion = `Input exceeds limit by ~${overflow.toLocaleString()} tokens. ` +
      `Consider removing ~${charsToRemove.toLocaleString()} characters.`;
  }
  
  return result;
}

/**
 * Truncates text to fit within model limits while preserving semantic boundaries.
 * Tries to break at paragraph or sentence boundaries.
 */
export function truncateToLimit(
  text: string,
  model: ModelId,
  reserveTokens: number = 4000
): { text: string; truncated: boolean; removedChars: number } {
  const limit = TokenLimits[model] ?? 32_000;
  const rawLimit = limit;
  const availableTokens = Math.max(0, rawLimit - reserveTokens);
  const maxChars = availableTokens * ApiDefaults.charsPerToken;
  
  if (maxChars <= 0) {
    return { text: '', truncated: true, removedChars: text.length };
  }
  
  if (text.length <= maxChars) {
    return { text, truncated: false, removedChars: 0 };
  }
  
  // Find a good break point near the limit
  let breakPoint = maxChars;
  
  // Try to break at paragraph
  const paragraphBreak = text.lastIndexOf('\n\n', maxChars);
  if (paragraphBreak > maxChars * 0.8) {
    breakPoint = paragraphBreak;
  } else {
    // Try to break at sentence
    const sentenceBreak = Math.max(
      text.lastIndexOf('. ', maxChars),
      text.lastIndexOf('! ', maxChars),
      text.lastIndexOf('? ', maxChars)
    );
    if (sentenceBreak > maxChars * 0.9) {
      breakPoint = sentenceBreak + 1;
    }
  }
  
  const truncatedText = text.substring(0, breakPoint);
  
  return {
    text: truncatedText,
    truncated: true,
    removedChars: text.length - truncatedText.length,
  };
}

/**
 * Prepares text for analysis with automatic truncation and warning.
 * Uses the configured max analysis length.
 */
export function prepareAnalysisText(text: string): {
  text: string;
  warning?: AnalysisWarning;
} {
  const maxLength: number = ApiDefaults.maxAnalysisLength;
  
  if (text.length <= maxLength) {
    return { text };
  }
  
  // Truncate at a clean boundary
  let breakPoint = maxLength;
  const paragraphBreak = text.lastIndexOf('\n\n', maxLength);
  if (paragraphBreak > maxLength * 0.8) {
    breakPoint = paragraphBreak;
  }
  
  const removedChars = text.length - breakPoint;
  const removedPercent = Math.round((removedChars / text.length) * 100);
  
  return {
    text: text.substring(0, breakPoint),
    warning: {
      message: `Text truncated: ${removedChars.toLocaleString()} characters (${removedPercent}%) exceeds analysis limit. Consider analyzing in sections.`,
      removedChars,
      removedPercent,
      originalLength: text.length,
    },
  };
}

/**
 * Calculates combined token usage for multi-part prompts.
 */
export function calculateCombinedTokens(
  ...texts: (string | undefined)[]
): number {
  return texts.reduce((total, text) => {
    return total + (text ? estimateTokens(text) : 0);
  }, 0);
}
