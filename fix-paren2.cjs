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
console.log('Current line length:', lineBuf.length, '(expected 74)');
console.log('Last 10 bytes hex:', lineBuf.slice(-10).toString('hex'));
console.log('Last 10 ASCII:', lineBuf.slice(-10).toString('ascii').replace(/[^\x20-\x7e]/g, '?'));

// Current ends with: 7d 29 29 29 0a (}  ) ) ) \n)
// Need to change to:   7d 29 29 0a    (}  ) ) \n) -> remove the 2nd-to-last 29

// Replace the last 4 bytes (}  ) ) \n) with (}  ) ) \n)
const newLast4 = Buffer.from([0x7d, 0x29, 0x29, 0x0a]);
const newBuf = Buffer.concat([
  buf.slice(0, lineStart + lineBuf.length - 4),
  newLast4
]);
console.log('New line length:', newBuf.slice(lineStart, lineStart + 74).length);
console.log('New last 10 ASCII:', newBuf.slice(-10).toString('ascii').replace(/[^\x20-\x7e]/g, '?'));

fs.writeFileSync(path, newBuf);
console.log('Written, new size:', newBuf.length);

// Verify
const v = fs.readFileSync(path);
let vLine = 1, vPos = 0;
while (vLine < 2638 && vPos < v.length) { if (v[vPos++] === 10) vLine++; }
const vStart = vPos;
while (vPos < v.length && v[vPos] !== 10) vPos++;
console.log('Fixed line 2638:', JSON.stringify(v.slice(vStart, vPos).toString('utf8')));
console.log('Fixed line length:', vPos - vStart);
