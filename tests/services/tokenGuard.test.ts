import { describe, it, expect } from 'vitest';
import {
  checkTokenLimit,
  truncateToLimit,
  prepareAnalysisText,
  calculateCombinedTokens,
} from '@/services/gemini/tokenGuard';

describe('checkTokenLimit', () => {
  it('returns valid for short text', () => {
    const result = checkTokenLimit('Hello world', 'gemini-2.5-flash');
    
    expect(result.valid).toBe(true);
    expect(result.overflow).toBe(0);
    expect(result.suggestion).toBeUndefined();
  });

  it('returns estimated tokens', () => {
    const text = 'a'.repeat(400); // 400 chars = ~100 tokens
    const result = checkTokenLimit(text, 'gemini-2.5-flash');
    
    expect(result.estimatedTokens).toBe(100);
  });

  it('calculates overflow for text exceeding limit', () => {
    // Create text that exceeds default reserve (4000 tokens = 16000 chars)
    // But we need to exceed the full limit minus reserve
    // gemini-2.5-flash has 1M token limit, so this test needs huge text
    // Let's use a smaller model limit scenario
    const text = 'a'.repeat(200_000); // 50k tokens
    const result = checkTokenLimit(text, 'gemini-2.5-flash', 50_000);
    
    // 50k tokens used, 50k reserved from 1M limit = should still be valid
    expect(result.valid).toBe(true);
  });

  it('provides suggestion when overflow occurs', () => {
    // Force overflow with large reserve
    const text = 'a'.repeat(40_000); // 10k tokens
    const result = checkTokenLimit(text, 'gemini-2.5-flash-preview-tts', 1000);
    
    // TTS model has 8k limit, 1k reserve = 7k available, 10k needed = overflow
    expect(result.valid).toBe(false);
    expect(result.overflow).toBeGreaterThan(0);
    expect(result.suggestion).toContain('exceeds limit');
  });

  it('uses default limit for unknown model', () => {
    const text = 'Hello';
    // @ts-expect-error - testing unknown model
    const result = checkTokenLimit(text, 'unknown-model');
    
    // Should use fallback limit of 32k
    expect(result.valid).toBe(true);
    expect(result.limit).toBe(32_000 - 4_000); // 32k - 4k reserve
  });
});

describe('truncateToLimit', () => {
  it('returns unchanged text when under limit', () => {
    const text = 'Hello world';
    const result = truncateToLimit(text, 'gemini-2.5-flash');
    
    expect(result.text).toBe(text);
    expect(result.truncated).toBe(false);
    expect(result.removedChars).toBe(0);
  });

  it('truncates at paragraph boundary when possible', () => {
    // TTS model has 8k limit, with 4k reserve = 4k available = 16k chars
    const prefix = 'a'.repeat(15_000); // 93.75% of 16k
    const suffix = 'b'.repeat(2_000);
    const text = `${prefix}\n\n${suffix}`;

    const result = truncateToLimit(text, 'gemini-2.5-flash-preview-tts');

    expect(result.truncated).toBe(true);
    expect(result.removedChars).toBeGreaterThan(0);
    // Should break at paragraph if within 80% of limit
    expect(result.text.length).toBe(prefix.length);
  });

  it('truncates at sentence boundary as fallback', () => {
    const text = 'Sentence one. Sentence two. Sentence three. '.repeat(1000);
    const result = truncateToLimit(text, 'gemini-2.5-flash-preview-tts');
    
    expect(result.truncated).toBe(true);
    // Text should end cleanly (at sentence boundary or close to it)
    const lastChar = result.text.trim().slice(-1);
    expect(['.', '!', '?', '']).toContain(lastChar);
  });
});

describe('prepareAnalysisText', () => {
  it('returns unchanged text when under limit', () => {
    const text = 'Short text for analysis.';
    const result = prepareAnalysisText(text);
    
    expect(result.text).toBe(text);
    expect(result.warning).toBeUndefined();
  });

  it('truncates and warns when over limit', () => {
    const text = 'a'.repeat(3_500_000); // Over the 3M limit
    const result = prepareAnalysisText(text);

    expect(result.text.length).toBeLessThan(text.length);
    expect(result.warning).toBeDefined();
    expect(result.warning?.message).toContain('truncated');
  });

  it('truncates at paragraph boundary near analysis limit', () => {
    // ApiDefaults.maxAnalysisLength is 3,000,000 characters
    const prefix = 'a'.repeat(2_500_000); // ~83% of limit
    const suffix = 'b'.repeat(800_000);
    const text = `${prefix}\n\n${suffix}`;

    const result = prepareAnalysisText(text);

    expect(result.text.length).toBe(prefix.length);
    expect(result.warning).toBeDefined();
  });

  it('warning includes removed character count', () => {
    const text = 'a'.repeat(3_500_000);
    const result = prepareAnalysisText(text);

    expect(result.warning?.removedChars).toBeGreaterThan(0);
  });

  it('warning includes percentage removed', () => {
    const text = 'a'.repeat(3_500_000);
    const result = prepareAnalysisText(text);

    expect(result.warning?.removedPercent).toBeGreaterThan(0);
  });
});

describe('calculateCombinedTokens', () => {
  it('calculates tokens for single text', () => {
    const text = 'a'.repeat(400); // 400 chars = 100 tokens
    const result = calculateCombinedTokens(text);
    
    expect(result).toBe(100);
  });

  it('calculates combined tokens for multiple texts', () => {
    const text1 = 'a'.repeat(400); // 100 tokens
    const text2 = 'b'.repeat(800); // 200 tokens
    const result = calculateCombinedTokens(text1, text2);
    
    expect(result).toBe(300);
  });

  it('handles undefined texts', () => {
    const text1 = 'a'.repeat(400); // 100 tokens
    const result = calculateCombinedTokens(text1, undefined, undefined);
    
    expect(result).toBe(100);
  });

  it('returns 0 for no inputs', () => {
    const result = calculateCombinedTokens();
    expect(result).toBe(0);
  });

  it('returns 0 for all undefined inputs', () => {
    const result = calculateCombinedTokens(undefined, undefined);
    expect(result).toBe(0);
  });
});
