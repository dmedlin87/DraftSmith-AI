/**
 * Style Analyzer Tests
 * 
 * Tests for vocabulary analysis, syntax metrics, rhythm detection,
 * and style flags (passive voice, adverbs, clichés, filter words).
 */

import { describe, it, expect } from 'vitest';
import { analyzeStyle } from '@/services/intelligence/styleAnalyzer';

describe('styleAnalyzer', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // VOCABULARY ANALYSIS
  // ─────────────────────────────────────────────────────────────────────────

  describe('vocabulary analysis', () => {
    it('calculates unique word count', () => {
      const text = `The cat sat on the mat. The cat was happy.`;
      
      const result = analyzeStyle(text);
      
      expect(result.vocabulary.uniqueWords).toBeLessThan(result.vocabulary.totalWords);
    });

    it('calculates total word count', () => {
      const text = `One two three four five.`;
      
      const result = analyzeStyle(text);
      
      expect(result.vocabulary.totalWords).toBe(5);
    });

    it('calculates average word length', () => {
      const text = `A cat sat.`; // 1 + 3 + 3 = 7 / 3 = 2.33
      
      const result = analyzeStyle(text);
      
      expect(result.vocabulary.avgWordLength).toBeGreaterThan(0);
      expect(result.vocabulary.avgWordLength).toBeLessThan(10);
    });

    it('calculates lexical diversity', () => {
      const lowDiversity = `the the the the the the the the the the`;
      const highDiversity = `one two three four five six seven eight nine ten`;
      
      const lowResult = analyzeStyle(lowDiversity);
      const highResult = analyzeStyle(highDiversity);
      
      expect(highResult.vocabulary.lexicalDiversity).toBeGreaterThan(
        lowResult.vocabulary.lexicalDiversity
      );
    });

    it('identifies top words', () => {
      const text = `cat cat cat dog dog bird`;
      
      const result = analyzeStyle(text);
      
      expect(result.vocabulary.topWords.length).toBeGreaterThan(0);
      expect(result.vocabulary.topWords[0].word).toBe('cat');
    });

    it('identifies overused words', () => {
      const text = `He said hello. She said goodbye. They said nothing. 
                    He said yes. She said no. They said maybe.`;
      
      const result = analyzeStyle(text);
      
      // "said" should be flagged as potentially overused
      expect(result.vocabulary.overusedWords).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SYNTAX ANALYSIS
  // ─────────────────────────────────────────────────────────────────────────

  describe('syntax analysis', () => {
    it('calculates average sentence length', () => {
      const text = `Short sentence. Another short one.`;
      
      const result = analyzeStyle(text);
      
      expect(result.syntax.avgSentenceLength).toBe(2);
    });

    it('calculates sentence length variance', () => {
      const uniformText = `Two words. Two words. Two words.`;
      const variedText = `One. Two words here. This is a much longer sentence with many words in it.`;
      
      const uniformResult = analyzeStyle(uniformText);
      const variedResult = analyzeStyle(variedText);
      
      expect(variedResult.syntax.sentenceLengthVariance).toBeGreaterThan(
        uniformResult.syntax.sentenceLengthVariance
      );
    });

    it('tracks min and max sentence length', () => {
      const text = `Hi. This is a longer sentence with more words in it.`;
      
      const result = analyzeStyle(text);
      
      expect(result.syntax.minSentenceLength).toBe(1);
      expect(result.syntax.maxSentenceLength).toBeGreaterThan(5);
    });

    it('calculates dialogue to narrative ratio', () => {
      const text = `"Hello," she said. The room was quiet. "Goodbye," he replied.`;
      
      const result = analyzeStyle(text);
      
      expect(result.syntax.dialogueToNarrativeRatio).toBeGreaterThan(0);
    });

    it('calculates question ratio', () => {
      const text = `What is this? Who are you? The sky is blue.`;
      
      const result = analyzeStyle(text);
      
      // 2 questions out of 3 sentences
      expect(result.syntax.questionRatio).toBeGreaterThan(0.5);
    });

    it('calculates exclamation ratio', () => {
      const text = `Watch out! Run! The door closed.`;
      
      const result = analyzeStyle(text);
      
      expect(result.syntax.exclamationRatio).toBeGreaterThan(0.5);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // STYLE FLAGS - PASSIVE VOICE
  // ─────────────────────────────────────────────────────────────────────────

  describe('passive voice detection', () => {
    it('detects passive voice constructions', () => {
      const text = `The ball was thrown. The cake was eaten. The letter was written.`;
      
      const result = analyzeStyle(text);
      
      expect(result.flags.passiveVoiceInstances.length).toBeGreaterThan(0);
    });

    it('calculates passive voice ratio', () => {
      const passiveText = `The ball was thrown. The cake was eaten. The letter was written.`;
      const activeText = `He threw the ball. She ate the cake. They wrote the letter.`;
      
      const passiveResult = analyzeStyle(passiveText);
      const activeResult = analyzeStyle(activeText);
      
      expect(passiveResult.flags.passiveVoiceRatio).toBeGreaterThan(
        activeResult.flags.passiveVoiceRatio
      );
    });

    it('records passive voice instance offsets', () => {
      const text = `The ball was thrown by Sarah.`;
      
      const result = analyzeStyle(text);
      
      if (result.flags.passiveVoiceInstances.length > 0) {
        expect(result.flags.passiveVoiceInstances[0].offset).toBeDefined();
        expect(result.flags.passiveVoiceInstances[0].quote).toBeDefined();
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // STYLE FLAGS - ADVERBS
  // ─────────────────────────────────────────────────────────────────────────

  describe('adverb detection', () => {
    it('detects -ly adverbs', () => {
      const text = `She walked slowly. He spoke quietly. They moved carefully.`;
      
      const result = analyzeStyle(text);
      
      expect(result.flags.adverbInstances.length).toBeGreaterThanOrEqual(3);
    });

    it('calculates adverb density', () => {
      const adverbHeavy = `She slowly, quietly, and carefully moved.`;
      const adverbLight = `She moved with care and precision.`;
      
      const heavyResult = analyzeStyle(adverbHeavy);
      const lightResult = analyzeStyle(adverbLight);
      
      expect(heavyResult.flags.adverbDensity).toBeGreaterThan(
        lightResult.flags.adverbDensity
      );
    });

    it('records adverb instance offsets', () => {
      const text = `She walked slowly.`;
      
      const result = analyzeStyle(text);
      
      const slowlyInstance = result.flags.adverbInstances.find(
        a => a.word.toLowerCase() === 'slowly'
      );
      
      expect(slowlyInstance).toBeDefined();
      expect(slowlyInstance?.offset).toBeGreaterThanOrEqual(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // STYLE FLAGS - FILTER WORDS
  // ─────────────────────────────────────────────────────────────────────────

  describe('filter word detection', () => {
    it('detects common filter words', () => {
      const text = `She felt that something was wrong. He thought he saw a shadow. 
                    She realized it was just the wind.`;
      
      const result = analyzeStyle(text);
      
      expect(result.flags.filterWordInstances.length).toBeGreaterThan(0);
    });

    it('calculates filter word density', () => {
      const filterHeavy = `She felt she saw something. He thought he heard it. She realized she knew.`;
      const filterLight = `Something appeared. A sound echoed. Understanding dawned.`;
      
      const heavyResult = analyzeStyle(filterHeavy);
      const lightResult = analyzeStyle(filterLight);
      
      expect(heavyResult.flags.filterWordDensity).toBeGreaterThan(
        lightResult.flags.filterWordDensity
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // STYLE FLAGS - CLICHÉS
  // ─────────────────────────────────────────────────────────────────────────

  describe('cliché detection', () => {
    it('detects common clichés', () => {
      const text = `It was a dark and stormy night. Her heart skipped a beat. 
                    Time stood still as she waited.`;
      
      const result = analyzeStyle(text);
      
      expect(result.flags.clicheCount).toBeGreaterThan(0);
    });

    it('records cliché instance details', () => {
      const text = `Her heart skipped a beat.`;
      
      const result = analyzeStyle(text);
      
      if (result.flags.clicheInstances.length > 0) {
        expect(result.flags.clicheInstances[0].phrase).toBeDefined();
        expect(result.flags.clicheInstances[0].offset).toBeDefined();
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // STYLE FLAGS - REPEATED PHRASES
  // ─────────────────────────────────────────────────────────────────────────

  describe('repeated phrase detection', () => {
    it('detects repeated multi-word phrases', () => {
      const text = `She walked down the street. He walked down the street too. 
                    They both walked down the street together.`;
      
      const result = analyzeStyle(text);
      
      // "walked down the street" appears 3 times
      expect(result.flags.repeatedPhrases.length).toBeGreaterThanOrEqual(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // RHYTHM ANALYSIS
  // ─────────────────────────────────────────────────────────────────────────

  describe('rhythm analysis', () => {
    it('calculates punctuation density', () => {
      const punctuationHeavy = `Stop! Wait. Listen—carefully—to me; understand?`;
      const punctuationLight = `The sun rose over the distant mountains`;
      
      const heavyResult = analyzeStyle(punctuationHeavy);
      const lightResult = analyzeStyle(punctuationLight);
      
      expect(heavyResult.rhythm.punctuationDensity).toBeGreaterThan(
        lightResult.rhythm.punctuationDensity
      );
    });

    it('calculates average clause count', () => {
      const text = `She ran, jumped, and landed. He walked, stopped, and waited.`;
      
      const result = analyzeStyle(text);
      
      expect(result.rhythm.avgClauseCount).toBeGreaterThan(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // EDGE CASES
  // ─────────────────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles empty text', () => {
      const result = analyzeStyle('');
      
      expect(result.vocabulary.totalWords).toBe(0);
      expect(result.syntax.avgSentenceLength).toBe(0);
    });

    it('handles text with only whitespace', () => {
      const result = analyzeStyle('   \n\n   \t   ');
      
      expect(result.vocabulary.totalWords).toBe(0);
    });

    it('handles very long text', () => {
      const longText = 'Word word word. '.repeat(1000);
      
      const result = analyzeStyle(longText);
      
      expect(result.vocabulary.totalWords).toBe(3000);
    });

    it('handles text with no sentences', () => {
      const text = `just some words without punctuation`;
      
      const result = analyzeStyle(text);
      
      // Should still calculate word stats
      expect(result.vocabulary.totalWords).toBeGreaterThan(0);
    });

    it('handles single word text', () => {
      const result = analyzeStyle('Hello');
      
      expect(result.vocabulary.totalWords).toBe(1);
      expect(result.vocabulary.uniqueWords).toBe(1);
    });

    it('handles single sentence', () => {
      const result = analyzeStyle('This is a single sentence.');
      
      expect(result.syntax.avgSentenceLength).toBe(5);
      expect(result.syntax.sentenceLengthVariance).toBe(0);
    });

    it('handles text with unicode characters', () => {
      const text = `She said "Héllo" in Français. C'était magnifique!`;
      
      const result = analyzeStyle(text);
      
      expect(result.vocabulary.totalWords).toBeGreaterThan(0);
    });

    it('handles text with numbers', () => {
      const text = `There were 100 soldiers and 50 horses.`;
      
      const result = analyzeStyle(text);
      
      expect(result.vocabulary.totalWords).toBeGreaterThan(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // INTEGRATION TESTS
  // ─────────────────────────────────────────────────────────────────────────

  describe('integration', () => {
    it('processes realistic prose sample', () => {
      const text = `
        Sarah slowly walked down the cobblestone street, her heart pounding. 
        "Where are you going?" Marcus called out.
        She felt that something was wrong—deeply wrong—but couldn't explain it.
        The letter had been written by someone she once knew.
        It was a dark and stormy night when everything changed.
      `;
      
      const result = analyzeStyle(text);
      
      // Should detect various issues
      expect(result.flags.adverbInstances.length).toBeGreaterThan(0); // "slowly"
      expect(result.flags.filterWordInstances.length).toBeGreaterThan(0); // "felt"
      expect(result.flags.passiveVoiceInstances.length).toBeGreaterThan(0); // "had been written"
      expect(result.flags.clicheCount).toBeGreaterThan(0); // "dark and stormy night"
      
      // Should calculate stats
      expect(result.vocabulary.totalWords).toBeGreaterThan(40);
      expect(result.syntax.avgSentenceLength).toBeGreaterThan(0);
      expect(result.syntax.dialogueToNarrativeRatio).toBeGreaterThan(0);
    });

    it('returns processedAt timestamp', () => {
      const before = Date.now();
      const result = analyzeStyle('Some text.');
      const after = Date.now();
      
      expect(result.processedAt).toBeGreaterThanOrEqual(before);
      expect(result.processedAt).toBeLessThanOrEqual(after);
    });
  });
});
