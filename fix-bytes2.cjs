const fs = require('fs');
const path = 'C:/Users/User/tulu-openclaw-v2/src/pages/movie-tool.js';
const buf = fs.readFileSync(path);

// Find all occurrences of the problematic pattern (12 spaces, then api.openLivePlayer)
const oldPattern = Buffer.from('            api.openLivePlayer(JSON.stringify([{ url, type }]))');
const newPattern = Buffer.from('            api.openLivePlayer(JSON.stringify([{ url: url, type: type }]))');

let count = 0;
let idx = buf.indexOf(oldPattern);
if (idx !== -1) {
  console.log('Found at byte', idx, '- replacing...');
  const before = buf.slice(0, idx);
  const after = buf.slice(idx + oldPattern.length);
  const newBuf = Buffer.concat([before, newPattern, after]);
  fs.writeFileSync(path, newBuf);
  console.log('Fixed, new size:', newBuf.length);
} else {
  console.log('NOT found. Searching for partial...');
  const partial = Buffer.from('api.openLivePlayer(JSON.stringify([{ url');
  idx = buf.indexOf(partial);
  if (idx !== -1) {
    console.log('Found partial at byte', idx);
    console.log('Context (hex):', buf.slice(idx, idx + 100).toString('hex'));
    console.log('Context (ascii):', buf.slice(idx, idx + 100).toString('ascii').replace(/[^\x20-\x7e\n]/g, '?'));
  } else {
    console.log('Partial not found either');
  }
}
