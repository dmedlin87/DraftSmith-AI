import { extractEntities } from '../services/intelligence/entityExtractor.ts';
import type { ClassifiedParagraph } from '../types/intelligence';

const text = 'Sarah and Marcus walked together through the garden.';
const paragraphs: ClassifiedParagraph[] = [{
  offset: 0,
  length: text.length,
  type: 'exposition',
  speakerId: null,
  sentiment: 0,
  tension: 0,
  sentenceCount: 1,
  avgSentenceLength: 10,
}];

const result = extractEntities(text, paragraphs, [], 'chapter1');
console.log('nodes', result.nodes.map(n => n.name));
console.log('edges', result.edges);
