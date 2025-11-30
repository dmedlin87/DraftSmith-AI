const pattern = /["'].*?["']\s*,?\s*(?:said|asked|replied)\s+(\w+)/gi;
const text = '"Hello," she said.';
const match = text.match(pattern);
console.log(match);
