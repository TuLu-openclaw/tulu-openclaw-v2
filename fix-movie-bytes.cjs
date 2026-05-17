const fs = require('fs');
const path = 'C:/Users/User/tulu-openclaw-v2/src/pages/movie-tool.js';
const buf = fs.readFileSync(path);
// Pattern with 12 spaces of indentation
const oldPattern = Buffer.from('            api.openLivePlayer(JSON.stringify([{ url, type }]))');
const newPattern = Buffer.from('            api.openLivePlayer(JSON.stringify([{ url: url, type: type }]))');
let count = 0;
let idx = buf.indexOf(oldPattern);
while (idx !== -1) {
  const before = buf.slice(0, idx);
  const after = buf.slice(idx + oldPattern.length);
  const newBuf = Buffer.concat([before, newPattern, after]);
  count++;
  buf = newBuf;
  idx = buf.indexOf(oldPattern, idx + newPattern.length);
}
if (count > 0) {
  fs.writeFileSync(path, buf);
  console.log('Fixed', count, 'occurrence(s), new size:', buf.length);
} else {
  console.log('Pattern not found, trying with variable spaces...');
  // Try with regex to find the pattern with variable leading spaces
  const str = buf.toString('utf8');
  const regex = /api\.openLivePlayer\(JSON\.stringify\(\[\\{ url, type \\}\]\)\)\)/g;
  const matches = str.match(regex);
  if (matches) {
    console.log('Found', matches.length, 'matches:', matches[0]);
  } else {
    console.log('No matches at all');
  }
}
