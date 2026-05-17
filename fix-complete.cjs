const fs = require('fs');
const path = 'C:/Users/User/tulu-openclaw-v2/src/pages/movie-tool.js';
const buf = fs.readFileSync(path);

// Find line 2638
let line = 1, pos = 0;
while (line < 2638 && pos < buf.length) {
  if (buf[pos++] === 10) line++;
}
const lineStart = pos;
while (pos < buf.length && buf[pos] !== 10) pos++;
const lineEnd = pos;
const lineBuf = buf.slice(lineStart, lineEnd);

console.log('Current line length:', lineBuf.length);
console.log('Current line hex:', lineBuf.toString('hex'));
console.log('Current line:', JSON.stringify(lineBuf.toString('utf8')));

// The correct line should be:
// "              api.openLivePlayer(JSON.stringify([{ url: url, type: type }]))"
const correctLine = '              api.openLivePlayer(JSON.stringify([{ url: url, type: type }]))';
const correctBuf = Buffer.from(correctLine, 'utf8');
console.log('Correct line length:', correctBuf.length);
console.log('Correct line hex:', correctBuf.toString('hex'));

// Replace the entire line
const newBuf = Buffer.concat([buf.slice(0, lineStart), correctBuf, buf.slice(lineEnd)]);
fs.writeFileSync(path, newBuf);
console.log('Written, new size:', newBuf.length, '(was', buf.length + ')');

// Verify
const v = fs.readFileSync(path);
let vLine = 1, vPos = 0;
while (vLine < 2638 && vPos < v.length) { if (v[vPos++] === 10) vLine++; }
const vStart = vPos;
while (vPos < v.length && v[vPos] !== 10) vPos++;
const vLineBuf = v.slice(vStart, vPos);
console.log('Fixed line 2638:', JSON.stringify(vLineBuf.toString('utf8')));

// Count parens
let openP = 0, closeP = 0, openB = 0, closeB = 0;
for (let i = 0; i < vLineBuf.length; i++) {
  if (vLineBuf[i] === 0x28) openP++;
  if (vLineBuf[i] === 0x29) closeP++;
  if (vLineBuf[i] === 0x5b) openB++;
  if (vLineBuf[i] === 0x5d) closeB++;
}
console.log(`Balanced: parens(${openP}/${closeP}), brackets(${openB}/${closeB})`);
