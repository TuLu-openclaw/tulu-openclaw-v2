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

// Current line: has extra ')' before final )))
// Structure: api.openLivePlayer(JSON.stringify([{ url: url, type: type }])))
//                                                         ^74      ^75 ^76
// Expected:  api.openLivePlayer(JSON.stringify([{ url: url, type: type }]));
// Remove the extra ')' at position lineStart + 74 (the one before the final "))")

const lineBuf = buf.slice(lineStart, lineEnd);
console.log('Current line (hex):', lineBuf.toString('hex'));
console.log('Length:', lineBuf.length);
// Byte 74 is the extra ')' (0x29) in the sequence "})))" at bytes 72-75
// Actually let me just check the last few bytes
console.log('Last 10 bytes:', lineBuf.slice(-10).toString('hex'));
console.log('Last 10 as ascii:', lineBuf.slice(-10).toString('ascii').replace(/[^\x20-\x7e]/g, '?'));

// Current ends with "})))" = 7d 29 29 29
// Should end with "}))" = 7d 29 29
// Remove one 29 from the end

const newLineBuf = Buffer.concat([lineBuf.slice(0, -3), Buffer.from([0x7d, 0x29, 0x29])]);
console.log('New line (hex):', newLineBuf.toString('hex'));
console.log('New length:', newLineBuf.length);

// Count parens
let openP = 0, closeP = 0;
for (let i = 0; i < newLineBuf.length; i++) {
  if (newLineBuf[i] === 0x28) openP++;
  if (newLineBuf[i] === 0x29) closeP++;
}
console.log(`Balanced: open=${openP}, close=${closeP}, diff=${openP-closeP}`);

// Write
const newBuf = Buffer.concat([buf.slice(0, lineStart), newLineBuf, buf.slice(lineEnd)]);
fs.writeFileSync(path, newBuf);
console.log('Written, new size:', newBuf.length);
