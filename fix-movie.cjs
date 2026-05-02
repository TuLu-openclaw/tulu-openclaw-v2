const fs = require('fs');
const path = 'C:/Users/User/tulu-openclaw-v2/src/pages/movie-tool.js';
let c = fs.readFileSync(path, 'utf8');
const oldText = "api.openLivePlayer(JSON.stringify([{ url, type }]))";
const newText = "api.openLivePlayer(JSON.stringify([{ url: url, type: type }]))";
if (c.includes(oldText)) {
  console.log('FOUND the problematic string');
  c = c.replace(oldText, newText);
  fs.writeFileSync(path, c);
  console.log('WRITTEN');
} else {
  console.log('NOT FOUND');
  const lines = c.split('\n');
  console.log('Line 2638:', JSON.stringify(lines[2637]));
  console.log('Line 2639:', JSON.stringify(lines[2638]));
}
