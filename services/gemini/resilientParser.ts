/**
 * Resilient Parsing Layer
 * 
 * Handles non-deterministic LLM outputs with robust error handling,
 * automatic sanitization of markdown code blocks, and graceful fallbacks.
 */

/**
 * Removes markdown code fences (```json and ```) from LLM output.
 * Exported for direct use when you need to clean text before custom parsing.
 */
export function cleanJsonOutput(text: string): string {
  let cleaned = text.trim();
  
  // Remove markdown code blocks (```json ... ``` or ``` ... ```)
  const codeBlockRegex = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/;
  const match = cleaned.match(codeBlockRegex);
  if (match) {
    cleaned = match[1].trim();
  }
  
  // Remove leading/trailing backticks if present
  cleaned = cleaned.replace(/^`+|`+$/g, '');
  
  return cleaned.trim();
}

/**
 * Sanitizes LLM response text by removing common formatting artifacts
 * that prevent JSON parsing. Includes cleanJsonOutput plus additional preamble removal.
 */
function sanitizeJsonResponse(text: string): string {
  // Start with markdown/fence removal
  let cleaned = cleanJsonOutput(text);
  
  // Remove common LLM preambles
  const preamblePatterns = [
    /^(?:Here(?:'s| is) (?:the )?(?:JSON|response|output|result)[:.]?\s*)/i,
    /^(?:The (?:JSON|response|output|result) is[:.]?\s*)/i,
    /^(?:Response[:.]?\s*)/i,
    /^(?:Output[:.]?\s*)/i,
  ];
  
  for (const pattern of preamblePatterns) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  // Remove trailing explanations after JSON
  // Look for closing brace/bracket followed by explanation text
  const jsonEndRegex = /([\}\]])\s*\n\s*(?:This|Note|I |The |Please|Hope)/;
  const jsonEndMatch = cleaned.match(jsonEndRegex);
  if (jsonEndMatch) {
    const endIndex = cleaned.indexOf(jsonEndMatch[0]) + 1;
    cleaned = cleaned.substring(0, endIndex);
  }
  
  return cleaned.trim();
}

/**
 * Attempts to extract valid JSON from a potentially malformed response.
 * Tries multiple strategies to find parseable JSON.
 */
function extractJson(text: string): string | null {
  // Strategy 1: Direct parse after sanitization
  const sanitized = sanitizeJsonResponse(text);
  try {
    JSON.parse(sanitized);
    return sanitized;
  } catch {
    // Continue to other strategies
  }
  
  // Strategy 2: Find JSON object boundaries
  const objectStart = text.indexOf('{');
  const objectEnd = text.lastIndexOf('}');
  if (objectStart !== -1 && objectEnd > objectStart) {
    const extracted = text.substring(objectStart, objectEnd + 1);
    try {
      JSON.parse(extracted);
      return extracted;
    } catch {
      // Continue
    }
  }
  
  // Strategy 3: Find JSON array boundaries
  const arrayStart = text.indexOf('[');
  const arrayEnd = text.lastIndexOf(']');
  if (arrayStart !== -1 && arrayEnd > arrayStart) {
    const extracted = text.substring(arrayStart, arrayEnd + 1);
    try {
      JSON.parse(extracted);
      return extracted;
    } catch {
      // Continue
    }
  }
  
  return null;
}

/**
 * Parse result with metadata about parsing success
 */
export interface ParseResult<T> {
  success: boolean;
  data: T | null;
  error?: string;
  sanitized?: boolean;
  rawResponse?: string;
}

export interface ParseFailureContext {
  error: string;
  rawResponse?: string | null;
  snippet?: string;
  sanitized?: boolean;
}

export interface ParseOptions {
  onFailure?: (context: ParseFailureContext) => void;
}

function safeReportError(error: unknown, context?: unknown): void {
  try {
    reportError(error, (context as ErrorContext | undefined));
  } catch {
    // Swallow telemetry errors to avoid crashing the app
  }
}

/**
 * Safely parses JSON from an LLM response with automatic sanitization.
 * 
 * @param response - Raw text response from LLM
 * @param fallback - Default value if parsing fails entirely
 * @returns ParseResult with parsed data or fallback
 */
export function safeParseJson<T>(
  response: string | undefined | null,
  fallback: T,
  options?: ParseOptions
): ParseResult<T> {
  const notifyFailure = (errorMessage: string, sanitized: boolean = false) => {
    const snippet = response ? response.substring(0, 200) : undefined;
    const context: ParseFailureContext = {
      error: errorMessage,
      rawResponse: response,
      snippet,
      sanitized,
    };
    safeReportError(new Error(errorMessage), context);
    options?.onFailure?.(context);
  };

  if (!response) {
    notifyFailure('Empty response received');
    return {
      success: false,
      data: fallback,
      error: 'Empty response received',
      rawResponse: response ?? undefined,
    };
  }
  
  // First try: direct parse
  try {
    const data = JSON.parse(response) as T;
    return { success: true, data };
  } catch {
    // Continue to sanitization
  }
  
  // Second try: sanitize and extract
  const extracted = extractJson(response);
  if (extracted) {
    try {
      const data = JSON.parse(extracted) as T;
      return { 
        success: true, 
        data, 
        sanitized: true,
        rawResponse: response,
      };
    } catch {
      // Continue to fallback
    }
  }
  
  // Final: return fallback
  notifyFailure('Failed to parse JSON after sanitization', Boolean(extracted));
  return {
    success: false,
    data: fallback,
    error: `Failed to parse JSON after sanitization. Raw: ${response.substring(0, 200)}...`,
    rawResponse: response,
  };
}

/**
 * Parses JSON with validation function.
 * Useful for ensuring response matches expected schema.
 */
export function safeParseJsonWithValidation<T>(
  response: string | undefined | null,
  validator: (data: unknown) => data is T,
  fallback: T
): ParseResult<T> {
  const result = safeParseJson<unknown>(response, null);
  
  if (!result.success || result.data === null) {
    return {
      success: false,
      data: fallback,
      error: result.error,
      rawResponse: result.rawResponse,
    };
  }
  
  if (validator(result.data)) {
    return {
      success: true,
      data: result.data,
      sanitized: result.sanitized,
    };
  }

  safeReportError(new Error('Response does not match expected schema'), {
    rawResponse: result.rawResponse,
  });
  
  return {
    success: false,
    data: fallback,
    error: 'Response does not match expected schema',
    rawResponse: result.rawResponse,
  };
}

/**
 * Type guard helpers for common response shapes
 */
export const validators = {
  isArray: (data: unknown): data is unknown[] => Array.isArray(data),
  
  isObject: (data: unknown): data is Record<string, unknown> => 
    typeof data === 'object' && data !== null && !Array.isArray(data),
  
  hasProperty: <K extends string>(data: unknown, key: K): data is Record<K, unknown> =>
    validators.isObject(data) && key in data,
  
  isVariationsResponse: (data: unknown): data is { variations: string[] } =>
    validators.hasProperty(data, 'variations') && Array.isArray(data.variations),
};
import { reportError, ErrorContext } from '@/services/telemetry/errorReporter';
