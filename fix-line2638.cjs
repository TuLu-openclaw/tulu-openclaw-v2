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
const lineEnd = pos; // byte of \n

const lineBuf = buf.slice(lineStart, lineEnd);
console.log('Line 2638 (hex):', lineBuf.toString('hex'));

// Find the "type" keyword inside JSON.stringify argument
// We need to replace: [{ url, type }]
// With: [{ url: url, type: type }]
// The bytes around "type" in the original (expected):
// [{ url, type }] -> 5b 7b 20 75 72 6c 2c 20 74 79 70 65 20 7d 5d
// [{ url: url, type: type }] -> 5b 7b 20 75 72 6c 3a 20 75 72 6c 2c 20 74 79 70 65 3a 20 74 79 70 65 20 7d 5d

const oldChunk = Buffer.from(' url, type ', 'utf8');
const newChunk = Buffer.from(' url: url, type: type ', 'utf8');

const chunkIdx = lineBuf.indexOf(oldChunk);
if (chunkIdx === -1) {
  console.log('Pattern " url, type " not found in line 2638');
  console.log('Actual line:', JSON.stringify(lineBuf.toString('utf8')));
  process.exit(1);
}

console.log('Found at offset', chunkIdx, 'in line');

// Replace and write
const before = buf.slice(0, lineStart + chunkIdx);
const after = buf.slice(lineStart + chunkIdx + oldChunk.length);
const newBuf = Buffer.concat([before, newChunk, after]);
fs.writeFileSync(path, newBuf);
console.log('Written, new size:', newBuf.length, '(was', buf.length + ')', 'diff:', newBuf.length - buf.length);

// Verify
const v = fs.readFileSync(path);
let vLine = 1, vPos = 0;
while (vLine < 2638 && vPos < v.length) { if (v[vPos++] === 10) vLine++; }
const vStart = vPos;
while (vPos < v.length && v[vPos] !== 10) vPos++;
console.log('Fixed line 2638:', JSON.stringify(v.slice(vStart, vPos).toString('utf8')));
