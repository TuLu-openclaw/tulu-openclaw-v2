const fs = require('fs');
const path = 'C:/Users/User/tulu-openclaw-v2/src/pages/movie-tool.js';
const buf = fs.readFileSync(path);

// Find line 2638 (1-indexed)
let line = 1, pos = 0;
while (line < 2638 && pos < buf.length) {
  if (buf[pos++] === 10) line++;
}
const lineStart = pos;
while (pos < buf.length && buf[pos] !== 10) pos++;
const lineEnd = pos; // byte of \n (exclusive)

// Print full line bytes
const lineBuf = buf.slice(lineStart, lineEnd);
console.log('Line 2638 full hex:', lineBuf.toString('hex'));
console.log('Line 2638 length:', lineBuf.length);
console.log('Line 2638 ASCII:', lineBuf.toString('ascii').replace(/[^\x20-\x7e]/g, '?'));

// Count parens/brackets
let openP = 0, closeP = 0, openB = 0, closeB = 0, openC = 0, closeC = 0;
for (let i = 0; i < lineBuf.length; i++) {
  if (lineBuf[i] === 0x28) { openP++; console.log('open paren at', i); }
  if (lineBuf[i] === 0x29) { closeP++; console.log('close paren at', i); }
  if (lineBuf[i] === 0x5b) { openB++; console.log('open bracket at', i); }
  if (lineBuf[i] === 0x5d) { closeB++; console.log('close bracket at', i); }
  if (lineBuf[i] === 0x7b) { openC++; console.log('open curly at', i); }
  if (lineBuf[i] === 0x7d) { closeC++; console.log('close curly at', i); }
}
console.log(`Parens: (${openP} vs )${closeP}, Brackets: [${openB} vs ]${closeB}, Curly: {${openC} vs }${closeC}`);
