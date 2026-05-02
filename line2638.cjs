const fs = require('fs');
const path = 'C:/Users/User/tulu-openclaw-v2/src/pages/movie-tool.js';
const buf = fs.readFileSync(path);

// Find line 2638 (1-indexed)
let line = 1, pos = 0;
while (line < 2638 && pos < buf.length) {
  if (buf[pos++] === 10) line++;
}
const start = pos;
while (pos < buf.length && buf[pos] !== 10) pos++;
const lineBuf = buf.slice(start, pos);

console.log('Line 2638:');
console.log('Raw hex:', lineBuf.toString('hex'));
console.log('Length:', lineBuf.length);
console.log('As string:', JSON.stringify(lineBuf.toString('utf8')));

// Check what type keyword looks like
for (let i = 0; i < lineBuf.length; i++) {
  if (i >= 45 && i <= 65) {
    process.stdout.write(i + ':0x' + lineBuf[i].toString(16) + '(' + (lineBuf[i] >= 0x20 && lineBuf[i] <= 0x7e ? String.fromCharCode(lineBuf[i]) : '?') + ') ');
  }
}
console.log();
