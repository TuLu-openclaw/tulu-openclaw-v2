const fs = require('fs');
const path = require('path');

const sourceRoot = process.argv[2];
const outRoot = process.argv[3];
if (!sourceRoot || !outRoot) {
  console.error('usage: node convert-agency-openclaw.cjs <sourceRoot> <outRoot>');
  process.exit(2);
}

const divisions = [
  'academic', 'design', 'engineering', 'finance', 'game-development', 'gis', 'marketing', 'paid-media',
  'product', 'project-management', 'sales', 'security', 'spatial-computing', 'specialized', 'support', 'testing'
];

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseFrontmatter(raw) {
  if (!raw.startsWith('---')) return { data: {}, body: raw };
  const end = raw.indexOf('\n---', 3);
  if (end < 0) return { data: {}, body: raw };
  const fm = raw.slice(3, end).trim();
  const body = raw.slice(raw.indexOf('\n', end + 4) + 1);
  const data = {};
  for (const line of fm.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    value = value.replace(/^['"]|['"]$/g, '');
    data[match[1]] = value;
  }
  return { data, body };
}

function splitOpenClaw(body) {
  const lines = body.split(/\r?\n/);
  let target = 'agents';
  let current = [];
  let soul = '';
  let agents = '';
  function flush() {
    if (!current.length) return;
    const block = current.join('\n') + '\n';
    if (target === 'soul') soul += block;
    else agents += block;
    current = [];
  }
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      flush();
      const lower = line.toLowerCase();
      target = /identity|learning.*memory|communication|style|critical.rule|rules.you.must.follow/.test(lower) ? 'soul' : 'agents';
    }
    current.push(line);
  }
  flush();
  return { soul, agents };
}

fs.rmSync(outRoot, { recursive: true, force: true });
fs.mkdirSync(path.join(outRoot, 'openclaw'), { recursive: true });

const manifest = {
  name: 'Agency Agents',
  source: 'https://github.com/msitarzewski/agency-agents',
  upstreamCommit: null,
  generatedAt: new Date().toISOString(),
  total: 0,
  divisions: {},
  agents: []
};

for (const division of divisions) {
  const dir = path.join(sourceRoot, division);
  if (!fs.existsSync(dir)) continue;
  const files = fs.readdirSync(dir).filter(name => name.endsWith('.md')).sort();
  manifest.divisions[division] = { count: 0 };
  for (const file of files) {
    const full = path.join(dir, file);
    const raw = fs.readFileSync(full, 'utf8');
    const { data, body } = parseFrontmatter(raw);
    if (!data.name || !data.description) continue;
    const slug = slugify(data.name);
    const id = `agency-${slug}`;
    const outDir = path.join(outRoot, 'openclaw', id);
    const split = splitOpenClaw(body);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'SOUL.md'), split.soul, 'utf8');
    fs.writeFileSync(path.join(outDir, 'AGENTS.md'), split.agents, 'utf8');
    const identity = data.emoji && data.vibe
      ? `# ${data.emoji} ${data.name}\n${data.vibe}\n`
      : `# ${data.name}\n${data.description}\n`;
    fs.writeFileSync(path.join(outDir, 'IDENTITY.md'), identity, 'utf8');
    manifest.total += 1;
    manifest.divisions[division].count += 1;
    manifest.agents.push({
      id,
      slug,
      name: data.name,
      description: data.description,
      emoji: data.emoji || '',
      vibe: data.vibe || '',
      color: data.color || '',
      division,
      sourceFile: `${division}/${file}`,
      files: ['SOUL.md', 'AGENTS.md', 'IDENTITY.md']
    });
  }
}

fs.writeFileSync(path.join(outRoot, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
console.log(`generated ${manifest.total} agents at ${outRoot}`);
