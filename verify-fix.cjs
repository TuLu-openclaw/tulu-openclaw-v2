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

console.log('=== CURRENT LINE 2638 ===');
console.log('Length:', lineBuf.length);
console.log('Hex:', lineBuf.toString('hex'));
console.log('String:', JSON.stringify(lineBuf.toString('utf8')));

// Check positions 59-63 (the critical area)
console.log('\n=== CRITICAL BYTES (59-66) ===');
for (let i = 59; i < Math.min(67, lineBuf.length); i++) {
  const b = lineBuf[i];
  const char = (b >= 0x20 && b < 0x7f) ? String.fromCharCode(b) : '?';
  process.stdout.write(i + '=' + '0x' + b.toString(16) + '(' + char + ') ');
}
console.log();

// Compare to what it should be
const correct = '              api.openLivePlayer(JSON.stringify([{ url: url, type: type }]))';
const correctBuf = Buffer.from(correct, 'utf8');
console.log('=== CORRECT LINE ===');
console.log('Length:', correctBuf.length);
console.log('Hex:', correctBuf.toString('hex'));

// Byte comparison
for (let i = 0; i < Math.max(lineBuf.length, correctBuf.length); i++) {
  const a = lineBuf[i] || -1;
  const b = correctBuf[i] || -1;
  if (a !== b) {
    console.log(`DIFF at position ${i}: current=0x${a.toString(16)}, correct=0x${b.toString(16)}`);
  }
}
console.log('Match:', lineBuf.equals(correctBuf) ? 'YES' : 'NO');
