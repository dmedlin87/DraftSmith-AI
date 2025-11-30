import {
  DialogueLine,
  VoiceFingerprint,
  VoiceProfile,
  VoiceMetrics,
} from '../../types/intelligence';

const CONTRACTION_REGEX = /n't\b|'re\b|'ll\b|'ve\b|'m\b/gi;
const LATINATE_SUFFIXES = ['tion', 'ment', 'ence', 'ity', 'ance', 'ology', 'ive', 'ary', 'ism', 'ist'];

const normalizeSpeaker = (name: string): string => {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
};

const tokenizeWords = (text: string): string[] => {
  return (text.toLowerCase().match(/\b[a-z0-9']+\b/g) ?? [])
    .map(token => token.replace(/^'+|'+$/g, ''))
    .map(token => token.trim())
    .filter(Boolean);
};

const splitSentences = (text: string): string[] => {
  return text
    .split(/(?<=[.!?])\s+/)
    .map(sentence => sentence.trim())
    .filter(Boolean);
};

const buildVoiceMetrics = (lines: DialogueLine[]): VoiceMetrics => {
  const sentenceLengths: number[] = [];
  let totalWords = 0;
  let contractions = 0;
  let questionSentences = 0;
  let exclamationSentences = 0;
  let latinateWords = 0;
  const uniqueWords = new Set<string>();

  for (const line of lines) {
    const text = line.quote ?? '';
    const sentences = splitSentences(text);

    for (const sentence of sentences) {
      const words = tokenizeWords(sentence);
      const length = words.length;
      if (length > 0) {
        sentenceLengths.push(length);
        totalWords += length;
        if (sentence.includes('?')) questionSentences += 1;
        if (sentence.includes('!')) exclamationSentences += 1;
        for (const word of words) {
          uniqueWords.add(word);
          if (LATINATE_SUFFIXES.some(suffix => word.endsWith(suffix))) {
            latinateWords += 1;
          }
        }
      }
    }

    const contractionMatches = text.match(CONTRACTION_REGEX);
    contractions += contractionMatches ? contractionMatches.length : 0;
  }

  const sentenceCount = sentenceLengths.length;
  const avgSentenceLength = sentenceCount
    ? sentenceLengths.reduce((sum, current) => sum + current, 0) / sentenceCount
    : 0;
  const varianceBase = sentenceCount
    ? sentenceLengths.reduce((sum, current) => sum + Math.pow(current - avgSentenceLength, 2), 0) / sentenceCount
    : 0;
  const sentenceStdDev = Math.sqrt(varianceBase);

  const safeTotalWords = Math.max(totalWords, 1);
  const questionRatio = sentenceCount ? questionSentences / sentenceCount : 0;
  const exclamationRatio = sentenceCount ? exclamationSentences / sentenceCount : 0;
  const contractionRatio = contractions / safeTotalWords;
  const latinateRatio = latinateWords / safeTotalWords;

  return {
    avgSentenceLength,
    sentenceVariance: sentenceStdDev,
    contractionRatio,
    questionRatio,
    exclamationRatio,
    latinateRatio,
    uniqueWordCount: uniqueWords.size,
  };
};

const buildImpression = (metrics: VoiceMetrics): string => {
  const descriptors: string[] = [];
  if (metrics.latinateRatio > 0.4) descriptors.push('Formal');
  if (metrics.questionRatio > 0.3) descriptors.push('Inquisitive');
  if (metrics.contractionRatio > 0.2) descriptors.push('Casual');
  if (metrics.exclamationRatio > 0.15) descriptors.push('Urgent');
  if (metrics.avgSentenceLength > 18) descriptors.push('Verbose');
  if (metrics.avgSentenceLength < 12 && metrics.exclamationRatio > 0.1) {
    descriptors.push('Punchy');
  }
  if (!descriptors.length) return 'Balanced';
  return descriptors.join(', ');
};

const calculateSignatureWords = (
  speakerKey: string,
  ownCounts: Record<string, number> | undefined,
  globalCounts: Record<string, number>,
): string[] => {
  if (!ownCounts) return [];
  const scored = Object.entries(ownCounts)
    .filter(([word]) => word.length > 2)
    .map(([word, count]) => {
      const others = Math.max((globalCounts[word] ?? 0) - count, 0);
      const score = count / (others + 1);
      return { word, score, count };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.count !== a.count) return b.count - a.count;
      return a.word.localeCompare(b.word);
    })
    .slice(0, 5)
    .map(entry => entry.word);

  return scored;
};

interface GenerateVoiceProfileOptions {
  speakerName?: string;
  signatureWords?: string[];
}

export const generateVoiceProfile = (
  lines: DialogueLine[],
  options?: GenerateVoiceProfileOptions,
): VoiceProfile => {
  const metrics = buildVoiceMetrics(lines);
  const speakerName = options?.speakerName ?? lines[0]?.speaker ?? 'Unknown';
  return {
    speakerName,
    metrics,
    signatureWords: options?.signatureWords ?? [],
    impression: buildImpression(metrics),
    lineCount: lines.length,
  };
};

const relativeDifference = (a: number, b: number): number => {
  if (a === 0 && b === 0) return 0;
  const avg = (Math.abs(a) + Math.abs(b)) / 2;
  if (avg === 0) return Math.abs(a - b);
  return Math.abs(a - b) / avg;
};

export const analyzeVoices = (dialogues: DialogueLine[]): VoiceFingerprint => {
  const linesBySpeaker: Record<string, DialogueLine[]> = {};
  const speakerWordCounts: Record<string, Record<string, number>> = {};
  const globalWordCounts: Record<string, number> = {};
  const speakerDisplayNames: Record<string, string> = {};

  for (const line of dialogues) {
    if (!line.speaker) continue;
    const normalizedKey = normalizeSpeaker(line.speaker);
    if (!linesBySpeaker[normalizedKey]) {
      linesBySpeaker[normalizedKey] = [];
      speakerWordCounts[normalizedKey] = {};
      speakerDisplayNames[normalizedKey] = line.speaker.trim();
    }
    linesBySpeaker[normalizedKey].push(line);

    const words = tokenizeWords(line.quote);
    for (const word of words) {
      speakerWordCounts[normalizedKey][word] = (speakerWordCounts[normalizedKey][word] ?? 0) + 1;
      globalWordCounts[word] = (globalWordCounts[word] ?? 0) + 1;
    }
  }

  const profiles: Record<string, VoiceProfile> = {};
  const consistencyAlerts: string[] = [];

  for (const [speakerKey, lines] of Object.entries(linesBySpeaker)) {
    if (lines.length < 5) continue;
    const signatureWords = calculateSignatureWords(speakerKey, speakerWordCounts[speakerKey], globalWordCounts);
    const profile = generateVoiceProfile(lines, {
      speakerName: speakerDisplayNames[speakerKey],
      signatureWords,
    });
    profiles[speakerKey] = profile;

    const splitIndex = Math.ceil(lines.length / 2);
    const firstHalf = lines.slice(0, splitIndex);
    const secondHalf = lines.slice(splitIndex);
    if (firstHalf.length && secondHalf.length) {
      const firstMetrics = buildVoiceMetrics(firstHalf);
      const secondMetrics = buildVoiceMetrics(secondHalf);
      const metricChecks: Array<keyof VoiceMetrics> = [
        'avgSentenceLength',
        'latinateRatio',
        'contractionRatio',
        'questionRatio',
        'exclamationRatio',
      ];
      for (const metricKey of metricChecks) {
        const diff = relativeDifference(firstMetrics[metricKey], secondMetrics[metricKey]);
        if (diff > 0.2) {
          const percent = Math.round(diff * 100);
          consistencyAlerts.push(
            `${speakerDisplayNames[speakerKey]} shows ${metricKey} shift of ${percent}% between halves.`,
          );
          break;
        }
      }
    }
  }

  return {
    profiles,
    consistencyAlerts,
  };
};
