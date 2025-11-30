const regex = /"([^"']+)",?\s*(?:said|asked|replied)\s+(\w+)/i;
const text = '"Hello," she said.';
const match = regex.exec(text);
console.log(match);
