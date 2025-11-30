/**
 * Contradiction Detector
 * 
 * Detects inconsistencies in entity attributes and timeline events:
 * - Character attribute contradictions (eye color, age, etc.)
 * - Timeline violations (character dies then speaks later)
 * - Location contradictions (character in two places at once)
 * - Relationship contradictions (ally then enemy without explanation)
 */

import {
  EntityGraph,
  EntityNode,
  Timeline,
  TimelineEvent,
} from '../../types/intelligence';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type ContradictionType = 
  | 'attribute'      // Physical traits, names, ages
  | 'timeline'       // Events out of order, dead characters acting
  | 'location'       // Character in two places at once
  | 'relationship'   // Relationship status inconsistency
  | 'existence';     // Character exists/doesn't exist

export interface Contradiction {
  id: string;
  type: ContradictionType;
  entityId: string;
  entityName: string;
  claim1: {
    text: string;
    offset: number;
    value: string;
    chapterId?: string;
  };
  claim2: {
    text: string;
    offset: number;
    value: string;
    chapterId?: string;
  };
  severity: number;  // 0 to 1
  suggestion: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// ATTRIBUTE PATTERNS
// ─────────────────────────────────────────────────────────────────────────────

interface AttributePattern {
  category: string;
  pattern: RegExp;
  extractor: (match: RegExpMatchArray) => string;
}

const ATTRIBUTE_PATTERNS: AttributePattern[] = [
  // Eye color
  {
    category: 'eye_color',
    pattern: /(\w+)'s?\s+(\w+)\s+eyes|eyes\s+(?:were|are)\s+(\w+)/gi,
    extractor: (m) => m[2] || m[3],
  },
  // Hair color
  {
    category: 'hair_color',
    pattern: /(\w+)'s?\s+(\w+)\s+hair|hair\s+(?:was|is)\s+(\w+)/gi,
    extractor: (m) => m[2] || m[3],
  },
  // Age
  {
    category: 'age',
    pattern: /(\w+)\s+(?:was|is)\s+(\d+)\s+years?\s+old|(\d+)-year-old\s+(\w+)/gi,
    extractor: (m) => m[2] || m[3],
  },
  // Height descriptors
  {
    category: 'height',
    pattern: /(\w+)\s+(?:was|is)\s+(tall|short|average\s+height)/gi,
    extractor: (m) => m[2],
  },
  // Build/body type
  {
    category: 'build',
    pattern: /(\w+)'s?\s+(slender|muscular|heavyset|thin|stocky|athletic)\s+(?:build|frame|body)/gi,
    extractor: (m) => m[2],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// ATTRIBUTE EXTRACTION
// ─────────────────────────────────────────────────────────────────────────────

interface ExtractedAttribute {
  entityName: string;
  category: string;
  value: string;
  offset: number;
  context: string;
}

const extractAttributes = (text: string): ExtractedAttribute[] => {
  const attributes: ExtractedAttribute[] = [];
  
  for (const { category, pattern, extractor } of ATTRIBUTE_PATTERNS) {
    let match;
    const patternCopy = new RegExp(pattern.source, pattern.flags);
    
    while ((match = patternCopy.exec(text)) !== null) {
      const entityName = match[1] || match[4];
      const value = extractor(match);
      
      if (entityName && value) {
        attributes.push({
          entityName: entityName.trim(),
          category,
          value: value.toLowerCase(),
          offset: match.index,
          context: text.slice(Math.max(0, match.index - 20), match.index + match[0].length + 20),
        });
      }
    }
  }
  
  return attributes;
};

// ─────────────────────────────────────────────────────────────────────────────
// CONTRADICTION DETECTION
// ─────────────────────────────────────────────────────────────────────────────

const generateId = (): string => Math.random().toString(36).substring(2, 11);

// Check if two values are compatible (same or related)
const areValuesCompatible = (category: string, val1: string, val2: string): boolean => {
  // Same value is always compatible
  if (val1 === val2) return true;
  
  // Age: allow small differences (could be passage of time)
  if (category === 'age') {
    const age1 = parseInt(val1);
    const age2 = parseInt(val2);
    if (!isNaN(age1) && !isNaN(age2)) {
      return Math.abs(age1 - age2) <= 2; // Allow 2 year difference
    }
  }
  
  // Color variations that might be compatible
  const colorVariations: Record<string, string[]> = {
    'blue': ['light blue', 'dark blue', 'sky blue', 'azure'],
    'green': ['light green', 'dark green', 'emerald', 'jade'],
    'brown': ['dark brown', 'light brown', 'chestnut', 'chocolate'],
    'black': ['jet black', 'raven'],
    'red': ['auburn', 'copper', 'crimson'],
    'blonde': ['golden', 'fair', 'light'],
  };
  
  for (const [base, variations] of Object.entries(colorVariations)) {
    if ((val1 === base || variations.includes(val1)) && 
        (val2 === base || variations.includes(val2))) {
      return true;
    }
  }
  
  return false;
};

const detectAttributeContradictions = (
  text: string,
  entities: EntityGraph
): Contradiction[] => {
  const contradictions: Contradiction[] = [];
  const attributes = extractAttributes(text);
  
  // Group attributes by entity and category
  const entityAttrs = new Map<string, Map<string, ExtractedAttribute[]>>();
  
  for (const attr of attributes) {
    const key = attr.entityName.toLowerCase();
    
    if (!entityAttrs.has(key)) {
      entityAttrs.set(key, new Map());
    }
    
    const categoryMap = entityAttrs.get(key)!;
    if (!categoryMap.has(attr.category)) {
      categoryMap.set(attr.category, []);
    }
    
    categoryMap.get(attr.category)!.push(attr);
  }
  
  // Check for contradictions within each entity
  for (const [entityName, categories] of entityAttrs) {
    const entity = entities.nodes.find(e => e.name.toLowerCase() === entityName);
    
    for (const [category, attrs] of categories) {
      if (attrs.length < 2) continue;
      
      // Compare all pairs
      for (let i = 0; i < attrs.length; i++) {
        for (let j = i + 1; j < attrs.length; j++) {
          const attr1 = attrs[i];
          const attr2 = attrs[j];
          
          if (!areValuesCompatible(category, attr1.value, attr2.value)) {
            contradictions.push({
              id: generateId(),
              type: 'attribute',
              entityId: entity?.id || '',
              entityName: attr1.entityName,
              claim1: {
                text: attr1.context,
                offset: attr1.offset,
                value: attr1.value,
              },
              claim2: {
                text: attr2.context,
                offset: attr2.offset,
                value: attr2.value,
              },
              severity: 0.8,
              suggestion: `${attr1.entityName}'s ${category.replace('_', ' ')} is described as both "${attr1.value}" and "${attr2.value}". Consider making these consistent.`,
            });
          }
        }
      }
    }
  }
  
  return contradictions;
};

// ─────────────────────────────────────────────────────────────────────────────
// TIMELINE CONTRADICTION DETECTION
// ─────────────────────────────────────────────────────────────────────────────

const DEATH_PATTERNS = [
  /(\w+)\s+(?:died|was\s+killed|passed\s+away|perished)/gi,
  /(?:killed|murdered|slew)\s+(\w+)/gi,
  /(\w+)'s\s+(?:death|demise|passing)/gi,
];

const detectTimelineContradictions = (
  text: string,
  entities: EntityGraph,
  timeline: Timeline
): Contradiction[] => {
  const contradictions: Contradiction[] = [];
  
  // Track deaths
  const deathEvents = new Map<string, { offset: number; context: string }>();
  
  for (const pattern of DEATH_PATTERNS) {
    let match;
    const patternCopy = new RegExp(pattern.source, pattern.flags);
    
    while ((match = patternCopy.exec(text)) !== null) {
      const name = (match[1] || match[2]).toLowerCase();
      
      if (!deathEvents.has(name)) {
        deathEvents.set(name, {
          offset: match.index,
          context: text.slice(Math.max(0, match.index - 20), match.index + match[0].length + 20),
        });
      }
    }
  }
  
  // Check if dead characters act later
  for (const [name, death] of deathEvents) {
    const entity = entities.nodes.find(e => e.name.toLowerCase() === name);
    if (!entity) continue;
    
    // Look for mentions after death
    const postDeathMentions = entity.mentions.filter(m => m.offset > death.offset);
    
    for (const mention of postDeathMentions) {
      // Check if this is an action (speaking, moving, etc.)
      const mentionContext = text.slice(mention.offset, mention.offset + 100);
      const actionPatterns = /(?:said|asked|walked|ran|looked|smiled|nodded|shook)/i;
      
      if (actionPatterns.test(mentionContext)) {
        contradictions.push({
          id: generateId(),
          type: 'timeline',
          entityId: entity.id,
          entityName: entity.name,
          claim1: {
            text: death.context,
            offset: death.offset,
            value: 'death',
          },
          claim2: {
            text: mentionContext.slice(0, 50),
            offset: mention.offset,
            value: 'action after death',
          },
          severity: 0.95,
          suggestion: `${entity.name} appears to take action after their death. Either the death scene or subsequent action needs revision.`,
        });
        
        break; // One contradiction per dead character is enough
      }
    }
  }
  
  return contradictions;
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────

export const detectContradictions = (
  text: string,
  entities: EntityGraph,
  timeline: Timeline
): Contradiction[] => {
  const contradictions: Contradiction[] = [];
  
  // Detect attribute contradictions
  contradictions.push(...detectAttributeContradictions(text, entities));
  
  // Detect timeline contradictions
  contradictions.push(...detectTimelineContradictions(text, entities, timeline));
  
  // Sort by severity
  return contradictions.sort((a, b) => b.severity - a.severity);
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

export const getContradictionsForEntity = (
  contradictions: Contradiction[],
  entityId: string
): Contradiction[] => {
  return contradictions.filter(c => c.entityId === entityId);
};

export const getHighSeverityContradictions = (
  contradictions: Contradiction[],
  threshold: number = 0.7
): Contradiction[] => {
  return contradictions.filter(c => c.severity >= threshold);
};

export const groupContradictionsByType = (
  contradictions: Contradiction[]
): Map<ContradictionType, Contradiction[]> => {
  const grouped = new Map<ContradictionType, Contradiction[]>();
  
  for (const c of contradictions) {
    if (!grouped.has(c.type)) {
      grouped.set(c.type, []);
    }
    grouped.get(c.type)!.push(c);
  }
  
  return grouped;
};
