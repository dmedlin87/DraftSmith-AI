const regex = /"[^"]+",?\s*said\s+(\w+)/i;
const text = '"I need to go," Sarah said urgently.';
console.log(regex.exec(text));
