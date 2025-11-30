/**
 * Structural Parser Tests
 * 
 * Tests for scene detection, paragraph classification, dialogue extraction,
 * and structural statistics computation.
 */

import { describe, it, expect } from 'vitest';
import {
  parseStructure,
  getSceneAtOffset,
  getParagraphAtOffset,
} from '@/services/intelligence/structuralParser';

describe('structuralParser', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // SCENE DETECTION
  // ─────────────────────────────────────────────────────────────────────────

  describe('scene detection', () => {
    it('detects scene break on section divider (* * *)', () => {
      const text = `Scene one content here. It has some narrative.

* * *

Scene two content here. Different scene now.`;
      
      const result = parseStructure(text);
      expect(result.scenes.length).toBeGreaterThanOrEqual(2);
    });

    it('detects scene break on chapter heading', () => {
      const text = `Content from chapter one.

Chapter 2

More content from chapter two.`;
      
      const result = parseStructure(text);
      expect(result.scenes.length).toBeGreaterThanOrEqual(2);
    });

    it('detects scene break on triple hash divider', () => {
      const text = `First scene.

###

Second scene.`;
      
      const result = parseStructure(text);
      expect(result.scenes.length).toBeGreaterThanOrEqual(2);
    });

    it('assigns higher tension to action-heavy scenes', () => {
      const actionText = `He ran down the alley. Gunshots echoed behind him. 
      She screamed and dove for cover. The explosion shattered every window.
      They fought desperately, punching and kicking.`;
      
      const calmText = `She walked slowly through the garden. The flowers swayed gently.
      He sat by the window, reading quietly. The afternoon passed peacefully.`;
      
      const actionResult = parseStructure(actionText);
      const calmResult = parseStructure(calmText);
      
      expect(actionResult.scenes[0].tension).toBeGreaterThan(calmResult.scenes[0].tension);
    });

    it('identifies POV character from pronouns', () => {
      const text = `Sarah looked at the mansion. She felt a chill run down her spine.
      Her hands trembled as she reached for the door.`;
      
      const result = parseStructure(text);
      expect(result.scenes[0].pov).toBeDefined();
    });

    it('calculates scene boundaries correctly', () => {
      const text = `Scene one starts here.

* * *

Scene two starts here.`;
      
      const result = parseStructure(text);
      
      if (result.scenes.length >= 2) {
        // Scene boundaries should not overlap
        expect(result.scenes[0].endOffset).toBeLessThanOrEqual(result.scenes[1].startOffset);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PARAGRAPH CLASSIFICATION
  // ─────────────────────────────────────────────────────────────────────────

  describe('paragraph classification', () => {
    it('identifies dialogue paragraphs', () => {
      const text = `"Hello," she said. "How are you today?"

"I'm doing well," he replied. "Thanks for asking."`;
      
      const result = parseStructure(text);
      const dialogueParagraphs = result.paragraphs.filter(p => p.type === 'dialogue');
      
      expect(dialogueParagraphs.length).toBeGreaterThan(0);
    });

    it('identifies action paragraphs', () => {
      const text = `He jumped over the fence and sprinted down the alley. 
      Dodging obstacles, he raced toward the exit.`;
      
      const result = parseStructure(text);
      const actionParagraphs = result.paragraphs.filter(p => p.type === 'action');
      
      expect(actionParagraphs.length).toBeGreaterThan(0);
    });

    it('identifies exposition paragraphs', () => {
      const text = `The city had been founded three centuries ago by settlers from the east.
      Its architecture reflected a blend of colonial and modern influences,
      with cobblestone streets winding between towering glass buildings.`;
      
      const result = parseStructure(text);
      const expositionParagraphs = result.paragraphs.filter(p => p.type === 'exposition');
      
      expect(expositionParagraphs.length).toBeGreaterThan(0);
    });

    it('identifies internal/introspection paragraphs', () => {
      const text = `She wondered what would happen next. If only she had made different choices.
      Perhaps things would have turned out differently. She thought about the past.`;
      
      const result = parseStructure(text);
      const internalParagraphs = result.paragraphs.filter(p => p.type === 'internal');
      
      expect(internalParagraphs.length).toBeGreaterThan(0);
    });

    it('calculates paragraph statistics', () => {
      const text = `Short sentence. Another short one.

This is a much longer sentence that contains many more words and goes on for a while to test the average calculation.`;
      
      const result = parseStructure(text);
      
      expect(result.paragraphs.length).toBeGreaterThan(0);
      expect(result.paragraphs[0].length).toBeGreaterThan(0);
      expect(result.paragraphs[0].sentenceCount).toBeGreaterThan(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DIALOGUE EXTRACTION
  // ─────────────────────────────────────────────────────────────────────────

  describe('dialogue extraction', () => {
    it('extracts dialogue with double quotes', () => {
      const text = `"Hello, world," she said.`;
      
      const result = parseStructure(text);
      
      expect(result.dialogueMap.length).toBeGreaterThan(0);
      expect(result.dialogueMap[0].quote).toBe('Hello, world,');
    });

    it('extracts dialogue with single quotes', () => {
      const text = `'Hello, world,' she said.`;
      
      const result = parseStructure(text);
      
      expect(result.dialogueMap.length).toBeGreaterThan(0);
    });

    it('identifies speaker from dialogue tag', () => {
      const text = `"I need to go," Sarah said urgently.`;
      
      const result = parseStructure(text);
      
      if (result.dialogueMap.length > 0) {
        expect(result.dialogueMap[0].speaker).toBe('Sarah');
      }
    });

    it('handles multiple dialogue in same paragraph', () => {
      const text = `"Hello," she said. "How are you?" she asked.`;
      
      const result = parseStructure(text);
      
      expect(result.dialogueMap.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // STRUCTURAL STATISTICS
  // ─────────────────────────────────────────────────────────────────────────

  describe('structural statistics', () => {
    it('calculates total word count', () => {
      const text = `One two three four five. Six seven eight nine ten.`;
      
      const result = parseStructure(text);
      
      expect(result.stats.totalWords).toBe(10);
    });

    it('calculates total sentence count', () => {
      const text = `First sentence. Second sentence! Third sentence?`;
      
      const result = parseStructure(text);
      
      expect(result.stats.totalSentences).toBe(3);
    });

    it('calculates average sentence length', () => {
      const text = `One two. Three four five six.`;
      // 2 words + 4 words = 6 words / 2 sentences = 3 avg
      
      const result = parseStructure(text);
      
      expect(result.stats.avgSentenceLength).toBe(3);
    });

    it('calculates dialogue ratio', () => {
      const text = `"Hello," she said. More narrative here that is not dialogue at all.`;
      
      const result = parseStructure(text);
      
      expect(result.stats.dialogueRatio).toBeGreaterThan(0);
      expect(result.stats.dialogueRatio).toBeLessThan(1);
    });

    it('counts scenes', () => {
      const text = `Scene one.

* * *

Scene two.

* * *

Scene three.`;
      
      const result = parseStructure(text);
      
      expect(result.stats.sceneCount).toBeGreaterThanOrEqual(2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // UTILITY FUNCTIONS
  // ─────────────────────────────────────────────────────────────────────────

  describe('getSceneAtOffset', () => {
    it('returns scene containing the offset', () => {
      const text = `Scene one content.

* * *

Scene two content.`;
      
      const result = parseStructure(text);
      const scene = getSceneAtOffset(result, 5);
      
      expect(scene).toBeDefined();
      expect(scene?.startOffset).toBeLessThanOrEqual(5);
    });

    it('returns null for offset outside all scenes', () => {
      const text = `Short text.`;
      
      const result = parseStructure(text);
      const scene = getSceneAtOffset(result, 99999);
      
      expect(scene).toBeNull();
    });
  });

  describe('getParagraphAtOffset', () => {
    it('returns paragraph containing the offset', () => {
      const text = `First paragraph here.

Second paragraph here.`;
      
      const result = parseStructure(text);
      const paragraph = getParagraphAtOffset(result, 5);
      
      expect(paragraph).toBeDefined();
      expect(paragraph?.offset).toBeLessThanOrEqual(5);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // EDGE CASES
  // ─────────────────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles empty text', () => {
      const result = parseStructure('');
      
      expect(result.scenes).toBeDefined();
      expect(result.paragraphs).toBeDefined();
      expect(result.stats.totalWords).toBe(0);
    });

    it('handles text with only whitespace', () => {
      const result = parseStructure('   \n\n   \t   ');
      
      expect(result.stats.totalWords).toBe(0);
    });

    it('handles very long text', () => {
      const longText = 'Word '.repeat(10000);
      
      const result = parseStructure(longText);
      
      expect(result.stats.totalWords).toBe(10000);
    });

    it('handles text with no dialogue', () => {
      const text = `The sun rose over the mountains. Birds flew overhead.`;
      
      const result = parseStructure(text);
      
      expect(result.stats.dialogueRatio).toBe(0);
    });

    it('handles text with only dialogue', () => {
      const text = `"Hello." "Hi there." "How are you?"`;
      
      const result = parseStructure(text);
      
      expect(result.stats.dialogueRatio).toBeGreaterThan(0.5);
    });
  });
});
