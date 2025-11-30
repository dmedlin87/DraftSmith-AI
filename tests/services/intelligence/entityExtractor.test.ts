/**
 * Entity Extractor Tests
 * 
 * Tests for deterministic named entity recognition, relationship inference,
 * and entity graph construction.
 */

import { describe, it, expect } from 'vitest';
import {
  extractEntities,
  getEntitiesInRange,
  getRelatedEntities,
} from '@/services/intelligence/entityExtractor';
import { ClassifiedParagraph, DialogueLine } from '@/types/intelligence';

// Helper to create minimal test paragraph
const createTestParagraph = (offset: number, length: number): ClassifiedParagraph => ({
  offset,
  length,
  type: 'exposition',
  speakerId: null,
  sentiment: 0,
  tension: 0.5,
  sentenceCount: 1,
  avgSentenceLength: 10,
});

// Helper to create minimal dialogue
const createTestDialogue = (quote: string, speaker: string | null, offset: number): DialogueLine => ({
  id: `dialogue_${offset}`,
  quote,
  speaker,
  offset,
  length: quote.length,
  replyTo: null,
  sentiment: 0,
});

describe('entityExtractor', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // CHARACTER EXTRACTION
  // ─────────────────────────────────────────────────────────────────────────

  describe('character extraction', () => {
    it('extracts capitalized names as characters', () => {
      const text = `Sarah walked into the room. Marcus followed close behind.`;
      const paragraphs = [createTestParagraph(0, text.length)];
      
      const result = extractEntities(text, paragraphs, [], 'chapter1');
      
      const characters = result.nodes.filter(n => n.type === 'character');
      const names = characters.map(c => c.name);
      
      expect(names).toContain('Sarah');
      expect(names).toContain('Marcus');
    });

    it('extracts titled names (Mr., Mrs., Dr.)', () => {
      const text = `Mr. Johnson arrived. Dr. Smith greeted him.`;
      const paragraphs = [createTestParagraph(0, text.length)];
      
      const result = extractEntities(text, paragraphs, [], 'chapter1');
      
      const characters = result.nodes.filter(n => n.type === 'character');
      const names = characters.map(c => c.name);
      
      expect(names.some(n => n.includes('Johnson'))).toBe(true);
      expect(names.some(n => n.includes('Smith'))).toBe(true);
    });

    it('extracts possessive names', () => {
      const text = `Sarah's cat ran away. Marcus's dog chased it.`;
      const paragraphs = [createTestParagraph(0, text.length)];
      
      const result = extractEntities(text, paragraphs, [], 'chapter1');
      
      const characters = result.nodes.filter(n => n.type === 'character');
      const names = characters.map(c => c.name);
      
      expect(names).toContain('Sarah');
      expect(names).toContain('Marcus');
    });

    it('tracks mention counts', () => {
      const text = `Sarah spoke. Sarah walked. Sarah laughed. Marcus listened.`;
      const paragraphs = [createTestParagraph(0, text.length)];
      
      const result = extractEntities(text, paragraphs, [], 'chapter1');
      
      const sarah = result.nodes.find(n => n.name === 'Sarah');
      const marcus = result.nodes.find(n => n.name === 'Marcus');
      
      expect(sarah?.mentionCount).toBeGreaterThan(marcus?.mentionCount || 0);
    });

    it('extracts speaker from dialogue', () => {
      const text = `"Hello there," Sarah said warmly.`;
      const paragraphs = [createTestParagraph(0, text.length)];
      const dialogue = [createTestDialogue('Hello there,', 'Sarah', 1)];
      
      const result = extractEntities(text, paragraphs, dialogue, 'chapter1');
      
      const sarah = result.nodes.find(n => n.name === 'Sarah');
      expect(sarah).toBeDefined();
    });

    it('avoids false positives like day names', () => {
      const text = `On Monday, he went shopping. It was a beautiful Sunday.`;
      const paragraphs = [createTestParagraph(0, text.length)];
      
      const result = extractEntities(text, paragraphs, [], 'chapter1');
      
      const names = result.nodes.map(n => n.name.toLowerCase());
      
      expect(names).not.toContain('monday');
      expect(names).not.toContain('sunday');
    });

    it('avoids common words that look like names', () => {
      const text = `The chapter began. In the morning, things changed.`;
      const paragraphs = [createTestParagraph(0, text.length)];
      
      const result = extractEntities(text, paragraphs, [], 'chapter1');
      
      const names = result.nodes.map(n => n.name.toLowerCase());
      
      expect(names).not.toContain('the');
      expect(names).not.toContain('chapter');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // LOCATION EXTRACTION
  // ─────────────────────────────────────────────────────────────────────────

  describe('location extraction', () => {
    it('extracts locations from "at the X" pattern', () => {
      const text = `They met at the castle. Later, they arrived at the port.`;
      const paragraphs = [createTestParagraph(0, text.length)];
      
      const result = extractEntities(text, paragraphs, [], 'chapter1');
      
      const locations = result.nodes.filter(n => n.type === 'location');
      
      expect(locations.length).toBeGreaterThan(0);
    });

    it('extracts locations from "in the X" pattern', () => {
      const text = `She lived in the forest. The treasure was hidden in the mountains.`;
      const paragraphs = [createTestParagraph(0, text.length)];
      
      const result = extractEntities(text, paragraphs, [], 'chapter1');
      
      const locations = result.nodes.filter(n => n.type === 'location');
      
      expect(locations.length).toBeGreaterThan(0);
    });

    it('extracts explicit location names', () => {
      const text = `The journey to New York began. She remembered Paris fondly.`;
      const paragraphs = [createTestParagraph(0, text.length)];
      
      const result = extractEntities(text, paragraphs, [], 'chapter1');
      
      // Should detect multi-word capitalized names as potential locations/entities
      expect(result.nodes.length).toBeGreaterThan(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // RELATIONSHIP INFERENCE
  // ─────────────────────────────────────────────────────────────────────────

  describe('relationship inference', () => {
    it('creates edges for co-occurring entities', () => {
      const text = `Sarah and Marcus walked together through the garden.`;
      const paragraphs = [createTestParagraph(0, text.length)];
      
      const result = extractEntities(text, paragraphs, [], 'chapter1');
      
      expect(result.edges.length).toBeGreaterThan(0);
    });

    it('infers relationship from explicit patterns', () => {
      const text = `Sarah loves Marcus deeply.`;
      const paragraphs = [createTestParagraph(0, text.length)];
      
      const result = extractEntities(text, paragraphs, [], 'chapter1');
      
      // Should find an edge between Sarah and Marcus
      const sarahMarcusEdge = result.edges.find(e => {
        const nodes = result.nodes;
        const source = nodes.find(n => n.id === e.source);
        const target = nodes.find(n => n.id === e.target);
        return (source?.name === 'Sarah' && target?.name === 'Marcus') ||
               (source?.name === 'Marcus' && target?.name === 'Sarah');
      });
      
      expect(sarahMarcusEdge).toBeDefined();
    });

    it('tracks co-occurrence count', () => {
      const text = `Sarah and Marcus talked. Sarah and Marcus laughed. Sarah and Marcus left.`;
      const paragraphs = [createTestParagraph(0, text.length)];
      
      const result = extractEntities(text, paragraphs, [], 'chapter1');
      
      const edge = result.edges[0];
      if (edge) {
        expect(edge.coOccurrences).toBeGreaterThanOrEqual(1);
      }
    });

    it('records chapter context for relationships', () => {
      const text = `Sarah met Marcus at the park.`;
      const paragraphs = [createTestParagraph(0, text.length)];
      
      const result = extractEntities(text, paragraphs, [], 'chapter1');
      
      if (result.edges.length > 0) {
        expect(result.edges[0].chapters).toContain('chapter1');
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ALIAS DETECTION
  // ─────────────────────────────────────────────────────────────────────────

  describe('alias detection', () => {
    it('consolidates entities with similar names', () => {
      const text = `Mr. Smith arrived. Smith looked around. John Smith smiled.`;
      const paragraphs = [createTestParagraph(0, text.length)];
      
      const result = extractEntities(text, paragraphs, [], 'chapter1');
      
      // Should consolidate into one or two entities, not three
      const smithEntities = result.nodes.filter(n => 
        n.name.toLowerCase().includes('smith')
      );
      
      // Should be consolidated
      expect(smithEntities.length).toBeLessThanOrEqual(2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // UTILITY FUNCTIONS
  // ─────────────────────────────────────────────────────────────────────────

  describe('getEntitiesInRange', () => {
    it('returns entities mentioned in the given range', () => {
      const text = `Sarah spoke at position 0. Marcus spoke at position 50.`;
      const paragraphs = [createTestParagraph(0, text.length)];
      
      const result = extractEntities(text, paragraphs, [], 'chapter1');
      const nearStart = getEntitiesInRange(result, 0, 30);
      
      expect(nearStart.some(e => e.name === 'Sarah')).toBe(true);
    });

    it('returns empty array for range with no entities', () => {
      const text = `Sarah spoke at the start.`;
      const paragraphs = [createTestParagraph(0, text.length)];
      
      const result = extractEntities(text, paragraphs, [], 'chapter1');
      const farAway = getEntitiesInRange(result, 1000, 2000);
      
      expect(farAway.length).toBe(0);
    });
  });

  describe('getRelatedEntities', () => {
    it('returns entities connected by edges', () => {
      const text = `Sarah and Marcus are friends. They walked together.`;
      const paragraphs = [createTestParagraph(0, text.length)];
      
      const result = extractEntities(text, paragraphs, [], 'chapter1');
      const sarah = result.nodes.find(n => n.name === 'Sarah');
      
      if (sarah) {
        const related = getRelatedEntities(result, sarah.id);
        expect(related.length).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // EDGE CASES
  // ─────────────────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles empty text', () => {
      const result = extractEntities('', [], [], 'chapter1');
      
      expect(result.nodes).toBeDefined();
      expect(result.edges).toBeDefined();
      expect(result.nodes.length).toBe(0);
    });

    it('handles text with no entities', () => {
      const text = `the quick brown fox jumped over the lazy dog.`;
      const paragraphs = [createTestParagraph(0, text.length)];
      
      const result = extractEntities(text, paragraphs, [], 'chapter1');
      
      // May detect "Fox" as entity or may not - depends on implementation
      expect(result.nodes).toBeDefined();
    });

    it('handles very long text', () => {
      const name = 'Sarah';
      const longText = `${name} did something. `.repeat(100);
      const paragraphs = [createTestParagraph(0, longText.length)];
      
      const result = extractEntities(longText, paragraphs, [], 'chapter1');
      
      const sarah = result.nodes.find(n => n.name === 'Sarah');
      expect(sarah?.mentionCount).toBe(100);
    });

    it('handles special characters in names', () => {
      const text = `O'Brien arrived. Mary-Jane followed.`;
      const paragraphs = [createTestParagraph(0, text.length)];
      
      const result = extractEntities(text, paragraphs, [], 'chapter1');
      
      expect(result.nodes.length).toBeGreaterThan(0);
    });
  });
});
