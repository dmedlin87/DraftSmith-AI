/**
 * Entity Extractor
 * 
 * Deterministic Named Entity Recognition without LLM calls:
 * - Character detection via proper nouns and dialogue attribution
 * - Location extraction via spatial patterns
 * - Object detection via possession patterns
 * - Relationship inference via co-occurrence
 */

import {
  EntityNode,
  EntityEdge,
  EntityGraph,
  EntityType,
  RelationshipType,
} from '../../types/intelligence';
import { DialogueLine, ClassifiedParagraph } from '../../types/intelligence';

// ─────────────────────────────────────────────────────────────────────────────
// PATTERNS & LEXICONS
// ─────────────────────────────────────────────────────────────────────────────

// Common words that look like names but aren't
const FALSE_POSITIVES = new Set([
  'the', 'a', 'an', 'this', 'that', 'these', 'those', 'it', 'they', 'we', 'i',
  'he', 'she', 'him', 'her', 'his', 'hers', 'their', 'our', 'my', 'your',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
  'morning', 'afternoon', 'evening', 'night', 'day', 'week', 'month', 'year',
  'north', 'south', 'east', 'west',
  'chapter', 'part', 'book', 'section', 'act', 'scene',
  'said', 'asked', 'replied', 'answered', 'thought', 'knew', 'felt', 'saw',
  'but', 'and', 'or', 'if', 'when', 'then', 'now', 'here', 'there',
  'yes', 'no', 'maybe', 'perhaps', 'certainly', 'definitely',
  'one', 'two', 'three', 'four', 'five', 'first', 'second', 'third', 'last',
]);

// Titles that indicate character names follow
const TITLES = ['mr', 'mrs', 'ms', 'miss', 'dr', 'doctor', 'professor', 'prof', 
  'sir', 'lady', 'lord', 'king', 'queen', 'prince', 'princess', 'captain', 
  'general', 'colonel', 'major', 'sergeant', 'officer', 'detective', 'agent',
  'father', 'mother', 'brother', 'sister', 'uncle', 'aunt', 'grandpa', 'grandma'];

// Location indicators
const LOCATION_PREPOSITIONS = ['in', 'at', 'inside', 'outside', 'within', 'near', 
  'by', 'behind', 'before', 'above', 'below', 'beneath', 'beside', 'between',
  'through', 'across', 'around', 'toward', 'towards', 'into', 'onto', 'upon'];

// Possession patterns for objects
const POSSESSION_PATTERNS = [
  /(\w+)'s\s+(\w+)/g,              // "Marcus's sword"
  /the\s+(\w+)\s+of\s+([A-Z]\w+)/g, // "the crown of Marcus"
  /(\w+)\s+held\s+(?:a|an|the|his|her)\s+(\w+)/g,
  /(\w+)\s+carried\s+(?:a|an|the|his|her)\s+(\w+)/g,
  /(\w+)\s+drew\s+(?:a|an|the|his|her)\s+(\w+)/g,
];

// Relationship verb patterns
const RELATIONSHIP_PATTERNS: Array<{ pattern: RegExp; type: RelationshipType }> = [
  { pattern: /(\w+)\s+(?:loved|kissed|embraced|married)\s+(\w+)/gi, type: 'related_to' },
  { pattern: /(\w+)\s+(?:attacked|fought|killed|struck|hit)\s+(\w+)/gi, type: 'opposes' },
  { pattern: /(\w+)\s+(?:helped|saved|protected|defended)\s+(\w+)/gi, type: 'allied_with' },
  { pattern: /(\w+)\s+and\s+(\w+)\s+(?:worked|traveled|walked|ran)\s+together/gi, type: 'allied_with' },
  { pattern: /(\w+)\s+(?:hated|despised|feared)\s+(\w+)/gi, type: 'opposes' },
  { pattern: /(\w+)\s+(?:trusted|believed|followed)\s+(\w+)/gi, type: 'allied_with' },
];

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

const generateId = (): string => Math.random().toString(36).substring(2, 11);

const normalizeEntityName = (name: string): string => {
  return name.trim().replace(/[.,!?;:'"]/g, '');
};

const isValidEntityName = (name: string): boolean => {
  const normalized = normalizeEntityName(name.toLowerCase());
  if (FALSE_POSITIVES.has(normalized)) return false;
  if (normalized.length < 2) return false;
  if (normalized.length > 30) return false;
  if (/^\d+$/.test(normalized)) return false;
  return true;
};

const isProperNoun = (word: string): boolean => {
  return /^[A-Z][a-z]+$/.test(word);
};

// ─────────────────────────────────────────────────────────────────────────────
// CHARACTER EXTRACTION
// ─────────────────────────────────────────────────────────────────────────────

interface RawEntity {
  name: string;
  type: EntityType;
  offset: number;
  context: string;
}

const extractCharactersFromText = (text: string): RawEntity[] => {
  const entities: RawEntity[] = [];
  
  // Pattern 1: Proper nouns at sentence starts or after dialogue
  const properNounPattern = /(?:^|[.!?]\s+|["']\s*)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;
  let match;
  
  while ((match = properNounPattern.exec(text)) !== null) {
    const name = normalizeEntityName(match[1]);
    if (isValidEntityName(name)) {
      entities.push({
        name,
        type: 'character',
        offset: match.index,
        context: text.slice(Math.max(0, match.index - 30), match.index + 50),
      });
    }
  }
  
  // Pattern 2: Names after titles
  for (const title of TITLES) {
    const titlePattern = new RegExp(`\\b${title}\\.?\\s+([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?)\\b`, 'gi');
    while ((match = titlePattern.exec(text)) !== null) {
      const name = normalizeEntityName(match[1]);
      if (isValidEntityName(name)) {
        entities.push({
          name: `${title.charAt(0).toUpperCase() + title.slice(1)} ${name}`,
          type: 'character',
          offset: match.index,
          context: text.slice(Math.max(0, match.index - 30), match.index + 50),
        });
      }
    }
  }
  
  // Pattern 3: Names in dialogue attribution ("X said", "said X")
  const dialogueAttrPattern = /["'].*?["']\s*,?\s*(?:said|asked|replied|whispered|shouted|muttered|exclaimed)\s+([A-Z][a-z]+)/g;
  while ((match = dialogueAttrPattern.exec(text)) !== null) {
    const name = normalizeEntityName(match[1]);
    if (isValidEntityName(name)) {
      entities.push({
        name,
        type: 'character',
        offset: match.index,
        context: text.slice(Math.max(0, match.index - 30), match.index + 50),
      });
    }
  }
  
  // Pattern 4: "X said" before dialogue
  const preDialoguePattern = /([A-Z][a-z]+)\s+(?:said|asked|replied|whispered|shouted|muttered|exclaimed)\s*,?\s*["']/g;
  while ((match = preDialoguePattern.exec(text)) !== null) {
    const name = normalizeEntityName(match[1]);
    if (isValidEntityName(name)) {
      entities.push({
        name,
        type: 'character',
        offset: match.index,
        context: text.slice(Math.max(0, match.index - 30), match.index + 50),
      });
    }
  }
  
  return entities;
};

// ─────────────────────────────────────────────────────────────────────────────
// LOCATION EXTRACTION
// ─────────────────────────────────────────────────────────────────────────────

const extractLocations = (text: string): RawEntity[] => {
  const entities: RawEntity[] = [];
  
  // Pattern: Preposition + "the" + Location
  for (const prep of LOCATION_PREPOSITIONS) {
    const pattern = new RegExp(`\\b${prep}\\s+(?:the\\s+)?([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*)\\b`, 'g');
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const name = normalizeEntityName(match[1]);
      if (isValidEntityName(name) && name.length > 2) {
        entities.push({
          name,
          type: 'location',
          offset: match.index,
          context: text.slice(Math.max(0, match.index - 30), match.index + 50),
        });
      }
    }
  }
  
  // Pattern: "the X" where X is a place-like noun
  const placeNouns = ['castle', 'palace', 'tower', 'house', 'hall', 'chamber', 
    'room', 'forest', 'mountain', 'river', 'lake', 'sea', 'ocean', 'city', 
    'town', 'village', 'kingdom', 'realm', 'land', 'world', 'tavern', 'inn',
    'temple', 'church', 'cathedral', 'dungeon', 'cave', 'prison', 'throne'];
  
  for (const noun of placeNouns) {
    const pattern = new RegExp(`\\bthe\\s+([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*)\\s+${noun}\\b`, 'gi');
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const name = `${normalizeEntityName(match[1])} ${noun.charAt(0).toUpperCase() + noun.slice(1)}`;
      if (isValidEntityName(name)) {
        entities.push({
          name,
          type: 'location',
          offset: match.index,
          context: text.slice(Math.max(0, match.index - 30), match.index + 50),
        });
      }
    }
  }
  
  return entities;
};

// ─────────────────────────────────────────────────────────────────────────────
// OBJECT EXTRACTION
// ─────────────────────────────────────────────────────────────────────────────

const extractObjects = (text: string): RawEntity[] => {
  const entities: RawEntity[] = [];
  
  // Pattern: Significant objects (often named)
  const significantObjects = ['sword', 'crown', 'ring', 'staff', 'wand', 'book', 
    'scroll', 'key', 'gem', 'stone', 'amulet', 'pendant', 'necklace', 'bracelet',
    'shield', 'armor', 'cloak', 'robe', 'dagger', 'bow', 'arrow', 'spear', 'axe',
    'hammer', 'chalice', 'goblet', 'mirror', 'orb', 'crystal', 'map', 'letter'];
  
  for (const obj of significantObjects) {
    // Named objects: "the X of Y" or "Y's X"
    const namedPattern = new RegExp(`the\\s+([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*)\\s+${obj}|the\\s+${obj}\\s+of\\s+([A-Z][a-z]+)`, 'gi');
    let match;
    while ((match = namedPattern.exec(text)) !== null) {
      const name = match[1] || match[2];
      if (name && isValidEntityName(name)) {
        entities.push({
          name: `The ${name} ${obj.charAt(0).toUpperCase() + obj.slice(1)}`,
          type: 'object',
          offset: match.index,
          context: text.slice(Math.max(0, match.index - 30), match.index + 50),
        });
      }
    }
  }
  
  return entities;
};

// ─────────────────────────────────────────────────────────────────────────────
// ENTITY CONSOLIDATION
// ─────────────────────────────────────────────────────────────────────────────

const consolidateEntities = (rawEntities: RawEntity[], chapterId: string): EntityNode[] => {
  const entityMap = new Map<string, EntityNode>();
  
  for (const raw of rawEntities) {
    const key = raw.name.toLowerCase();
    
    if (entityMap.has(key)) {
      // Update existing entity
      const existing = entityMap.get(key)!;
      existing.mentionCount++;
      existing.mentions.push({ offset: raw.offset, chapterId });
    } else {
      // Create new entity
      entityMap.set(key, {
        id: generateId(),
        name: raw.name,
        type: raw.type,
        aliases: [],
        firstMention: raw.offset,
        mentionCount: 1,
        mentions: [{ offset: raw.offset, chapterId }],
        attributes: {},
      });
    }
  }
  
  // Sort by mention count (more mentioned = more important)
  return Array.from(entityMap.values())
    .sort((a, b) => b.mentionCount - a.mentionCount);
};

// ─────────────────────────────────────────────────────────────────────────────
// RELATIONSHIP DETECTION
// ─────────────────────────────────────────────────────────────────────────────

const detectRelationships = (
  text: string,
  entities: EntityNode[],
  paragraphs: ClassifiedParagraph[],
  chapterId: string
): EntityEdge[] => {
  const edges: EntityEdge[] = [];
  const edgeMap = new Map<string, EntityEdge>();
  
  const entityNames = new Set(entities.map(e => e.name.toLowerCase()));
  
  // Method 1: Co-occurrence within paragraphs
  for (const para of paragraphs) {
    const paraText = text.slice(para.offset, para.offset + para.length).toLowerCase();
    const presentEntities: EntityNode[] = [];
    
    for (const entity of entities) {
      if (paraText.includes(entity.name.toLowerCase())) {
        presentEntities.push(entity);
      }
    }
    
    // Create edges between co-occurring entities
    for (let i = 0; i < presentEntities.length; i++) {
      for (let j = i + 1; j < presentEntities.length; j++) {
        const source = presentEntities[i];
        const target = presentEntities[j];
        const edgeKey = [source.id, target.id].sort().join('-');
        
        if (edgeMap.has(edgeKey)) {
          const edge = edgeMap.get(edgeKey)!;
          edge.coOccurrences++;
          if (!edge.chapters.includes(chapterId)) {
            edge.chapters.push(chapterId);
          }
        } else {
          edgeMap.set(edgeKey, {
            id: generateId(),
            source: source.id,
            target: target.id,
            type: 'interacts',
            coOccurrences: 1,
            sentiment: 0,
            chapters: [chapterId],
            evidence: [paraText.slice(0, 100)],
          });
        }
      }
    }
  }
  
  // Method 2: Explicit relationship patterns
  for (const { pattern, type } of RELATIONSHIP_PATTERNS) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const name1 = normalizeEntityName(match[1]).toLowerCase();
      const name2 = normalizeEntityName(match[2]).toLowerCase();
      
      if (entityNames.has(name1) && entityNames.has(name2)) {
        const entity1 = entities.find(e => e.name.toLowerCase() === name1);
        const entity2 = entities.find(e => e.name.toLowerCase() === name2);
        
        if (entity1 && entity2) {
          const edgeKey = [entity1.id, entity2.id].sort().join('-');
          
          if (edgeMap.has(edgeKey)) {
            const edge = edgeMap.get(edgeKey)!;
            // Upgrade relationship type if more specific
            if (edge.type === 'interacts') {
              edge.type = type;
            }
            edge.evidence.push(match[0]);
          } else {
            edgeMap.set(edgeKey, {
              id: generateId(),
              source: entity1.id,
              target: entity2.id,
              type,
              coOccurrences: 1,
              sentiment: type === 'opposes' ? -0.5 : 0.5,
              chapters: [chapterId],
              evidence: [match[0]],
            });
          }
        }
      }
    }
  }
  
  return Array.from(edgeMap.values());
};

// ─────────────────────────────────────────────────────────────────────────────
// ALIAS DETECTION
// ─────────────────────────────────────────────────────────────────────────────

const detectAliases = (text: string, entities: EntityNode[]): void => {
  // Common alias patterns
  const aliasPatterns = [
    // "X, known as Y" / "X, called Y"
    /([A-Z][a-z]+),?\s+(?:known|called|nicknamed)\s+(?:as\s+)?["']?([A-Z][a-z]+)["']?/g,
    // "Y, whose real name was X"
    /([A-Z][a-z]+),?\s+whose\s+(?:real|true)\s+name\s+(?:was|is)\s+([A-Z][a-z]+)/g,
    // "the X" referring to a character
    /(?:^|[.!?]\s+)(the\s+[a-z]+\s+[a-z]+)\s+(?:was|had|did|could|would|said|asked)/gi,
  ];
  
  for (const pattern of aliasPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const name1 = normalizeEntityName(match[1]).toLowerCase();
      const name2 = normalizeEntityName(match[2]).toLowerCase();
      
      // Find matching entity and add alias
      for (const entity of entities) {
        if (entity.name.toLowerCase() === name1) {
          if (!entity.aliases.includes(match[2])) {
            entity.aliases.push(match[2]);
          }
        } else if (entity.name.toLowerCase() === name2) {
          if (!entity.aliases.includes(match[1])) {
            entity.aliases.push(match[1]);
          }
        }
      }
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PRONOUN RESOLUTION
// ─────────────────────────────────────────────────────────────────────────────

export interface CoReference {
  pronoun: string;
  offset: number;
  resolvedTo: string;  // Entity ID
  confidence: number;
}

const MALE_PRONOUNS = new Set(['he', 'him', 'his', 'himself']);
const FEMALE_PRONOUNS = new Set(['she', 'her', 'hers', 'herself']);
const NEUTRAL_PRONOUNS = new Set(['they', 'them', 'their', 'theirs', 'themselves']);

// Infer gender from context or common name patterns
const inferGender = (entity: EntityNode, text: string): 'male' | 'female' | 'neutral' | 'unknown' => {
  const nameLower = entity.name.toLowerCase();
  
  // Check common female name endings
  const femaleEndings = ['a', 'ia', 'ina', 'ella', 'anna', 'ette', 'elle'];
  const maleEndings = ['ius', 'us', 'son', 'ton'];
  
  for (const ending of femaleEndings) {
    if (nameLower.endsWith(ending)) return 'female';
  }
  for (const ending of maleEndings) {
    if (nameLower.endsWith(ending)) return 'male';
  }
  
  // Check context around mentions for gendered pronouns
  for (const mention of entity.mentions.slice(0, 5)) {
    const context = text.slice(
      Math.max(0, mention.offset - 100),
      Math.min(text.length, mention.offset + entity.name.length + 100)
    ).toLowerCase();
    
    // Count gendered pronouns near this entity
    const maleCount = [...MALE_PRONOUNS].filter(p => context.includes(p)).length;
    const femaleCount = [...FEMALE_PRONOUNS].filter(p => context.includes(p)).length;
    
    if (maleCount > femaleCount + 1) return 'male';
    if (femaleCount > maleCount + 1) return 'female';
  }
  
  return 'unknown';
};

const resolvePronoun = (
  pronoun: string,
  offset: number,
  recentEntities: EntityNode[],
  text: string
): CoReference | null => {
  const pronounLower = pronoun.toLowerCase();
  
  // Filter candidates by gender
  let candidates = recentEntities.filter(e => e.type === 'character');
  
  if (MALE_PRONOUNS.has(pronounLower)) {
    const genderedCandidates = candidates.filter(e => {
      const gender = inferGender(e, text);
      return gender === 'male' || gender === 'unknown';
    });
    if (genderedCandidates.length > 0) candidates = genderedCandidates;
  } else if (FEMALE_PRONOUNS.has(pronounLower)) {
    const genderedCandidates = candidates.filter(e => {
      const gender = inferGender(e, text);
      return gender === 'female' || gender === 'unknown';
    });
    if (genderedCandidates.length > 0) candidates = genderedCandidates;
  }
  
  if (candidates.length === 0) return null;
  
  // Find closest preceding mention
  let bestCandidate = candidates[0];
  let bestDistance = Infinity;
  
  for (const entity of candidates) {
    for (const mention of entity.mentions) {
      // Only consider mentions before this pronoun
      if (mention.offset < offset) {
        const distance = offset - mention.offset;
        if (distance < bestDistance) {
          bestDistance = distance;
          bestCandidate = entity;
        }
      }
    }
  }
  
  // Confidence based on distance
  const confidence = bestDistance < 100 ? 0.9 : bestDistance < 300 ? 0.7 : 0.5;
  
  return {
    pronoun,
    offset,
    resolvedTo: bestCandidate.id,
    confidence,
  };
};

const resolvePronounsInText = (
  text: string,
  entities: EntityNode[],
  chapterId: string
): CoReference[] => {
  const coReferences: CoReference[] = [];
  
  // Only resolve if we have character entities
  const characters = entities.filter(e => e.type === 'character');
  if (characters.length === 0) return coReferences;
  
  // Find pronouns in text
  const pronounPattern = /\b(he|him|his|himself|she|her|hers|herself|they|them|their|theirs|themselves)\b/gi;
  let match;
  
  while ((match = pronounPattern.exec(text)) !== null) {
    const resolved = resolvePronoun(match[1], match.index, characters, text);
    if (resolved && resolved.confidence >= 0.5) {
      coReferences.push(resolved);
      
      // Add as mention to the resolved entity
      const entity = entities.find(e => e.id === resolved.resolvedTo);
      if (entity) {
        entity.mentions.push({ offset: match.index, chapterId });
        entity.mentionCount++;
      }
    }
  }
  
  return coReferences;
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────

export const extractEntities = (
  text: string,
  paragraphs: ClassifiedParagraph[],
  dialogues: DialogueLine[],
  chapterId: string
): EntityGraph => {
  // Extract raw entities
  const rawCharacters = extractCharactersFromText(text);
  const rawLocations = extractLocations(text);
  const rawObjects = extractObjects(text);
  
  // Add speakers from dialogue as high-confidence characters
  for (const dialogue of dialogues) {
    if (dialogue.speaker) {
      rawCharacters.push({
        name: dialogue.speaker,
        type: 'character',
        offset: dialogue.offset,
        context: dialogue.quote,
      });
    }
  }
  
  // Consolidate all entities
  const allRaw = [...rawCharacters, ...rawLocations, ...rawObjects];
  const nodes = consolidateEntities(allRaw, chapterId);
  
  // Detect aliases
  detectAliases(text, nodes);
  
  // Resolve pronouns to entities (adds to mention counts)
  const coReferences = resolvePronounsInText(text, nodes, chapterId);
  
  // Detect relationships
  const edges = detectRelationships(text, nodes, paragraphs, chapterId);
  
  return {
    nodes,
    edges,
    processedAt: Date.now(),
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// MERGE FUNCTION (for combining across chapters)
// ─────────────────────────────────────────────────────────────────────────────

export const mergeEntityGraphs = (graphs: EntityGraph[]): EntityGraph => {
  const nodeMap = new Map<string, EntityNode>();
  const edgeMap = new Map<string, EntityEdge>();
  
  for (const graph of graphs) {
    // Merge nodes
    for (const node of graph.nodes) {
      const key = node.name.toLowerCase();
      if (nodeMap.has(key)) {
        const existing = nodeMap.get(key)!;
        existing.mentionCount += node.mentionCount;
        existing.mentions.push(...node.mentions);
        existing.aliases = [...new Set([...existing.aliases, ...node.aliases])];
        // Keep earliest first mention
        if (node.firstMention < existing.firstMention) {
          existing.firstMention = node.firstMention;
        }
      } else {
        nodeMap.set(key, { ...node });
      }
    }
    
    // Merge edges
    for (const edge of graph.edges) {
      const key = [edge.source, edge.target].sort().join('-');
      if (edgeMap.has(key)) {
        const existing = edgeMap.get(key)!;
        existing.coOccurrences += edge.coOccurrences;
        existing.chapters = [...new Set([...existing.chapters, ...edge.chapters])];
        existing.evidence = [...existing.evidence, ...edge.evidence].slice(0, 10);
        // Upgrade relationship type if new one is more specific
        if (existing.type === 'interacts' && edge.type !== 'interacts') {
          existing.type = edge.type;
        }
      } else {
        edgeMap.set(key, { ...edge });
      }
    }
  }
  
  return {
    nodes: Array.from(nodeMap.values()).sort((a, b) => b.mentionCount - a.mentionCount),
    edges: Array.from(edgeMap.values()).sort((a, b) => b.coOccurrences - a.coOccurrences),
    processedAt: Date.now(),
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// QUERY HELPERS
// ─────────────────────────────────────────────────────────────────────────────

export const getEntitiesInRange = (
  graph: EntityGraph,
  startOffset: number,
  endOffset: number
): EntityNode[] => {
  return graph.nodes.filter(node =>
    node.mentions.some(m => m.offset >= startOffset && m.offset < endOffset)
  );
};

export const getRelatedEntities = (
  graph: EntityGraph,
  entityId: string
): Array<{ entity: EntityNode; relationship: EntityEdge }> => {
  const results: Array<{ entity: EntityNode; relationship: EntityEdge }> = [];
  
  for (const edge of graph.edges) {
    if (edge.source === entityId || edge.target === entityId) {
      const otherId = edge.source === entityId ? edge.target : edge.source;
      const other = graph.nodes.find(n => n.id === otherId);
      if (other) {
        results.push({ entity: other, relationship: edge });
      }
    }
  }
  
  return results.sort((a, b) => b.relationship.coOccurrences - a.relationship.coOccurrences);
};
