import { api, isTauriRuntime } from '../lib/tauri-api.js'
import { t } from '../lib/i18n.js'

export const GRAPH_NODE_THRESHOLD = 80
export const NODE_KINDS = Object.freeze(['channel', 'account', 'agent', 'model', 'provider'])
export const EDGE_KINDS = Object.freeze(['routesTo', 'usesModel', 'hasAccount', 'provides'])

const SVG_NS = 'http://www.w3.org/2000/svg'
const KNOWN_DIAGNOSTIC_FIELDS = Object.freeze(['agentId', 'channelId', 'accountId', 'model'])

function stringValue(value, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function safeDiagnosticData(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const safe = {}
  for (const field of KNOWN_DIAGNOSTIC_FIELDS) {
    if (typeof value[field] === 'string') safe[field] = value[field]
  }
  return Object.keys(safe).length ? safe : null
}

export function normalizeRouteGraph(payload) {
  let input = payload
  if (typeof payload === 'string') {
    try { input = JSON.parse(payload) } catch { throw new TypeError('invalid-json') }
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('invalid-graph')

  const nodes = []
  const nodeIds = new Set()
  const clientDiagnostics = []
  for (const raw of Array.isArray(input.nodes) ? input.nodes : []) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const id = stringValue(raw.id).trim()
    if (!id) continue
    if (nodeIds.has(id)) {
      clientDiagnostics.push({ code: 'duplicate_node_id', severity: 'warning', nodeIds: [id], data: null })
      continue
    }
    nodeIds.add(id)
    const kind = stringValue(raw.kind, 'unknown')
    nodes.push({
      id,
      kind,
      knownKind: NODE_KINDS.includes(kind),
      key: stringValue(raw.key, id),
      label: stringValue(raw.label, stringValue(raw.key, id)),
      parentId: typeof raw.parentId === 'string' ? raw.parentId : null,
    })
  }

  const edges = []
  const edgeIds = new Set()
  for (const raw of Array.isArray(input.edges) ? input.edges : []) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const id = stringValue(raw.id).trim()
    const source = stringValue(raw.source).trim()
    const target = stringValue(raw.target).trim()
    if (!id || !source || !target || edgeIds.has(id)) continue
    edgeIds.add(id)
    const kind = stringValue(raw.kind, 'unknown')
    const missing = [source, target].filter(endpoint => !nodeIds.has(endpoint))
    edges.push({
      id,
      kind,
      knownKind: EDGE_KINDS.includes(kind),
      source,
      target,
      missingEndpoints: missing,
      role: typeof raw.data?.role === 'string' ? raw.data.role : null,
      inherited: typeof raw.data?.inherited === 'boolean' ? raw.data.inherited : null,
      bindingIndex: Number.isInteger(raw.data?.bindingIndex) ? raw.data.bindingIndex : null,
    })
    if (missing.length) {
      clientDiagnostics.push({ code: 'missing_endpoint', severity: 'error', nodeIds: missing, data: null })
    }
  }

  const diagnostics = [...(Array.isArray(input.diagnostics) ? input.diagnostics : []), ...clientDiagnostics]
    .filter(raw => raw && typeof raw === 'object' && !Array.isArray(raw))
    .map(raw => ({
      code: stringValue(raw.code, 'unknown'),
      severity: raw.severity === 'error' ? 'error' : 'warning',
      bindingIndex: Number.isInteger(raw.bindingIndex) ? raw.bindingIndex : null,
      nodeIds: Array.isArray(raw.nodeIds) ? raw.nodeIds.filter(id => typeof id === 'string') : [],
      data: safeDiagnosticData(raw.data),
    }))

  return { nodes, edges, diagnostics }
}

export function buildRouteGraphLayout(graph) {
  const layerFor = { channel: 0, account: 1, agent: 2, model: 3, provider: 4 }
  const layers = Array.from({ length: 5 }, () => [])
  for (const node of graph.nodes) layers[layerFor[node.kind] ?? 2].push(node)
  for (const layer of layers) layer.sort((a, b) => a.id.localeCompare(b.id))
  const positions = new Map()
  const xGap = 230
  const yGap = 92
  layers.forEach((layer, layerIndex) => layer.forEach((node, row) => {
    positions.set(node.id, { x: 42 + layerIndex * xGap, y: 42 + row * yGap, width: 178, height: 58 })
  }))
  return {
    positions,
    width: Math.max(1000, 42 + layers.length * xGap),
    height: Math.max(260, 82 + Math.max(1, ...layers.map(layer => layer.length)) * yGap),
    layers: layers.map(layer => layer.map(node => node.id)),
  }
}

export function summarizeDiagnostic(diagnostic, translate = t) {
  const code = stringValue(diagnostic?.code, 'unknown')
  const knownCodes = new Set([
    'missing_agent', 'missing_channel', 'missing_account', 'missing_provider', 'missing_model',
    'invalid_binding', 'duplicate_binding', 'competing_binding', 'duplicate_node_id', 'missing_endpoint',
  ])
  const key = knownCodes.has(code) ? `routeGraph.diagnostic_${code}` : 'routeGraph.diagnostic_unknown'
  const identifiers = []
  if (Number.isInteger(diagnostic?.bindingIndex)) identifiers.push(`#${diagnostic.bindingIndex}`)
  for (const field of KNOWN_DIAGNOSTIC_FIELDS) {
    if (typeof diagnostic?.data?.[field] === 'string') identifiers.push(`${field}: ${diagnostic.data[field]}`)
  }
  if (Array.isArray(diagnostic?.nodeIds)) identifiers.push(...diagnostic.nodeIds.slice(0, 3))
  return `${translate(key, { code })}${identifiers.length ? ` (${identifiers.join(', ')})` : ''}`
}

export async function fetchRouteGraph({ runtime = isTauriRuntime(), apiClient = api } = {}) {
  if (!runtime) return null
  return normalizeRouteGraph(await apiClient.getRouteGraph())
}

function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag)
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value))
  return node
}

function appendCell(row, text, tag = 'td') {
  const cell = el(tag, '', text)
  row.appendChild(cell)
  return cell
}

function relationLabel(edge) {
  const extras = []
  if (edge.role) extras.push(edge.role)
  if (edge.inherited !== null) extras.push(edge.inherited ? t('routeGraph.inherited') : t('routeGraph.explicit'))
  if (edge.bindingIndex !== null) extras.push(`#${edge.bindingIndex}`)
  return extras.length ? `${edge.kind} (${extras.join(', ')})` : edge.kind
}

function renderDetails(container, selection) {
  container.replaceChildren()
  container.appendChild(el('h2', 'route-graph-section-title', t('routeGraph.details')))
  if (!selection) {
    container.appendChild(el('p', 'route-graph-muted', t('routeGraph.selectHint')))
    return
  }
  const list = el('dl', 'route-graph-details-list')
  const entries = selection.type === 'node'
    ? [[t('routeGraph.fieldKind'), selection.value.kind], [t('routeGraph.fieldId'), selection.value.id], [t('routeGraph.fieldKey'), selection.value.key], [t('routeGraph.fieldLabel'), selection.value.label]]
    : [[t('routeGraph.fieldKind'), selection.value.kind], [t('routeGraph.fieldId'), selection.value.id], [t('routeGraph.fieldSource'), selection.value.source], [t('routeGraph.fieldTarget'), selection.value.target], [t('routeGraph.fieldRelation'), relationLabel(selection.value)]]
  for (const [name, value] of entries) {
    list.append(el('dt', '', name), el('dd', '', value))
  }
  container.appendChild(list)
}

function renderSvg(graph, onSelect) {
  const layout = buildRouteGraphLayout(graph)
  const wrap = el('div', 'route-graph-canvas')
  const svg = svgEl('svg', {
    viewBox: `0 0 ${layout.width} ${layout.height}`,
    width: layout.width,
    height: layout.height,
    role: 'group',
    'aria-labelledby': 'route-graph-svg-title route-graph-svg-desc',
  })
  svg.append(svgEl('title', { id: 'route-graph-svg-title' }), svgEl('desc', { id: 'route-graph-svg-desc' }))
  svg.querySelector('title').textContent = t('routeGraph.svgTitle')
  svg.querySelector('desc').textContent = t('routeGraph.svgDesc')

  for (const edge of graph.edges) {
    const from = layout.positions.get(edge.source)
    const to = layout.positions.get(edge.target)
    if (!from || !to) continue
    const x1 = from.x + from.width
    const y1 = from.y + from.height / 2
    const x2 = to.x
    const y2 = to.y + to.height / 2
    const group = svgEl('g', { class: `route-edge route-edge-${EDGE_KINDS.includes(edge.kind) ? edge.kind : 'unknown'}`, tabindex: '0', role: 'button' })
    group.setAttribute('aria-label', `${relationLabel(edge)}: ${edge.source} → ${edge.target}`)
    group.append(svgEl('line', { x1, y1, x2, y2 }), svgEl('circle', { cx: x2 - 5, cy: y2, r: 3 }))
    const label = svgEl('text', { x: (x1 + x2) / 2, y: (y1 + y2) / 2 - 6, 'text-anchor': 'middle' })
    label.textContent = edge.kind
    group.appendChild(label)
    const select = () => onSelect({ type: 'edge', value: edge })
    group.addEventListener('click', select)
    group.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select() }
    })
    svg.appendChild(group)
  }

  for (const node of graph.nodes) {
    const position = layout.positions.get(node.id)
    const kind = NODE_KINDS.includes(node.kind) ? node.kind : 'unknown'
    const group = svgEl('g', { class: `route-node route-node-${kind}`, transform: `translate(${position.x} ${position.y})`, tabindex: '0', role: 'button' })
    group.setAttribute('aria-label', `${node.kind}: ${node.label}`)
    group.append(svgEl('rect', { width: position.width, height: position.height, rx: 6 }))
    const kindText = svgEl('text', { x: 12, y: 19, class: 'route-node-kind' })
    kindText.textContent = node.kind
    const labelText = svgEl('text', { x: 12, y: 41, class: 'route-node-label' })
    labelText.textContent = node.label.length > 24 ? `${node.label.slice(0, 23)}…` : node.label
    group.append(kindText, labelText)
    const select = () => onSelect({ type: 'node', value: node })
    group.addEventListener('click', select)
    group.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select() }
    })
    svg.appendChild(group)
  }
  wrap.appendChild(svg)
  return wrap
}

function renderRelationsTable(graph, onSelect) {
  const wrap = el('div', 'route-graph-table-wrap')
  const table = el('table', 'route-graph-table')
  table.appendChild(el('caption', '', t('routeGraph.relationsCaption')))
  const head = el('thead')
  const headerRow = el('tr')
  for (const heading of [t('routeGraph.fieldRelation'), t('routeGraph.fieldSource'), t('routeGraph.fieldTarget'), t('routeGraph.fieldDetails')]) appendCell(headerRow, heading, 'th').scope = 'col'
  head.appendChild(headerRow)
  const body = el('tbody')
  for (const edge of graph.edges) {
    const row = el('tr', edge.missingEndpoints.length ? 'is-invalid' : '')
    row.tabIndex = 0
    appendCell(row, edge.kind)
    appendCell(row, edge.source)
    appendCell(row, edge.target)
    appendCell(row, edge.missingEndpoints.length ? `${t('routeGraph.missingEndpoint')}: ${edge.missingEndpoints.join(', ')}` : relationLabel(edge))
    row.addEventListener('click', () => onSelect({ type: 'edge', value: edge }))
    row.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect({ type: 'edge', value: edge }) } })
    body.appendChild(row)
  }
  table.append(head, body)
  wrap.appendChild(table)
  return wrap
}

function renderNodesTable(graph, onSelect) {
  const wrap = el('div', 'route-graph-table-wrap')
  const table = el('table', 'route-graph-table')
  table.appendChild(el('caption', '', t('routeGraph.nodesCaption')))
  const head = el('thead')
  const headerRow = el('tr')
  for (const heading of [t('routeGraph.fieldKind'), t('routeGraph.fieldLabel'), t('routeGraph.fieldId'), t('routeGraph.fieldKey')]) appendCell(headerRow, heading, 'th').scope = 'col'
  head.appendChild(headerRow)
  const body = el('tbody')
  for (const node of graph.nodes) {
    const row = el('tr')
    row.tabIndex = 0
    appendCell(row, node.kind)
    appendCell(row, node.label)
    appendCell(row, node.id)
    appendCell(row, node.key)
    row.addEventListener('click', () => onSelect({ type: 'node', value: node }))
    row.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect({ type: 'node', value: node }) } })
    body.appendChild(row)
  }
  table.append(head, body)
  wrap.appendChild(table)
  return wrap
}

function renderDiagnostics(graph) {
  const section = el('section', 'route-graph-diagnostics')
  section.appendChild(el('h2', 'route-graph-section-title', t('routeGraph.diagnostics')))
  if (!graph.diagnostics.length) {
    section.appendChild(el('p', 'route-graph-muted', t('routeGraph.noDiagnostics')))
    return section
  }
  const list = el('ul', 'route-graph-diagnostic-list')
  for (const diagnostic of graph.diagnostics) {
    const item = el('li', `route-diagnostic route-diagnostic-${diagnostic.severity}`)
    item.append(el('strong', '', diagnostic.code), document.createTextNode(` — ${summarizeDiagnostic(diagnostic)}`))
    list.appendChild(item)
  }
  section.appendChild(list)
  return section
}

function setupTabs(tablist, tabs, panels, initial) {
  let active = initial
  const activate = (name, focus = false) => {
    active = name
    tabs.forEach(tab => {
      const selected = tab.dataset.view === name
      tab.setAttribute('aria-selected', String(selected))
      tab.tabIndex = selected ? 0 : -1
      if (focus && selected) tab.focus()
    })
    panels.forEach(panel => { panel.hidden = panel.dataset.view !== name })
  }
  tabs.forEach(tab => tab.addEventListener('click', () => activate(tab.dataset.view)))
  tablist.addEventListener('keydown', event => {
    const index = tabs.findIndex(tab => tab.dataset.view === active)
    let next = index
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = tabs.length - 1
    else return
    event.preventDefault()
    activate(tabs[next].dataset.view, true)
  })
  activate(initial)
}

function renderGraphResult(root, graph) {
  const content = root.querySelector('[data-role="result"]')
  const details = root.querySelector('[data-role="details"]')
  content.replaceChildren()
  renderDetails(details, null)
  if (!graph.nodes.length && !graph.edges.length) {
    content.appendChild(el('div', 'route-graph-empty', t('routeGraph.empty')))
    content.appendChild(renderDiagnostics(graph))
    return
  }

  const views = el('div', 'route-graph-views')
  const tablist = el('div', 'route-graph-tabs')
  tablist.setAttribute('role', 'tablist')
  tablist.setAttribute('aria-label', t('routeGraph.viewLabel'))
  const graphTab = el('button', 'route-graph-tab', t('routeGraph.graphView'))
  const listTab = el('button', 'route-graph-tab', t('routeGraph.listView'))
  graphTab.type = listTab.type = 'button'
  graphTab.dataset.view = 'graph'; listTab.dataset.view = 'list'
  graphTab.setAttribute('role', 'tab'); listTab.setAttribute('role', 'tab')
  graphTab.id = 'route-graph-tab-graph'; listTab.id = 'route-graph-tab-list'
  graphTab.setAttribute('aria-controls', 'route-graph-panel-graph')
  listTab.setAttribute('aria-controls', 'route-graph-panel-list')
  tablist.append(graphTab, listTab)

  const graphPanel = el('div', 'route-graph-panel')
  graphPanel.id = 'route-graph-panel-graph'; graphPanel.dataset.view = 'graph'; graphPanel.setAttribute('role', 'tabpanel')
  graphPanel.setAttribute('aria-labelledby', graphTab.id)
  const listPanel = el('div', 'route-graph-panel route-graph-list-panel')
  listPanel.id = 'route-graph-panel-list'; listPanel.dataset.view = 'list'; listPanel.setAttribute('role', 'tabpanel')
  listPanel.setAttribute('aria-labelledby', listTab.id)
  const onSelect = selection => renderDetails(details, selection)
  graphPanel.appendChild(renderSvg(graph, onSelect))
  listPanel.append(renderNodesTable(graph, onSelect), renderRelationsTable(graph, onSelect))
  views.append(tablist, graphPanel, listPanel)
  content.append(views, renderDiagnostics(graph))
  setupTabs(tablist, [graphTab, listTab], [graphPanel, listPanel], graph.nodes.length > GRAPH_NODE_THRESHOLD ? 'list' : 'graph')
}

export async function render({ runtime = isTauriRuntime(), apiClient = api } = {}) {
  const root = el('div', 'page route-graph-page')
  root.innerHTML = `
    <div class="page-header route-graph-header">
      <div><h1 class="page-title"></h1><p class="page-desc"></p></div>
      <button class="btn btn-secondary" type="button" data-role="refresh"></button>
    </div>
    <div class="page-content route-graph-content" data-role="busy">
      <div class="route-graph-live" data-role="live" aria-live="polite"></div>
      <div data-role="result"></div>
      <aside class="route-graph-details" data-role="details"></aside>
    </div>`
  root.querySelector('.page-title').textContent = t('routeGraph.title')
  root.querySelector('.page-desc').textContent = t('routeGraph.desc')
  const refresh = root.querySelector('[data-role="refresh"]')
  refresh.textContent = t('routeGraph.refresh')
  const busy = root.querySelector('[data-role="busy"]')
  const live = root.querySelector('[data-role="live"]')
  let loadGeneration = 0

  if (!runtime) {
    refresh.hidden = true
    root.querySelector('[data-role="result"]').appendChild(el('div', 'route-graph-desktop-only', t('routeGraph.desktopOnly')))
    renderDetails(root.querySelector('[data-role="details"]'), null)
    return root
  }

  const load = async () => {
    const generation = ++loadGeneration
    busy.setAttribute('aria-busy', 'true')
    refresh.disabled = true
    live.textContent = t('routeGraph.loading')
    try {
      const graph = await fetchRouteGraph({ runtime: true, apiClient })
      if (generation !== loadGeneration) return
      renderGraphResult(root, graph)
      live.textContent = t('routeGraph.loaded', { nodes: graph.nodes.length, edges: graph.edges.length })
    } catch (error) {
      if (generation !== loadGeneration) return
      const result = root.querySelector('[data-role="result"]')
      result.replaceChildren(el('div', 'route-graph-error', error instanceof TypeError ? t('routeGraph.invalidData') : t('routeGraph.loadError')))
      live.textContent = t('routeGraph.loadError')
    } finally {
      if (generation !== loadGeneration) return
      busy.setAttribute('aria-busy', 'false')
      refresh.disabled = false
    }
  }
  refresh.addEventListener('click', load)
  load()
  return root
}
