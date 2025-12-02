import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';
import { parseManuscript, ParsedChapter } from '@/services/manuscriptParser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const loadFixture = (name: string) =>
  fs.readFileSync(path.resolve(__dirname, 'fixtures', 'manuscripts', name), 'utf8');

describe('parseManuscript', () => {
  describe('basic parsing', () => {
    it('parses text with no chapters as single chapter', () => {
      const text = 'This is some content without any chapter markers.';
      const result = parseManuscript(text);
      
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Chapter 1');
      expect(result[0].content).toContain('without any chapter markers');
    });

    it('returns trimmed content', () => {
      const text = '  \n\n  Some padded content  \n\n  ';
      const result = parseManuscript(text);
      
      expect(result[0].content).toBe('Some padded content');
    });
  });

  describe('explicit chapter headers', () => {
    it('splits on "Chapter X" headers', () => {
      const text = `Chapter 1
This is the first chapter content.

Chapter 2
This is the second chapter content.`;

      const result = parseManuscript(text);
      
      expect(result.length).toBeGreaterThanOrEqual(2);
      const titles = result.map(c => c.title.toLowerCase());
      expect(titles.some(t => t.includes('chapter 1') || t.includes('1'))).toBe(true);
    });

    it('handles markdown-style headers', () => {
      const text = `# Chapter One
Content of chapter one.

## Chapter Two
Content of chapter two.`;

      const result = parseManuscript(text);
      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it('handles PART headers', () => {
      const text = `PART I
Content of part one.

PART II
Content of part two.`;

      const result = parseManuscript(text);
      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it('handles BOOK headers', () => {
      const text = `Book One
Content of book one.

Book Two
Content of book two.`;

      const result = parseManuscript(text);
      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it('handles Prologue and Epilogue', () => {
      const text = `Prologue
The prologue content.

Chapter 1
Main content.

Epilogue
The epilogue content.`;

      const result = parseManuscript(text);
      const titles = result.map(c => c.title.toLowerCase());
      
      expect(titles.some(t => t.includes('prologue'))).toBe(true);
      expect(titles.some(t => t.includes('epilogue'))).toBe(true);
    });
  });

  describe('title extraction', () => {
    it('extracts title after colon', () => {
      const text = `Chapter 1: The Beginning
This is the chapter content.`;

      const result = parseManuscript(text);
      expect(result.some(c => c.title.includes('Beginning'))).toBe(true);
    });

    it('extracts title after dash', () => {
      const text = `Chapter 1 - The Journey
This is the chapter content.`;

      const result = parseManuscript(text);
      expect(result.some(c => c.title.includes('Journey'))).toBe(true);
    });
    
    it('extracts title from next line when all caps', () => {
      const text = `Chapter 1
 THE ARRIVAL
 This is the chapter content.`;

      const result = parseManuscript(text);
      expect(result[0].title).toBe('Chapter 1: THE ARRIVAL');
      expect(result[0].content).toContain('This is the chapter content.');
    });

    it('extracts title from next line when title case without period', () => {
      const text = `Chapter 2
 The Long Road
 Content continues here.`;

      const result = parseManuscript(text);
      expect(result[0].title).toBe('Chapter 2: The Long Road');
      expect(result[0].content).toContain('Content continues here.');
    });
  });

  describe('artifact stripping', () => {
    it('removes standalone page numbers', () => {
      const text = `Chapter 1
Content here.
12
More content.
13
Even more content.`;

      const result = parseManuscript(text);
      const content = result.map(c => c.content).join(' ');
      
      // Page numbers on their own line should be stripped
      expect(content).not.toMatch(/\b12\b.*\b13\b/);
    });

    it('removes "Page X" format', () => {
      const text = `Some content.
Page 42
More content.`;

      const result = parseManuscript(text);
      const content = result[0].content;
      expect(content).not.toContain('Page 42');
    });

    it('removes "X of Y" page format', () => {
      const text = `Some content.
5 of 100
More content.`;

      const result = parseManuscript(text);
      const content = result[0].content;
      expect(content).not.toContain('5 of 100');
    });

    it('removes separator lines', () => {
      const text = `Some content.
---
More content.
===
Even more.`;

      const result = parseManuscript(text);
      const content = result[0].content;
      expect(content).not.toMatch(/^[-=]{3,}$/m);
    });

    it('removes copyright lines', () => {
      const text = `Copyright 2024 John Smith
Chapter 1
The content.`;

      const result = parseManuscript(text);
      const allContent = result.map(c => c.content).join(' ');
      expect(allContent).not.toContain('Copyright');
    });
  });

  describe('roman numeral chapters', () => {
    it('recognizes roman numerals as chapter markers', () => {
      const text = `I
First chapter content.

II
Second chapter content.

III
Third chapter content.`;

      const result = parseManuscript(text);
      expect(result.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('front matter handling', () => {
    it('captures content before first chapter as prologue/front matter', () => {
      const text = `This is a dedication page.
And some front matter.

Chapter 1
The actual chapter content.`;

      const result = parseManuscript(text);
      
      // Should have prologue/front matter section
      const hasFrontMatter = result.some(c => 
        c.title.toLowerCase().includes('prologue') || 
        c.title.toLowerCase().includes('front matter')
      );
      
      expect(hasFrontMatter).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('handles empty input', () => {
      const result = parseManuscript('');
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('');
    });

    it('handles whitespace-only input', () => {
      const result = parseManuscript('   \n\n   ');
      expect(result).toHaveLength(1);
    });

    it('handles single chapter with complex content', () => {
      const text = `Chapter 1: A Complex Title
      
"Hello," she said. "How are you?"

He replied: "I'm fine, thank you!"

The story continues with many paragraphs...`;

      const result = parseManuscript(text);
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].content).toContain('Hello');
    });
  });

  describe('whitespace-based chapter detection fallback', () => {
    it('splits chapters using large whitespace and uppercase titles when no explicit headers', () => {
      const text = [
        'Introductory material before any chapter.',
        '',
        '',
        '',
        'FIRST CHAPTER',
        'Content of the first chapter.',
        '',
        '',
        '',
        'SECOND CHAPTER',
        'Content of the second chapter.',
      ].join('\n');

      const result = parseManuscript(text);

      expect(result).toHaveLength(3);
      expect(result[0].title).toBe('Prologue / Front Matter');
      expect(result[0].content).toContain('Introductory material before any chapter.');
      expect(result[1].title).toBe('FIRST CHAPTER');
      expect(result[1].content).toContain('Content of the first chapter.');
      expect(result[2].title).toBe('SECOND CHAPTER');
      expect(result[2].content).toContain('Content of the second chapter.');
    });
  });

  describe('edge cases and fixtures', () => {
    it('handles malformed manuscript dumps without crashing', () => {
      const text = loadFixture('malformed.txt');

      const result = parseManuscript(text);

      expect(result).toHaveLength(1);
      expect(result[0].title.toLowerCase()).toContain('chapter');
      expect(result[0].content).not.toMatch(/Page\s+2\s+of\s+10/);
      expect(result[0].content).not.toContain('Page 1');
    });

    it('splits complex formatting that uses whitespace-delimited headings', () => {
      const text = loadFixture('complex-formatting.txt');

      const result = parseManuscript(text);

      expect(result.length).toBeGreaterThanOrEqual(4);
      expect(result[0].title).toMatch(/prologue/i);
      expect(result[1].title).toBe('THE AWAKENING');
      expect(result[2].title).toBe('THE DUSK MARKET');
      expect(result[3].title).toBe('APPENDIX');
    });

    it('does not promote sentences to titles when the next line is not a heading', () => {
      const text = loadFixture('ambiguous-heading.txt');

      const result = parseManuscript(text);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Chapter 3');
      expect(result[0].content.startsWith('This looks like a complete sentence.')).toBe(true);
    });
  });
});
