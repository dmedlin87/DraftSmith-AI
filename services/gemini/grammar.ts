import { UsageMetadata } from '@google/genai';
import { GrammarSuggestion } from '@/types';

interface GrammarResponse {
  suggestions: GrammarSuggestion[];
  usage?: UsageMetadata;
}

const COMMON_REPLACEMENTS: Array<{ pattern: RegExp; replacement: string; message: string; severity: 'grammar' | 'style' }> = [
  { pattern: /\bteh\b/gi, replacement: 'the', message: 'Correct spelling to "the".', severity: 'grammar' },
  { pattern: /\brecieve\b/gi, replacement: 'receive', message: 'Correct spelling to "receive".', severity: 'grammar' },
  { pattern: / {2,}/g, replacement: ' ', message: 'Collapse repeated spaces.', severity: 'style' },
  { pattern: /\b alot\b/gi, replacement: ' a lot', message: 'Use "a lot" instead of "alot".', severity: 'grammar' },
];

const generateId = (() => {
  let counter = 0;
  return () => `grammar-${Date.now()}-${counter++}`;
})();

const buildSuggestions = (text: string): GrammarSuggestion[] => {
  const suggestions: GrammarSuggestion[] = [];

  COMMON_REPLACEMENTS.forEach(rule => {
    let match: RegExpExecArray | null;
    // Reset regex state for global patterns
    rule.pattern.lastIndex = 0;

    while ((match = rule.pattern.exec(text)) !== null) {
      const start = match.index;
      const end = match.index + match[0].length;
      suggestions.push({
        id: generateId(),
        start,
        end,
        replacement: match[0].replace(rule.pattern, rule.replacement),
        message: rule.message,
        severity: rule.severity,
        originalText: match[0],
      });
    }
  });

  return suggestions;
};

export const fetchGrammarSuggestions = async (
  text: string,
  signal?: AbortSignal
): Promise<GrammarResponse> => {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  // Deterministic, lightweight client-side checks to avoid API calls in tests.
  const suggestions = buildSuggestions(text);
  return { suggestions };
};
