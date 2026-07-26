import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  GRAPH_NODE_THRESHOLD,
  buildRouteGraphLayout,
  fetchRouteGraph,
  normalizeRouteGraph,
  summarizeDiagnostic,
} from '../src/pages/route-graph.js'

const fiveKindsFourEdges = {
  nodes: [
    { id: 'channel:telegram', kind: 'channel', key: 'telegram', label: 'Telegram' },
    { id: 'account:telegram/bot', kind: 'account', key: 'bot', label: 'Bot', parentId: 'channel:telegram' },
    { id: 'agent:main', kind: 'agent', key: 'main', label: 'Main' },
    { id: 'model:openai/gpt', kind: 'model', key: 'openai/gpt', label: 'GPT' },
    { id: 'provider:openai', kind: 'provider', key: 'openai', label: 'OpenAI' },
  ],
  edges: [
    { id: 'has', kind: 'hasAccount', source: 'channel:telegram', target: 'account:telegram/bot' },
    { id: 'route', kind: 'routesTo', source: 'account:telegram/bot', target: 'agent:main', data: { bindingIndex: 2, match: { unsafe: '<img src=x>' } } },
    { id: 'uses', kind: 'usesModel', source: 'agent:main', target: 'model:openai/gpt', data: { role: 'primary', inherited: false } },
    { id: 'provides', kind: 'provides', source: 'provider:openai', target: 'model:openai/gpt' },
  ],
  diagnostics: [],
}

test('normalizes all five node kinds and four edge kinds without retaining raw match data', () => {
  const graph = normalizeRouteGraph(fiveKindsFourEdges)
  assert.deepEqual(graph.nodes.map(node => node.kind), ['channel', 'account', 'agent', 'model', 'provider'])
  assert.deepEqual(graph.edges.map(edge => edge.kind), ['hasAccount', 'routesTo', 'usesModel', 'provides'])
  assert.equal('data' in graph.edges[1], false)
  assert.equal(JSON.stringify(graph).includes('<img src=x>'), false)
})

test('defensively drops duplicate node IDs and marks missing endpoints', () => {
  const graph = normalizeRouteGraph({
    nodes: [
      { id: 'agent:main', kind: 'agent', label: 'first' },
      { id: 'agent:main', kind: 'agent', label: 'second' },
    ],
    edges: [{ id: 'broken', kind: 'routesTo', source: 'channel:none', target: 'agent:main' }],
  })
  assert.equal(graph.nodes.length, 1)
  assert.deepEqual(graph.edges[0].missingEndpoints, ['channel:none'])
  assert.deepEqual(graph.diagnostics.map(item => item.code).sort(), ['duplicate_node_id', 'missing_endpoint'])
})

test('preserves unknown future kinds and diagnostic codes as labeled unknown values', () => {
  const graph = normalizeRouteGraph({
    nodes: [{ id: 'future:1', kind: 'routerV2', label: 'future' }],
    edges: [{ id: 'future-edge', kind: 'teleportsTo', source: 'future:1', target: 'future:1' }],
    diagnostics: [{ code: 'future_code', severity: 'notice', message: '<script>bad()</script>', data: { binding: { secret: 'x' } } }],
  })
  assert.equal(graph.nodes[0].knownKind, false)
  assert.equal(graph.edges[0].knownKind, false)
  assert.equal(graph.diagnostics[0].code, 'future_code')
  assert.equal(graph.diagnostics[0].severity, 'warning')
  assert.equal(JSON.stringify(graph).includes('bad()'), false)
  assert.equal(summarizeDiagnostic(graph.diagnostics[0], (key, params) => `${key}:${params.code}`), 'routeGraph.diagnostic_unknown:future_code')
})

test('builds deterministic layered layout and keeps large graph threshold finite', () => {
  const graph = normalizeRouteGraph(fiveKindsFourEdges)
  const first = buildRouteGraphLayout(graph)
  const second = buildRouteGraphLayout({ ...graph, nodes: [...graph.nodes].reverse() })
  assert.deepEqual(first.layers, second.layers)
  assert.deepEqual(first.layers, [
    ['channel:telegram'], ['account:telegram/bot'], ['agent:main'], ['model:openai/gpt'], ['provider:openai'],
  ])
  assert.ok(Number.isInteger(GRAPH_NODE_THRESHOLD) && GRAPH_NODE_THRESHOLD > 20)
})

test('accepts JSON strings and rejects invalid JSON or invalid roots', () => {
  assert.equal(normalizeRouteGraph(JSON.stringify(fiveKindsFourEdges)).nodes.length, 5)
  assert.throws(() => normalizeRouteGraph('{not json}'), /invalid-json/)
  assert.throws(() => normalizeRouteGraph([]), /invalid-graph/)
})

test('Web capability path does not call any API', async () => {
  let calls = 0
  const result = await fetchRouteGraph({ runtime: false, apiClient: { getRouteGraph: async () => { calls++; return fiveKindsFourEdges } } })
  assert.equal(result, null)
  assert.equal(calls, 0)
})

test('page source is read-only and never interpolates backend fields into innerHTML', async () => {
  const source = await readFile(new URL('../src/pages/route-graph.js', import.meta.url), 'utf8')
  assert.match(source, /apiClient\.getRouteGraph\(\)/)
  assert.doesNotMatch(source, /(?:read|write|save|repair|fix|doctor)[A-Z][A-Za-z]*Config\s*\(/)
  assert.doesNotMatch(source, /api\.(?!getRouteGraph\b)[A-Za-z]+\s*\(/)
  assert.doesNotMatch(source, /innerHTML\s*=\s*`[^`]*\$\{[^`]*(?:label|message|match|binding)/s)
  assert.match(source, /render\(\{ runtime = isTauriRuntime\(\), apiClient = api \} = \{\}\)/)
  assert.doesNotMatch(source, /diagnostic(?:\?\.)?\.message|data(?:\?\.)?\.(?:binding|match)\b/)
  assert.doesNotMatch(source, /contenteditable|data-action=["'](?:edit|repair|fix)/i)
})

test('tabs have explicit accessible ownership and refresh results are generation guarded', async () => {
  const source = await readFile(new URL('../src/pages/route-graph.js', import.meta.url), 'utf8')
  assert.match(source, /role: 'group'/)
  assert.match(source, /'aria-labelledby': 'route-graph-svg-title route-graph-svg-desc'/)
  assert.doesNotMatch(source, /role: 'img'/)
  assert.match(source, /graphTab\.setAttribute\('aria-controls', 'route-graph-panel-graph'\)/)
  assert.match(source, /listTab\.setAttribute\('aria-controls', 'route-graph-panel-list'\)/)
  assert.match(source, /graphPanel\.setAttribute\('aria-labelledby', graphTab\.id\)/)
  assert.match(source, /listPanel\.setAttribute\('aria-labelledby', listTab\.id\)/)
  assert.match(source, /const generation = \+\+loadGeneration/)
  assert.ok((source.match(/generation !== loadGeneration/g) || []).length >= 3)
})
