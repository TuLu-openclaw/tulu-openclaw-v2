import { readFileSync } from 'fs';
const c = readFileSync('C:/Users/User/.openclaw/.openclaw/workspace/tulu-v2/src/pages/movie-tool.js', 'utf8');
const lines = c.split('\n');

console.log('=== Fix1 验证: openResumePlayer ===');
for(let i=725;i<735;i++) console.log(i+1+':', JSON.stringify(lines[i]));

console.log('\n=== Fix2 验证: toggleFloatMin ===');
const idx = c.indexOf('function toggleFloatMin');
console.log(c.substring(idx, idx+400));

console.log('\n=== bindEpBtns si ===');
for(let i=1273;i<1292;i++) console.log(i+1+':', JSON.stringify(lines[i]));