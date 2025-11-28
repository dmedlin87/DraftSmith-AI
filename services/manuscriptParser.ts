export interface ParsedChapter {
  title: string;
  content: string;
}

/**
 * Main entry point for parsing a raw text dump into structured chapters.
 */
export function parseManuscript(rawText: string): ParsedChapter[] {
  // 1. Clean Artifacts (Page numbers, recurring headers)
  const cleanText = stripArtifacts(rawText);

  // 2. Split Chapters based on heuristics
  return splitChapters(cleanText);
}

/**
 * Removes common page headers/footers often found in text dumps.
 */
function stripArtifacts(text: string): string {
  // Regex patterns for common artifacts
  const patterns = [
    // Page Numbers on their own line (e.g. "12", "Page 12", "12 of 300")
    /^\s*(?:Page\s+)?\d+(?:\s+of\s+\d+)?\s*$/gmi,
    
    // Common PDF conversion artifacts (e.g. "Copyright 2024")
    /^\s*Copyright\s+.*$/gmi,
    
    // Recurring header separator lines
    /^\s*[-=_]{3,}\s*$/gm
  ];

  let cleaned = text;
  patterns.forEach(pattern => {
    cleaned = cleaned.replace(pattern, '');
  });

  return cleaned;
}

/**
 * Splits text into chapters using multiple heuristic strategies.
 */
function splitChapters(text: string): ParsedChapter[] {
  const chapters: ParsedChapter[] = [];

  // Strategy A: Explicit Headers
  // Matches: "Chapter 1", "PART II", "Prologue", "Epilogue", "Book One"
  // Case insensitive, allows for optional markdown headers (# Chapter 1)
  const explicitHeaderRegex = /^(?:#{1,6}\s+)?(?:CHAPTER|PART|BOOK|PROLOGUE|EPILOGUE)\b.*$/gmi;
  
  // Strategy B: Roman Numerals on their own line
  // Matches: "I", "IV", "XIV" surrounded by newlines
  const romanNumeralRegex = /^[IVXLCDM]+$/gm;

  // Combine regexes to find all split points
  // We use a sticky regex approach or matchAll to iterate
  const combinedRegex = new RegExp(
    `${explicitHeaderRegex.source}|${romanNumeralRegex.source}`, 
    'gmi'
  );

  const matches = [...text.matchAll(combinedRegex)];

  // Fallback: If no headers found, check for "Large Whitespace + All Caps" pattern
  // Common in PDF to Text conversions where visual spacing denotes chapters
  if (matches.length === 0) {
      // Look for 3+ newlines followed by a short line of Uppercase text
      const whitespaceRegex = /\n{3,}([A-Z0-9\s\p{P}]{3,50})\n/gu;
      const wsMatches = [...text.matchAll(whitespaceRegex)];
      
      if (wsMatches.length > 0) {
          // Use whitespace matches as split points
          wsMatches.forEach((match, i) => {
              const start = match.index!;
              const title = match[1].trim(); // The captured group is the title
              
              // Add previous section (if it's the first one, it might be prologue)
              if (i === 0 && start > 0) {
                   const preContent = text.substring(0, start).trim();
                   if (preContent) chapters.push({ title: 'Prologue / Front Matter', content: preContent });
              }

              const nextMatch = wsMatches[i+1];
              const end = nextMatch ? nextMatch.index! : text.length;
              // Content is from end of this match to start of next
              const content = text.substring(start + match[0].length, end).trim();
              
              chapters.push({ title: title || `Chapter ${i+1}`, content });
          });
          return chapters.length > 0 ? chapters : [{ title: 'Chapter 1', content: text.trim() }];
      }

      // Final Fallback: Single Chapter
      return [{ title: 'Chapter 1', content: text.trim() }];
  }

  // Process Regex Matches
  if (matches[0].index && matches[0].index > 0) {
      const prologue = text.substring(0, matches[0].index).trim();
      if (prologue) {
          chapters.push({ title: 'Prologue / Front Matter', content: prologue });
      }
  }

  for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const start = match.index!;
      const nextMatch = matches[i + 1];
      const end = nextMatch ? nextMatch.index! : text.length;

      // Extract raw section including the header line
      const fullSection = text.substring(start, end);
      const lines = fullSection.split('\n').filter(l => l.trim().length > 0);
      
      if (lines.length === 0) continue;

      let rawTitle = lines[0].trim().replace(/^#{1,6}\s+/, ''); // Clean MD
      let content = lines.slice(1).join('\n').trim();

      // Title Extraction Heuristics
      let title = rawTitle;

      // 1. Colon Extraction: "Chapter 1: The Beginning" -> "The Beginning"
      if (title.includes(':')) {
          const parts = title.split(':');
          if (parts.length > 1) title = parts.slice(1).join(':').trim();
      }
      // 2. Dash Extraction: "Chapter 5 - The Road" -> "The Road"
      else if (title.includes(' - ')) {
          const parts = title.split(' - ');
          if (parts.length > 1) title = parts[1].trim();
      }
      // 3. Next Line Extraction: Header is "Chapter 1", next line is "THE ARRIVAL"
      else if (lines.length > 1) {
          const nextLine = lines[1].trim();
          
          // Heuristics for title detection
          const isShort = nextLine.length > 0 && nextLine.length < 100;
          
          // Exclude typical paragraph endings (period, quote+period). 
          // Titles can end in ? or ! but usually not .
          const hasSentenceEnding = /[.](?:"|')?\s*$/.test(nextLine);
          
          // All Caps check (common in manuscript headings)
          const isAllCaps = /^[A-Z0-9\s\p{P}]+$/u.test(nextLine) && /[A-Z]/.test(nextLine);
          
          // Capitalized start check (Title Case or Sentence Case)
          const startsWithCap = /^[A-Z]/.test(nextLine);

          // Valid title candidate?
          // It must be short AND (All Caps OR (Capitalized start AND not a full sentence))
          if (isShort && (isAllCaps || (startsWithCap && !hasSentenceEnding))) {
               // We found a title on the next line!
               // Format as "Chapter X: The Title"
               title = `${rawTitle}: ${nextLine}`;
               
               // Consume the line from the content
               content = lines.slice(2).join('\n').trim();
          }
      }

      chapters.push({ title, content });
  }

  return chapters;
}