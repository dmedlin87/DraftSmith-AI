/**
 * Structural Parser
 * 
 * Deterministic analysis of manuscript structure:
 * - Scene detection and classification
 * - Paragraph typing (dialogue, action, description, etc.)
 * - Dialogue extraction with speaker attribution
 * - Structural statistics
 */

import {
  Scene,
  SceneType,
  ClassifiedParagraph,
  ParagraphType,
  DialogueLine,
  StructuralStats,
  StructuralFingerprint,
} from '../../types/intelligence';

// ─────────────────────────────────────────────────────────────────────────────
// LEXICONS & PATTERNS
// ─────────────────────────────────────────────────────────────────────────────

// Scene break patterns (zero-length matches removed to prevent infinite loops)
const SCENE_BREAK_PATTERNS = [
  /^#{1,3}\s*/m,                                    // Markdown headers (### or ### text)
  /^\*\s*\*\s*\*.*$/m,                              // Spaced asterisks (* * *)
  /^\*{3,}$/m,                                      // *** dividers
  /^-{3,}$/m,                                       // --- dividers
  /^Chapter\s+\d+/im,                               // Chapter headings (Chapter 1, Chapter 2, etc.)
  // Note: Multiple blank lines handled separately in detectScenes
];

// Time markers for scene classification
const TIME_MARKERS = [
  /\b(morning|dawn|sunrise|daybreak)\b/i,
  /\b(afternoon|midday|noon)\b/i,
  /\b(evening|dusk|sunset|twilight)\b/i,
  /\b(night|midnight|dark)\b/i,
  /\b(\d+\s*(hours?|minutes?|days?|weeks?|months?|years?)\s*(later|earlier|ago|before|after))\b/i,
  /\b(the\s+next\s+(day|morning|week|month|year))\b/i,
  /\b(that\s+(night|morning|evening|afternoon))\b/i,
  /\b(meanwhile|simultaneously|at\s+the\s+same\s+time)\b/i,
];

// Location indicators
const LOCATION_PATTERNS = [
  /\b(in|at|inside|outside|within|near|by)\s+the\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g,
  /\b(entered|arrived\s+at|reached|approached)\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g,
];

// Tension indicators (positive = high tension)
const TENSION_WORDS = {
  high: [
    'suddenly', 'screamed', 'shouted', 'gasped', 'rushed', 'ran', 'fled',
    'attacked', 'fought', 'struggled', 'desperate', 'terrified', 'horror',
    'danger', 'threat', 'death', 'kill', 'blood', 'pain', 'fear', 'panic',
    'explosion', 'crash', 'shattered', 'slammed', 'raced', 'chased',
  ],
  low: [
    'slowly', 'gently', 'peacefully', 'calmly', 'quietly', 'softly',
    'relaxed', 'comfortable', 'pleasant', 'smiled', 'laughed', 'enjoyed',
    'rested', 'slept', 'dreamed', 'wandered', 'strolled', 'lingered',
  ],
};

// Dialogue patterns
const DIALOGUE_PATTERN = /"([^"]+)"/g;
const DIALOGUE_TAG_PATTERN = /["'].*?["']\s*,?\s*(?:said|asked|replied|whispered|shouted|muttered|exclaimed|growled|hissed|murmured|called|cried|demanded|insisted|suggested|answered|responded|continued|added|admitted|agreed|announced|argued|began|begged|bellowed|blurted|boasted|breathed|chimed|choked|claimed|commented|complained|conceded|concluded|confessed|confided|confirmed|considered|corrected|countered|croaked|declared|denied|drawled|echoed|elaborated|encouraged|explained|finished|gasped|giggled|grinned|groaned|grumbled|grunted|guessed|huffed|implied|informed|inquired|insisted|instructed|interjected|interrupted|joked|laughed|lied|lisped|maintained|mentioned|mimicked|moaned|mocked|mumbled|mused|noted|objected|observed|offered|ordered|panted|paused|persisted|piped|pleaded|pointed|pondered|pouted|praised|prayed|predicted|proclaimed|promised|proposed|protested|provoked|purred|puzzled|quipped|quoted|rambled|ranted|reasoned|recalled|reckoned|recounted|reflected|refused|remarked|reminded|repeated|reported|requested|resumed|retorted|revealed|roared|sang|scoffed|scolded|screamed|sighed|slurred|smiled|smirked|snapped|snarled|sneered|snickered|sniffed|snorted|sobbed|speculated|spluttered|squeaked|squealed|stammered|started|stated|stormed|stressed|stuttered|surmised|taunted|teased|testified|thanked|thought|threatened|thundered|told|trailed|urged|uttered|ventured|voiced|volunteered|vowed|wailed|warned|wept|whimpered|whined|whispered|wondered|worried|yawned|yelled|yelped)\s+(\w+)/gi;

// Action verbs for paragraph classification
const ACTION_VERBS = [
  'ran', 'walked', 'jumped', 'grabbed', 'threw', 'hit', 'kicked', 'pulled',
  'pushed', 'climbed', 'fell', 'dropped', 'caught', 'opened', 'closed',
  'turned', 'moved', 'rushed', 'charged', 'attacked', 'defended', 'blocked',
  'dodged', 'swung', 'struck', 'slashed', 'stabbed', 'shot', 'fired',
];

// Exposition indicators (world-building, history, background info)
const EXPOSITION_PATTERNS = [
  /\b(centuries?|decades?|years?)\s+(ago|earlier|before|later)\b/i,
  /\b(founded|established|built|created|formed|originated)\b/i,
  /\b(history|origins?|background|tradition)\b/i,
  /\b(architecture|culture|society|civilization)\b/i,
];

// Description indicators (sensory, visual details)
const DESCRIPTION_PATTERNS = [
  /\b(appeared|seemed|looked)\s+\w+/i,
  /\bthe\s+\w+\s+(was|were)\s+(covered|painted|decorated|filled)/i,
];

// Internal thought indicators (require subject context to avoid false positives)
const INTERNAL_PATTERNS = [
  /\b(she|he|i|they)\s+(thought|wondered|realized|remembered|recalled|considered|pondered|mused|reflected)\b/i,
  /\b(she|he|i|they)\s+(felt|sensed|knew|understood|believed|hoped|feared|wished|wanted)\b/i,
  /\bthought\s+(about|of|to)\b/i,
  /\bwondered\s+(if|whether|about|why|how)\b/i,
];

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

const generateId = (): string => Math.random().toString(36).substring(2, 11);

const countWords = (text: string): number => {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
};

const countSentences = (text: string): number => {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  return sentences.length;
};

const extractSentences = (text: string): string[] => {
  return text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
};

const calculateSentiment = (text: string): number => {
  const words = text.toLowerCase().split(/\s+/);
  let score = 0;
  
  // Simple sentiment lexicon
  const positive = ['happy', 'joy', 'love', 'wonderful', 'beautiful', 'great', 'good', 'smiled', 'laughed', 'hope', 'peace', 'warm', 'bright', 'calm'];
  const negative = ['sad', 'angry', 'hate', 'terrible', 'awful', 'bad', 'fear', 'pain', 'dark', 'cold', 'death', 'kill', 'hurt', 'cry', 'scream'];
  
  for (const word of words) {
    if (positive.includes(word)) score += 0.1;
    if (negative.includes(word)) score -= 0.1;
  }
  
  return Math.max(-1, Math.min(1, score));
};

const calculateTension = (text: string): number => {
  const words = text.toLowerCase().split(/\s+/);
  let tensionScore = 0.5; // Baseline
  
  for (const word of words) {
    if (TENSION_WORDS.high.includes(word)) tensionScore += 0.05;
    if (TENSION_WORDS.low.includes(word)) tensionScore -= 0.03;
  }
  
  // Short, punchy sentences increase tension
  const sentences = extractSentences(text);
  const avgLength = sentences.reduce((sum, s) => sum + countWords(s), 0) / (sentences.length || 1);
  if (avgLength < 8) tensionScore += 0.1;
  if (avgLength > 25) tensionScore -= 0.1;
  
  // Exclamation marks increase tension
  const exclamations = (text.match(/!/g) || []).length;
  tensionScore += exclamations * 0.02;
  
  return Math.max(0, Math.min(1, tensionScore));
};

// ─────────────────────────────────────────────────────────────────────────────
// PARAGRAPH CLASSIFICATION
// ─────────────────────────────────────────────────────────────────────────────

const classifyParagraph = (text: string): ParagraphType => {
  const trimmed = text.trim();
  
  // Check for dialogue first (most distinctive)
  const dialogueMatches = trimmed.match(DIALOGUE_PATTERN);
  if (dialogueMatches) {
    const dialogueLength = dialogueMatches.reduce((sum, m) => sum + m.length, 0);
    if (dialogueLength > trimmed.length * 0.5) {
      return 'dialogue';
    }
  }
  
  // Check for internal thoughts
  if (INTERNAL_PATTERNS.some(p => p.test(trimmed))) {
    return 'internal';
  }
  
  // Check for action
  const words = trimmed.toLowerCase().split(/\s+/);
  const actionCount = words.filter(w => ACTION_VERBS.includes(w)).length;
  if (actionCount >= 2 || (actionCount >= 1 && words.length < 20)) {
    return 'action';
  }
  
  // Check for exposition (history, world-building)
  if (EXPOSITION_PATTERNS.some(p => p.test(trimmed))) {
    return 'exposition';
  }
  
  // Check for description (sensory details)
  if (DESCRIPTION_PATTERNS.some(p => p.test(trimmed))) {
    return 'description';
  }
  
  // Default to description for remaining prose
  return 'description';
};

const extractSpeaker = (paragraphText: string): string | null => {
  // Look for dialogue attribution patterns
  const match = paragraphText.match(DIALOGUE_TAG_PATTERN);
  if (match) {
    // The speaker name is typically the last captured group
    const potentialName = match[match.length - 1];
    if (potentialName && /^[A-Z]/.test(potentialName)) {
      return potentialName;
    }
  }
  
  // Try pattern: "dialogue," Name said/asked/etc.
  const nameFirstMatch = paragraphText.match(/["']\s*,?\s*([A-Z][a-z]+)\s+(?:said|asked|replied|whispered|shouted|muttered|exclaimed)/i);
  if (nameFirstMatch && nameFirstMatch[1]) {
    return nameFirstMatch[1];
  }
  
  // Try pattern: "dialogue" said/asked/etc. Name
  const simpleMatch = paragraphText.match(/["']\s*,?\s*(?:said|asked|replied)\s+(\w+)/i);
  if (simpleMatch && /^[A-Z]/.test(simpleMatch[1])) {
    return simpleMatch[1];
  }
  
  return null;
};

export const parseParagraphs = (text: string): ClassifiedParagraph[] => {
  const paragraphs: ClassifiedParagraph[] = [];
  
  // Split by double newlines or more
  const rawParagraphs = text.split(/\n\s*\n/);
  let offset = 0;
  
  for (const para of rawParagraphs) {
    const trimmed = para.trim();
    if (trimmed.length === 0) {
      offset += para.length + 2; // Account for the newlines
      continue;
    }
    
    const sentences = extractSentences(trimmed);
    const sentenceCount = sentences.length;
    const avgSentenceLength = sentenceCount > 0 
      ? sentences.reduce((sum, s) => sum + countWords(s), 0) / sentenceCount 
      : 0;
    
    paragraphs.push({
      offset: text.indexOf(para, offset),
      length: para.length,
      type: classifyParagraph(trimmed),
      speakerId: extractSpeaker(trimmed),
      sentiment: calculateSentiment(trimmed),
      tension: calculateTension(trimmed),
      sentenceCount,
      avgSentenceLength,
    });
    
    offset = text.indexOf(para, offset) + para.length;
  }
  
  return paragraphs;
};

// ─────────────────────────────────────────────────────────────────────────────
// DIALOGUE EXTRACTION
// ─────────────────────────────────────────────────────────────────────────────

export const extractDialogue = (text: string): DialogueLine[] => {
  const dialogues: DialogueLine[] = [];
  let lastDialogueId: string | null = null;
  let currentConversationSpeaker: string | null = null;
  
  // Find all quoted text
  const quotePattern = /["']([^"']+)["']/g;
  let match;
  
  while ((match = quotePattern.exec(text)) !== null) {
    const quote = match[1];
    const offset = match.index;
    
    // Look for speaker in surrounding context
    const contextStart = Math.max(0, offset - 100);
    const contextEnd = Math.min(text.length, offset + match[0].length + 100);
    const context = text.slice(contextStart, contextEnd);
    
    let speaker = extractSpeaker(context);
    
    // Track conversation flow
    const isNewConversation = lastDialogueId === null || 
      (offset - (dialogues[dialogues.length - 1]?.offset || 0)) > 500;
    
    if (isNewConversation) {
      currentConversationSpeaker = null;
      lastDialogueId = null;
    }
    
    const id = generateId();
    
    dialogues.push({
      id,
      quote,
      speaker,
      offset,
      length: match[0].length,
      replyTo: lastDialogueId,
      sentiment: calculateSentiment(quote),
    });
    
    lastDialogueId = id;
    if (speaker) currentConversationSpeaker = speaker;
  }
  
  return dialogues;
};

// ─────────────────────────────────────────────────────────────────────────────
// SCENE DETECTION
// ─────────────────────────────────────────────────────────────────────────────

const detectSceneType = (paragraphs: ClassifiedParagraph[]): SceneType => {
  if (paragraphs.length === 0) return 'transition';
  
  const typeCounts: Record<ParagraphType, number> = {
    dialogue: 0,
    action: 0,
    description: 0,
    internal: 0,
    exposition: 0,
  };
  
  for (const para of paragraphs) {
    typeCounts[para.type]++;
  }
  
  const total = paragraphs.length;
  
  // Determine scene type based on dominant paragraph types
  if (typeCounts.dialogue / total > 0.5) return 'dialogue';
  if (typeCounts.action / total > 0.4) return 'action';
  if (typeCounts.internal / total > 0.4) return 'introspection';
  if (typeCounts.description / total > 0.5) return 'description';
  
  return 'transition';
};

const extractTimeMarker = (text: string): string | null => {
  for (const pattern of TIME_MARKERS) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
};

const extractLocation = (text: string): string | null => {
  for (const pattern of LOCATION_PATTERNS) {
    const match = pattern.exec(text);
    if (match) return match[2] || match[1];
  }
  return null;
};

const extractPOV = (text: string, paragraphs: ClassifiedParagraph[]): string | null => {
  // Look for most frequently mentioned character in dialogue attribution
  const speakers: Record<string, number> = {};
  
  for (const para of paragraphs) {
    if (para.speakerId) {
      speakers[para.speakerId] = (speakers[para.speakerId] || 0) + 1;
    }
  }
  
  // Also look for "I" / first-person indicators
  if (/\bI\s+(was|am|had|have|thought|felt|saw|heard|knew|said|asked)\b/i.test(text)) {
    return 'First Person';
  }
  
  // Also look for "he/she thought" or "he/she felt" patterns
  const povMatch = text.match(/\b(He|She|They)\s+(thought|felt|knew|realized|wondered|sensed)\b/i);
  if (povMatch) {
    // Try to find the character name before this
    const beforeContext = text.slice(Math.max(0, text.indexOf(povMatch[0]) - 200), text.indexOf(povMatch[0]));
    const nameMatch = beforeContext.match(/([A-Z][a-z]+)\s+(?:was|had|felt|thought|looked)/);
    if (nameMatch) return nameMatch[1];
  }
  
  // Return most frequent speaker as fallback
  const sorted = Object.entries(speakers).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] || null;
};

export const detectScenes = (text: string, paragraphs: ClassifiedParagraph[]): Scene[] => {
  const scenes: Scene[] = [];
  
  // Find scene breaks
  const breakPoints: number[] = [0];
  
  // Check for explicit scene breaks
  for (const pattern of SCENE_BREAK_PATTERNS) {
    let match;
    const regex = new RegExp(pattern.source, 'gm');
    while ((match = regex.exec(text)) !== null) {
      breakPoints.push(match.index);
    }
  }
  
  // Also break on significant time jumps (multiple blank lines)
  const blankLinePattern = /\n\s*\n\s*\n/g;
  let match;
  while ((match = blankLinePattern.exec(text)) !== null) {
    breakPoints.push(match.index);
  }
  
  breakPoints.push(text.length);
  
  // Dedupe and sort
  const sortedBreaks = [...new Set(breakPoints)].sort((a, b) => a - b);
  
  // Create scenes from break points
  for (let i = 0; i < sortedBreaks.length - 1; i++) {
    const startOffset = sortedBreaks[i];
    const endOffset = sortedBreaks[i + 1];
    
    if (endOffset - startOffset < 10) continue; // Skip tiny fragments (dividers, empty sections)
    
    const sceneText = text.slice(startOffset, endOffset);
    const sceneParagraphs = paragraphs.filter(
      p => p.offset >= startOffset && p.offset < endOffset
    );
    
    if (sceneParagraphs.length === 0) continue;
    
    // Calculate dialogue ratio
    const dialogueParagraphs = sceneParagraphs.filter(p => p.type === 'dialogue');
    const dialogueRatio = dialogueParagraphs.length / sceneParagraphs.length;
    
    // Calculate average tension
    const avgTension = sceneParagraphs.reduce((sum, p) => sum + p.tension, 0) / sceneParagraphs.length;
    
    scenes.push({
      id: generateId(),
      startOffset,
      endOffset,
      type: detectSceneType(sceneParagraphs),
      pov: extractPOV(sceneText, sceneParagraphs),
      location: extractLocation(sceneText),
      timeMarker: extractTimeMarker(sceneText),
      tension: avgTension,
      dialogueRatio,
    });
  }
  
  return scenes;
};

// ─────────────────────────────────────────────────────────────────────────────
// STRUCTURAL STATISTICS
// ─────────────────────────────────────────────────────────────────────────────

export const calculateStats = (
  text: string,
  paragraphs: ClassifiedParagraph[],
  scenes: Scene[],
  dialogues: DialogueLine[]
): StructuralStats => {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const sentences = extractSentences(text);
  
  const sentenceLengths = sentences.map(s => countWords(s));
  const avgSentenceLength = sentenceLengths.length > 0 
    ? sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length 
    : 0;
  
  const variance = sentenceLengths.length > 0
    ? sentenceLengths.reduce((sum, len) => sum + Math.pow(len - avgSentenceLength, 2), 0) / sentenceLengths.length
    : 0;
  
  // Calculate dialogue ratio
  const dialogueWords = dialogues.reduce((sum, d) => sum + countWords(d.quote), 0);
  const dialogueRatio = words.length > 0 ? dialogueWords / words.length : 0;
  
  // Count POV shifts
  const povs = scenes.map(s => s.pov).filter(Boolean);
  let povShifts = 0;
  for (let i = 1; i < povs.length; i++) {
    if (povs[i] !== povs[i - 1]) povShifts++;
  }
  
  // Average scene length
  const avgSceneLength = scenes.length > 0
    ? scenes.reduce((sum, s) => sum + (s.endOffset - s.startOffset), 0) / scenes.length
    : 0;
  
  return {
    totalWords: words.length,
    totalSentences: sentences.length,
    totalParagraphs: paragraphs.length,
    avgSentenceLength,
    sentenceLengthVariance: Math.sqrt(variance),
    dialogueRatio,
    sceneCount: scenes.length,
    povShifts,
    avgSceneLength,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────

export const parseStructure = (text: string): StructuralFingerprint => {
  // Guard against empty or whitespace-only text
  if (!text || !text.trim()) {
    return {
      scenes: [],
      paragraphs: [],
      dialogueMap: [],
      stats: {
        totalWords: 0,
        totalSentences: 0,
        totalParagraphs: 0,
        avgSentenceLength: 0,
        sentenceLengthVariance: 0,
        dialogueRatio: 0,
        sceneCount: 0,
        povShifts: 0,
        avgSceneLength: 0,
      },
      processedAt: Date.now(),
    };
  }

  const paragraphs = parseParagraphs(text);
  const dialogueMap = extractDialogue(text);
  const scenes = detectScenes(text, paragraphs);
  const stats = calculateStats(text, paragraphs, scenes, dialogueMap);
  
  return {
    scenes,
    paragraphs,
    dialogueMap,
    stats,
    processedAt: Date.now(),
  };
};

// Quick accessor for current scene at cursor position
export const getSceneAtOffset = (
  fingerprint: StructuralFingerprint,
  offset: number
): Scene | null => {
  return fingerprint.scenes.find(
    s => offset >= s.startOffset && offset < s.endOffset
  ) || null;
};

// Quick accessor for current paragraph at cursor position
export const getParagraphAtOffset = (
  fingerprint: StructuralFingerprint,
  offset: number
): ClassifiedParagraph | null => {
  return fingerprint.paragraphs.find(
    p => offset >= p.offset && offset < p.offset + p.length
  ) || null;
};
