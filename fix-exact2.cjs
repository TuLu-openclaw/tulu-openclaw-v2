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

console.log('Line length:', lineBuf.length);
// Bytes 72=7d, 73=29, 74=5d, 75=29, 76=29
// Structure: api.openLivePlayer(JSON.stringify([{ url: url, type: type }])))
//   After } at 72: ) at 73, ] at 74, ) at 75, ) at 76, \n at 77
// Should be: } at 72, ] at 73, ) at 74, ) at 75, \n at 76
// Remove byte 75 (0x29) which is the extra ')'

const newBuf = Buffer.concat([
  buf.slice(0, lineStart + 75), // up to but NOT including the extra 0x29
  buf.slice(lineStart + 76)    // from after the extra 0x29 to end
]);
fs.writeFileSync(path, newBuf);
console.log('Written, new size:', newBuf.length);

// Verify
const v = fs.readFileSync(path);
let vLine = 1, vPos = 0;
while (vLine < 2638 && vPos < v.length) { if (v[vPos++] === 10) vLine++; }
const vStart = vPos;
while (vPos < v.length && v[vPos] !== 10) vPos++;
const vLineBuf = v.slice(vStart, vPos);
console.log('Fixed line 2638:', JSON.stringify(vLineBuf.toString('utf8')));
console.log('Fixed line length:', vLineBuf.length);
console.log('Fixed line last 8 bytes:', vLineBuf.slice(-8).toString('hex'));

// Count parens
let openP = 0, closeP = 0;
for (let i = 0; i < vLineBuf.length; i++) {
  if (vLineBuf[i] === 0x28) openP++;
  if (vLineBuf[i] === 0x29) closeP++;
}
console.log(`Parens: (${openP}, )${closeP} - balanced: ${openP === closeP}`);
