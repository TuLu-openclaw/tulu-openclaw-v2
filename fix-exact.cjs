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
// Show last 10 bytes with indices
console.log('Last 10 bytes (from index', lineBuf.length - 10, '):');
for (let i = lineBuf.length - 10; i < lineBuf.length; i++) {
  process.stdout.write(i + '=' + '0x' + lineBuf[i].toString(16) + '(' + (lineBuf[i] >= 0x20 && lineBuf[i] < 0x7f ? String.fromCharCode(lineBuf[i]) : '?') + ') ');
}
console.log();

// Current ends with: 7d 29 29 29 (} ) ) )
// Target ends with:   7d 29 29 (} ) )
// Remove ONE 0x29 from the last 3

// Replace: the byte sequence "7d 29 29 29" at the end with "7d 29 29"
const oldSuffix = Buffer.from([0x7d, 0x29, 0x29, 0x29]);
const newSuffix = Buffer.from([0x7d, 0x29, 0x29]);

// Find where this suffix starts in lineBuf
let suffixPos = -1;
for (let i = lineBuf.length - oldSuffix.length; i >= 0; i--) {
  let match = true;
  for (let j = 0; j < oldSuffix.length; j++) {
    if (lineBuf[i + j] !== oldSuffix[j]) { match = false; break; }
  }
  if (match) { suffixPos = i; break; }
}

if (suffixPos === -1) {
  console.log('Suffix not found! Searching for similar...');
  console.log('Bytes 73-76:', Buffer.from([lineBuf[73], lineBuf[74], lineBuf[75], lineBuf[76]]).toString('hex'));
  console.log('Bytes 74-77:', Buffer.from([lineBuf[74], lineBuf[75], lineBuf[76], lineBuf[77] || 0x0a]).toString('hex'));
} else {
  console.log('Suffix found at line-relative offset', suffixPos);
  // Build new line
  const newLineBuf = Buffer.concat([lineBuf.slice(0, suffixPos), newSuffix]);
  console.log('New line length:', newLineBuf.length);
  console.log('New last 6 bytes:', newLineBuf.slice(-6).toString('hex'));

  // Write to file
  const newBuf = Buffer.concat([buf.slice(0, lineStart), newLineBuf, buf.slice(lineEnd)]);
  fs.writeFileSync(path, newBuf);
  console.log('Written, file new size:', newBuf.length);
}
