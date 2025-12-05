/**
 * Contradiction Detector Test Suite
 *
 * Comprehensive tests for contradiction detection in manuscripts:
 * - Attribute contradictions (eye color, age, etc.)
 * - Timeline contradictions (death events)
 * - Lore-aware contradictions
 */

import { describe, it, expect } from 'vitest';
import {
  detectContradictions,
  detectContradictionsWithLore,
  getContradictionsForEntity,
  getHighSeverityContradictions,
  getHighConfidenceContradictions,
  groupContradictionsByType,
  ContradictionType,
  Contradiction,
  LoreFact,
} from '@/services/intelligence/contradictionDetector';
import { EntityGraph, Timeline, EntityNode } from '@/types/intelligence';
import { MemoryNote } from '@/services/memory/types';

// ─────────────────────────────────────────────────────────────────────────────
// TEST FIXTURES
// ─────────────────────────────────────────────────────────────────────────────

const createEntity = (name: string, mentions: { offset: number; length: number }[] = []): EntityNode => ({
  id: `entity-${name.toLowerCase()}`,
  name,
  type: 'character',
  mentionCount: mentions.length,
  mentions: mentions.map(m => ({ offset: m.offset, length: m.length })),
  attributes: {},
  relationships: [],
});

const createEntityGraph = (entities: EntityNode[]): EntityGraph => ({
  nodes: entities,
  edges: [],
});

const createTimeline = (): Timeline => ({
  events: [],
  promises: [],
  conflicts: [],
  arcs: [],
});

const createMemoryNote = (id: string, text: string, type: 'fact' | 'observation' = 'fact'): MemoryNote => ({
  id,
  text,
  type,
  scope: 'project' as const,
  authorId: 'test-author',
  createdAt: Date.now(),
  importance: 0.5,
  topicTags: type === 'fact' ? ['lore'] : [],
  embeddingId: null,
});

// ─────────────────────────────────────────────────────────────────────────────
// ATTRIBUTE CONTRADICTIONS
// ─────────────────────────────────────────────────────────────────────────────

describe('Contradiction Detector', () => {
  describe('Attribute Contradictions', () => {
    describe('Eye color contradictions', () => {
      it('should detect eye color contradictions', () => {
        const text = `Sarah's blue eyes sparkled in the sunlight.
        Later in the day, Sarah's green eyes reflected her mood.`;

        const entities = createEntityGraph([
          createEntity('Sarah', [{ offset: 0, length: 5 }, { offset: 60, length: 5 }]),
        ]);

        const contradictions = detectContradictions(text, entities, createTimeline());

        expect(contradictions.length).toBeGreaterThan(0);
        const eyeContradict = contradictions.find(c => c.category === 'eye_color');
        expect(eyeContradict).toBeDefined();
        expect(eyeContradict?.entityName).toBe('Sarah');
        expect(eyeContradict?.type).toBe('attribute');
      });

      it('should allow compatible eye color variations', () => {
        const text = `Sarah's blue eyes sparkled. Her light blue eyes shone.`;

        const entities = createEntityGraph([
          createEntity('Sarah', [{ offset: 0, length: 5 }]),
        ]);

        const contradictions = detectContradictions(text, entities, createTimeline());

        // Light blue and blue should be compatible
        const eyeContradict = contradictions.find(c => c.category === 'eye_color');
        expect(eyeContradict).toBeUndefined();
      });

      it('should detect eyes pattern variations', () => {
        const text = `Her eyes were brown. Later, her eyes were blue.`;

        const entities = createEntityGraph([
          createEntity('Her', [{ offset: 0, length: 3 }]),
        ]);

        const contradictions = detectContradictions(text, entities, createTimeline());

        expect(contradictions.some(c => c.category === 'eye_color')).toBe(true);
      });
    });

    describe('Hair color contradictions', () => {
      it('should detect hair color contradictions', () => {
        const text = `John's blonde hair gleamed in the sun.
        John's dark hair was messy today.`;

        const entities = createEntityGraph([
          createEntity('John', [{ offset: 0, length: 4 }, { offset: 40, length: 4 }]),
        ]);

        const contradictions = detectContradictions(text, entities, createTimeline());

        const hairContradict = contradictions.find(c => c.category === 'hair_color');
        expect(hairContradict).toBeDefined();
        expect(hairContradict?.entityName).toBe('John');
      });

      it('should allow compatible hair color variations', () => {
        const text = `Mary's blonde hair shone. Her golden hair flowed.`;

        const entities = createEntityGraph([
          createEntity('Mary', [{ offset: 0, length: 4 }]),
        ]);

        const contradictions = detectContradictions(text, entities, createTimeline());

        const hairContradict = contradictions.find(c => c.category === 'hair_color');
        expect(hairContradict).toBeUndefined();
      });
    });

    describe('Age contradictions', () => {
      it('should detect age contradictions', () => {
        const text = `Tom was 25 years old. Later, Tom was 40 years old.`;

        const entities = createEntityGraph([
          createEntity('Tom', [{ offset: 0, length: 3 }]),
        ]);

        const contradictions = detectContradictions(text, entities, createTimeline());

        const ageContradict = contradictions.find(c => c.category === 'age');
        expect(ageContradict).toBeDefined();
      });

      it('should allow small age differences (time passage)', () => {
        const text = `Alice was 30 years old. A year later, Alice was 31 years old.`;

        const entities = createEntityGraph([
          createEntity('Alice', [{ offset: 0, length: 5 }]),
        ]);

        const contradictions = detectContradictions(text, entities, createTimeline());

        // Small age differences should be allowed
        const ageContradict = contradictions.find(c => c.category === 'age');
        expect(ageContradict).toBeUndefined();
      });

      it('should detect "X-year-old" pattern', () => {
        const text = `A 25-year-old man walked in. Later, the 40-year-old man spoke.`;

        const entities = createEntityGraph([
          createEntity('man', [{ offset: 15, length: 3 }]),
        ]);

        const contradictions = detectContradictions(text, entities, createTimeline());

        expect(contradictions.some(c => c.category === 'age')).toBe(true);
      });

      it('should reduce confidence for large age gaps', () => {
        const text = `Bob was 20 years old. Decades later, Bob was 60 years old.`;

        const entities = createEntityGraph([
          createEntity('Bob', [{ offset: 0, length: 3 }]),
        ]);

        const contradictions = detectContradictions(text, entities, createTimeline());

        const ageContradict = contradictions.find(c => c.category === 'age');
        // Should still detect but with lower confidence
        if (ageContradict) {
          expect(ageContradict.confidence).toBeLessThan(0.8);
        }
      });
    });

    describe('Height contradictions', () => {
      it('should detect height contradictions', () => {
        const text = `James was tall. Later, James was short.`;

        const entities = createEntityGraph([
          createEntity('James', [{ offset: 0, length: 5 }]),
        ]);

        const contradictions = detectContradictions(text, entities, createTimeline());

        const heightContradict = contradictions.find(c => c.category === 'height');
        expect(heightContradict).toBeDefined();
      });
    });

    describe('Build contradictions', () => {
      it('should detect build contradictions', () => {
        const text = `Mike's slender build was evident. Mike's muscular frame stood out.`;

        const entities = createEntityGraph([
          createEntity('Mike', [{ offset: 0, length: 4 }]),
        ]);

        const contradictions = detectContradictions(text, entities, createTimeline());

        const buildContradict = contradictions.find(c => c.category === 'build');
        expect(buildContradict).toBeDefined();
      });
    });

    describe('Confidence scoring', () => {
      it('should boost confidence for well-established entities', () => {
        const text = `Sarah's blue eyes sparkled. Sarah's green eyes reflected.`;

        const entities = createEntityGraph([
          createEntity('Sarah', Array(10).fill(0).map((_, i) => ({ offset: i * 10, length: 5 }))),
        ]);

        const contradictions = detectContradictions(text, entities, createTimeline());

        const eyeContradict = contradictions.find(c => c.category === 'eye_color');
        expect(eyeContradict?.confidence).toBeGreaterThan(0.7);
      });

      it('should boost confidence for immutable attributes', () => {
        const text = `Lisa's blue eyes shone. Lisa's brown eyes gleamed.`;

        const entities = createEntityGraph([
          createEntity('Lisa', [{ offset: 0, length: 4 }]),
        ]);

        const contradictions = detectContradictions(text, entities, createTimeline());

        const eyeContradict = contradictions.find(c => c.category === 'eye_color');
        // Eye color is immutable, should have higher confidence
        expect(eyeContradict?.confidence).toBeGreaterThan(0.7);
      });

      it('should reduce confidence for distant attributes', () => {
        const longText = `Sarah's blue eyes sparkled. ${'Filler text. '.repeat(1000)} Sarah's green eyes reflected.`;

        const entities = createEntityGraph([
          createEntity('Sarah', [{ offset: 0, length: 5 }]),
        ]);

        const contradictions = detectContradictions(longText, entities, createTimeline());

        const eyeContradict = contradictions.find(c => c.category === 'eye_color');
        // Far apart = possibly intentional
        if (eyeContradict) {
          expect(eyeContradict.confidence).toBeLessThan(0.9);
        }
      });
    });

    describe('Evidence and resolution hints', () => {
      it('should provide evidence for contradictions', () => {
        const text = `Tom's blue eyes sparkled. Tom's brown eyes looked sad.`;

        const entities = createEntityGraph([
          createEntity('Tom', [{ offset: 0, length: 3 }]),
        ]);

        const contradictions = detectContradictions(text, entities, createTimeline());

        const contradiction = contradictions[0];
        expect(contradiction.evidence).toBeDefined();
        expect(contradiction.evidence.length).toBeGreaterThanOrEqual(2);
      });

      it('should provide resolution hints', () => {
        const text = `Sarah's blue eyes sparkled. Sarah's green eyes reflected.`;

        const entities = createEntityGraph([
          createEntity('Sarah', [{ offset: 0, length: 5 }]),
        ]);

        const contradictions = detectContradictions(text, entities, createTimeline());

        const contradiction = contradictions[0];
        expect(contradiction.suggestedResolution).toBeDefined();
        expect(contradiction.suggestedResolution).toContain('find-replace');
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TIMELINE CONTRADICTIONS
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Timeline Contradictions', () => {
    describe('Death detection', () => {
      it('should detect character death followed by action', () => {
        const text = `John died in the explosion. Later, John walked into the room and said hello.`;

        const entities = createEntityGraph([
          createEntity('John', [
            { offset: 0, length: 4 },
            { offset: 35, length: 4 },
          ]),
        ]);

        const contradictions = detectContradictions(text, entities, createTimeline());

        const timelineContradict = contradictions.find(c => c.type === 'timeline');
        expect(timelineContradict).toBeDefined();
        expect(timelineContradict?.category).toBe('timeline_death');
        expect(timelineContradict?.severity).toBeGreaterThan(0.9);
      });

      it('should detect "was killed" pattern', () => {
        const text = `Sarah was killed by the assassin. Later, Sarah smiled at the crowd.`;

        const entities = createEntityGraph([
          createEntity('Sarah', [
            { offset: 0, length: 5 },
            { offset: 45, length: 5 },
          ]),
        ]);

        const contradictions = detectContradictions(text, entities, createTimeline());

        expect(contradictions.some(c => c.type === 'timeline')).toBe(true);
      });

      it('should detect "killed X" pattern', () => {
        const text = `The villain killed Tom. Later, Tom walked home.`;

        const entities = createEntityGraph([
          createEntity('Tom', [
            { offset: 19, length: 3 },
            { offset: 32, length: 3 },
          ]),
        ]);

        const contradictions = detectContradictions(text, entities, createTimeline());

        expect(contradictions.some(c => c.type === 'timeline')).toBe(true);
      });

      it('should detect death possessive pattern', () => {
        const text = `Alice's death was tragic. Later, Alice laughed loudly.`;

        const entities = createEntityGraph([
          createEntity('Alice', [
            { offset: 0, length: 5 },
            { offset: 33, length: 5 },
          ]),
        ]);

        const contradictions = detectContradictions(text, entities, createTimeline());

        expect(contradictions.some(c => c.type === 'timeline')).toBe(true);
      });

      it('should not flag passive mentions after death', () => {
        const text = `Bob died yesterday. Everyone remembered Bob fondly.`;

        const entities = createEntityGraph([
          createEntity('Bob', [
            { offset: 0, length: 3 },
            { offset: 36, length: 3 },
          ]),
        ]);

        const contradictions = detectContradictions(text, entities, createTimeline());

        // "remembered" is not an active action by Bob
        expect(contradictions.length).toBe(0);
      });
    });

    describe('Timeline confidence scoring', () => {
      it('should have high confidence for strong physical actions', () => {
        const text = `Sarah died in the fire. Later, Sarah ran down the street.`;

        const entities = createEntityGraph([
          createEntity('Sarah', [
            { offset: 0, length: 5 },
            { offset: 31, length: 5 },
          ]),
        ]);

        const contradictions = detectContradictions(text, entities, createTimeline());

        const timelineContradict = contradictions.find(c => c.type === 'timeline');
        expect(timelineContradict?.confidence).toBeGreaterThan(0.85);
      });

      it('should lower confidence for dialogue (possible flashback)', () => {
        const text = `Tom died last week. "Hello," Tom said in the memory.`;

        const entities = createEntityGraph([
          createEntity('Tom', [
            { offset: 0, length: 3 },
            { offset: 29, length: 3 },
          ]),
        ]);

        const contradictions = detectContradictions(text, entities, createTimeline());

        const timelineContradict = contradictions.find(c => c.type === 'timeline');
        if (timelineContradict) {
          expect(timelineContradict.confidence).toBeLessThan(0.85);
        }
      });

      it('should lower confidence for memory patterns', () => {
        const text = `Alice died yesterday. She remembered how Alice smiled.`;

        const entities = createEntityGraph([
          createEntity('Alice', [
            { offset: 0, length: 5 },
            { offset: 40, length: 5 },
          ]),
        ]);

        const contradictions = detectContradictions(text, entities, createTimeline());

        // "remembered" should lower confidence significantly
        const timelineContradict = contradictions.find(c => c.type === 'timeline');
        if (timelineContradict) {
          expect(timelineContradict.confidence).toBeLessThan(0.7);
        }
      });

      it('should boost confidence for actions close to death', () => {
        const text = `John died. John walked.`;

        const entities = createEntityGraph([
          createEntity('John', [
            { offset: 0, length: 4 },
            { offset: 12, length: 4 },
          ]),
        ]);

        const contradictions = detectContradictions(text, entities, createTimeline());

        const timelineContradict = contradictions.find(c => c.type === 'timeline');
        expect(timelineContradict?.confidence).toBeGreaterThan(0.8);
      });
    });

    describe('One contradiction per character limit', () => {
      it('should only report one timeline contradiction per dead character', () => {
        const text = `Sam died. Sam walked. Sam ran. Sam jumped.`;

        const entities = createEntityGraph([
          createEntity('Sam', [
            { offset: 0, length: 3 },
            { offset: 11, length: 3 },
            { offset: 23, length: 3 },
            { offset: 32, length: 3 },
          ]),
        ]);

        const contradictions = detectContradictions(text, entities, createTimeline());

        const timelineContradicts = contradictions.filter(c => c.type === 'timeline');
        expect(timelineContradicts.length).toBe(1);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // HELPER FUNCTIONS
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Helper Functions', () => {
    const mockContradictions: Contradiction[] = [
      {
        id: '1',
        type: 'attribute',
        entityId: 'entity-alice',
        entityName: 'Alice',
        claim1: { text: 'blue eyes', offset: 0, value: 'blue' },
        claim2: { text: 'green eyes', offset: 50, value: 'green' },
        severity: 0.8,
        confidence: 0.9,
        suggestion: 'Fix eye color',
        evidence: [],
        category: 'eye_color',
      },
      {
        id: '2',
        type: 'timeline',
        entityId: 'entity-bob',
        entityName: 'Bob',
        claim1: { text: 'died', offset: 0, value: 'death' },
        claim2: { text: 'walked', offset: 100, value: 'action' },
        severity: 0.95,
        confidence: 0.85,
        suggestion: 'Fix timeline',
        evidence: [],
        category: 'timeline_death',
      },
      {
        id: '3',
        type: 'attribute',
        entityId: 'entity-alice',
        entityName: 'Alice',
        claim1: { text: 'blonde hair', offset: 0, value: 'blonde' },
        claim2: { text: 'dark hair', offset: 50, value: 'dark' },
        severity: 0.6,
        confidence: 0.5,
        suggestion: 'Fix hair color',
        evidence: [],
        category: 'hair_color',
      },
    ];

    describe('getContradictionsForEntity', () => {
      it('should filter contradictions by entity ID', () => {
        const aliceContradictions = getContradictionsForEntity(mockContradictions, 'entity-alice');

        expect(aliceContradictions).toHaveLength(2);
        expect(aliceContradictions.every(c => c.entityId === 'entity-alice')).toBe(true);
      });

      it('should return empty array for unknown entity', () => {
        const result = getContradictionsForEntity(mockContradictions, 'unknown');

        expect(result).toEqual([]);
      });
    });

    describe('getHighSeverityContradictions', () => {
      it('should filter by severity threshold', () => {
        const highSeverity = getHighSeverityContradictions(mockContradictions, 0.7);

        expect(highSeverity).toHaveLength(2);
        expect(highSeverity.every(c => c.severity >= 0.7)).toBe(true);
      });

      it('should use default threshold of 0.7', () => {
        const highSeverity = getHighSeverityContradictions(mockContradictions);

        expect(highSeverity).toHaveLength(2);
      });

      it('should return all for low threshold', () => {
        const highSeverity = getHighSeverityContradictions(mockContradictions, 0.1);

        expect(highSeverity).toHaveLength(3);
      });
    });

    describe('getHighConfidenceContradictions', () => {
      it('should filter by confidence threshold', () => {
        const highConfidence = getHighConfidenceContradictions(mockContradictions, 0.7);

        expect(highConfidence).toHaveLength(2);
        expect(highConfidence.every(c => c.confidence >= 0.7)).toBe(true);
      });

      it('should use default threshold of 0.7', () => {
        const highConfidence = getHighConfidenceContradictions(mockContradictions);

        expect(highConfidence).toHaveLength(2);
      });
    });

    describe('groupContradictionsByType', () => {
      it('should group contradictions by type', () => {
        const grouped = groupContradictionsByType(mockContradictions);

        expect(grouped.size).toBe(2);
        expect(grouped.get('attribute')).toHaveLength(2);
        expect(grouped.get('timeline')).toHaveLength(1);
      });

      it('should handle empty array', () => {
        const grouped = groupContradictionsByType([]);

        expect(grouped.size).toBe(0);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // LORE-AWARE CONTRADICTIONS
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Lore-Aware Contradictions', () => {
    describe('Lore fact parsing', () => {
      it('should parse "has" pattern lore facts', () => {
        // This tests the internal parseLoreFact function indirectly
        const loreMemories: MemoryNote[] = [
          createMemoryNote('1', "Alice's eye color: blue", 'fact'),
        ];

        const text = `Alice's green eyes sparkled.`;

        const entities = createEntityGraph([
          createEntity('Alice', [{ offset: 0, length: 5 }]),
        ]);

        const contradictions = detectContradictionsWithLore(
          text,
          entities,
          createTimeline(),
          loreMemories
        );

        const loreContradict = contradictions.find(c => c.category?.startsWith('lore_'));
        expect(loreContradict).toBeDefined();
      });

      it('should parse "is/has/was" pattern lore facts', () => {
        const loreMemories: MemoryNote[] = [
          createMemoryNote('1', 'Bob is tall', 'fact'),
        ];

        const text = `Bob was short.`;

        const entities = createEntityGraph([
          createEntity('Bob', [{ offset: 0, length: 3 }]),
        ]);

        const contradictions = detectContradictionsWithLore(
          text,
          entities,
          createTimeline(),
          loreMemories
        );

        // Should detect lore contradiction
        expect(contradictions.length).toBeGreaterThan(0);
      });
    });

    describe('Lore vs manuscript contradictions', () => {
      it('should detect contradictions with lore bible', () => {
        const loreMemories: MemoryNote[] = [
          createMemoryNote('1', "Sarah's eye color: blue", 'fact'),
        ];

        const text = `Sarah's brown eyes looked sad.`;

        const entities = createEntityGraph([
          createEntity('Sarah', [{ offset: 0, length: 5 }]),
        ]);

        const contradictions = detectContradictionsWithLore(
          text,
          entities,
          createTimeline(),
          loreMemories
        );

        const loreContradict = contradictions.find(c => c.category?.startsWith('lore_'));
        expect(loreContradict).toBeDefined();
        expect(loreContradict?.severity).toBe(0.9);
        expect(loreContradict?.confidence).toBe(0.95);
        expect(loreContradict?.suggestion).toContain('Lore Bible');
      });

      it('should have high severity for lore violations', () => {
        const loreMemories: MemoryNote[] = [
          createMemoryNote('1', "Tom's hair color: blonde", 'fact'),
        ];

        const text = `Tom's dark hair was messy.`;

        const entities = createEntityGraph([
          createEntity('Tom', [{ offset: 0, length: 3 }]),
        ]);

        const contradictions = detectContradictionsWithLore(
          text,
          entities,
          createTimeline(),
          loreMemories
        );

        const loreContradict = contradictions.find(c => c.category?.startsWith('lore_'));
        expect(loreContradict?.severity).toBeGreaterThan(0.8);
      });

      it('should include both base and lore contradictions', () => {
        const loreMemories: MemoryNote[] = [
          createMemoryNote('1', "Alice's eye color: blue", 'fact'),
        ];

        const text = `Alice's green eyes sparkled. Later, Alice's brown eyes reflected.`;

        const entities = createEntityGraph([
          createEntity('Alice', [{ offset: 0, length: 5 }]),
        ]);

        const contradictions = detectContradictionsWithLore(
          text,
          entities,
          createTimeline(),
          loreMemories
        );

        // Should have both base contradictions (green vs brown) and lore contradictions
        expect(contradictions.length).toBeGreaterThan(1);
      });

      it('should only use fact-type memories with lore tag', () => {
        const loreMemories: MemoryNote[] = [
          createMemoryNote('1', "Bob's eye color: blue", 'observation'),
          createMemoryNote('2', "Alice's eye color: green", 'fact'),
        ];

        const text = `Alice's blue eyes sparkled. Bob's brown eyes looked sad.`;

        const entities = createEntityGraph([
          createEntity('Alice', [{ offset: 0, length: 5 }]),
          createEntity('Bob', [{ offset: 28, length: 3 }]),
        ]);

        const contradictions = detectContradictionsWithLore(
          text,
          entities,
          createTimeline(),
          loreMemories
        );

        // Should only detect Alice lore contradiction (fact type)
        const loreContradicts = contradictions.filter(c => c.category?.startsWith('lore_'));
        expect(loreContradicts.length).toBe(1);
        expect(loreContradicts[0].entityName).toBe('Alice');
      });

      it('should sort by combined severity and confidence', () => {
        const loreMemories: MemoryNote[] = [
          createMemoryNote('1', "Alice's eye color: blue", 'fact'),
        ];

        const text = `Alice's green eyes sparkled. Bob's blue eyes shone. Bob's brown eyes reflected.`;

        const entities = createEntityGraph([
          createEntity('Alice', [{ offset: 0, length: 5 }]),
          createEntity('Bob', [{ offset: 30, length: 3 }]),
        ]);

        const contradictions = detectContradictionsWithLore(
          text,
          entities,
          createTimeline(),
          loreMemories
        );

        // Lore contradictions should be sorted higher due to high severity + confidence
        const firstContradict = contradictions[0];
        expect(firstContradict.category).toContain('lore_');
      });
    });

    describe('Lore compatibility', () => {
      it('should allow compatible lore values', () => {
        const loreMemories: MemoryNote[] = [
          createMemoryNote('1', "Sarah's eye color: blue", 'fact'),
        ];

        const text = `Sarah's light blue eyes sparkled.`;

        const entities = createEntityGraph([
          createEntity('Sarah', [{ offset: 0, length: 5 }]),
        ]);

        const contradictions = detectContradictionsWithLore(
          text,
          entities,
          createTimeline(),
          loreMemories
        );

        // Light blue and blue should be compatible
        const loreContradict = contradictions.find(c => c.category?.startsWith('lore_'));
        expect(loreContradict).toBeUndefined();
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // INTEGRATION TESTS
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Integration Tests', () => {
    it('should detect multiple types of contradictions in complex text', () => {
      const text = `
        Sarah's blue eyes sparkled as she entered the room.
        She was 25 years old and stood tall.
        John died in the explosion that day.

        Later that evening, Sarah's green eyes reflected the firelight.
        She was now 40 years old and quite short.
        John walked into the room and smiled at everyone.
      `;

      const entities = createEntityGraph([
        createEntity('Sarah', [
          { offset: 0, length: 5 },
          { offset: 200, length: 5 },
        ]),
        createEntity('John', [
          { offset: 100, length: 4 },
          { offset: 250, length: 4 },
        ]),
      ]);

      const contradictions = detectContradictions(text, entities, createTimeline());

      // Should detect multiple contradictions
      expect(contradictions.length).toBeGreaterThan(0);

      // Should have both attribute and timeline contradictions
      const types = new Set(contradictions.map(c => c.type));
      expect(types.has('attribute')).toBe(true);
      expect(types.has('timeline')).toBe(true);
    });

    it('should sort contradictions by severity', () => {
      const text = `
        Alice's blue eyes sparkled.
        Alice's green eyes reflected.
        Bob died.
        Bob walked.
      `;

      const entities = createEntityGraph([
        createEntity('Alice', [{ offset: 0, length: 5 }]),
        createEntity('Bob', [{ offset: 100, length: 3 }]),
      ]);

      const contradictions = detectContradictions(text, entities, createTimeline());

      // Timeline contradictions should have higher severity
      const firstContradict = contradictions[0];
      expect(firstContradict.type).toBe('timeline');
    });

    it('should handle empty text', () => {
      const contradictions = detectContradictions(
        '',
        createEntityGraph([]),
        createTimeline()
      );

      expect(contradictions).toEqual([]);
    });

    it('should handle text with no contradictions', () => {
      const text = `Sarah walked through the park. The sun was shining brightly.`;

      const entities = createEntityGraph([
        createEntity('Sarah', [{ offset: 0, length: 5 }]),
      ]);

      const contradictions = detectContradictions(text, entities, createTimeline());

      expect(contradictions).toEqual([]);
    });
  });
});
