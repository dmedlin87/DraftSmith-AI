import { extractDialogue } from '../services/intelligence/structuralParser.ts';

const text = `"I need to go," Sarah said urgently.`;
const regex = /["']([^"']+)["']/g;
let match;
while ((match = regex.exec(text)) !== null) {
  const offset = match.index;
  const contextStart = Math.max(0, offset - 100);
  const contextEnd = Math.min(text.length, offset + match[0].length + 100);
  const context = text.slice(contextStart, contextEnd);
  console.log('context =>', JSON.stringify(context));
}
