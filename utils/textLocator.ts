export interface TextRange {
  start: number;
  end: number;
}

/**
 * Attempts to find the best match for a quote within the text.
 * It handles slight whitespace variations or LLM hallucinations (prefix matching).
 */
export const findQuoteRange = (fullText: string, quote: string): TextRange | null => {
  if (!fullText || !quote) return null;

  // 1. Try Exact Match
  let index = fullText.indexOf(quote);
  if (index !== -1) {
    return { start: index, end: index + quote.length };
  }

  // 2. Try Trimmed Match
  const trimmedQuote = quote.trim();
  index = fullText.indexOf(trimmedQuote);
  if (index !== -1) {
    return { start: index, end: index + trimmedQuote.length };
  }

  // 3. Try Partial Match (First 20 chars) - helpful if LLM hallucinates end of sentence
  if (trimmedQuote.length > 20) {
    const partial = trimmedQuote.substring(0, 20);
    index = fullText.indexOf(partial);
    if (index !== -1) {
        // We found the start. Let's try to verify if it's the right context.
        // We'll return a highlight for the length of the original quote, 
        // clamped to the document length.
        const end = Math.min(fullText.length, index + trimmedQuote.length);
        return { start: index, end };
    }
  }

  // 4. Normalized Whitespace Match (Heavy operation, use sparingly)
  // This helps when LLM returns single spaces but doc has newlines
  const normalize = (s: string) => s.replace(/\s+/g, ' ');
  const normText = normalize(fullText);
  const normQuote = normalize(trimmedQuote);
  
  index = normText.indexOf(normQuote);
  
  if (index !== -1) {
      // Mapping normalized index back to original index is complex.
      // We will skip strict mapping for this MVP and rely on the fact 
      // that index is *roughly* correct, though newlines might offset it.
      // A safe fallback is to search near this index in the real text.
      const snippet = trimmedQuote.substring(0, 10);
      const searchStart = Math.max(0, index - 50);
      const searchEnd = Math.min(fullText.length, index + 50);
      const localContext = fullText.substring(searchStart, searchEnd);
      const localIndex = localContext.indexOf(snippet);
      
      if (localIndex !== -1) {
          return { 
              start: searchStart + localIndex, 
              end: searchStart + localIndex + trimmedQuote.length 
          };
      }
  }

  return null;
};