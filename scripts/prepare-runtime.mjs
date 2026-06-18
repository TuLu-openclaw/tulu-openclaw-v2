#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import https from 'https'
import http from 'http'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'

const DEFAULT_RUNTIME_BASE_URL = 'http://124.220.22.11:9002/runtime'
const OFFICIAL_HOSTS = new Set([
  'nodejs.org',
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
])
const IS_CI = ['1', 'true', 'yes'].includes(String(process.env.CI || '').toLowerCase())

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const manifestPath = path.join(repoRoot, '_vendor', 'runtime', 'manifest.v2.json')
const buildRoot = path.join(repoRoot, '_vendor', `runtime-build-${process.pid}`)
const outRoot = path.join(repoRoot, '_vendor', 'runtime')

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const target = process.argv[2] || process.env.OPENCLAW_RUNTIME_TARGET || detectTarget()
if (!target) {
  console.error('Unable to detect OPENCLAW_RUNTIME_TARGET')
  process.exit(1)
}

fs.mkdirSync(buildRoot, { recursive: true })
const outPlatformRoot = path.join(outRoot, target)
fs.rmSync(outPlatformRoot, { recursive: true, force: true })
fs.mkdirSync(outPlatformRoot, { recursive: true })

const prepared = {}
for (const component of Object.keys(manifest.components)) {
  const spec = manifest.components[component]?.[target]
  if (!spec) continue
  if (spec.strategy === 'system') {
    prepared[component] = {
      ...spec,
      prepared: false,
      reason: 'system dependency'
    }
    continue
  }
  const resolvedSource = resolveRuntimeSource(spec)
  const archivePath = path.join(buildRoot, spec.archive)
  await downloadWithFallback(resolvedSource, spec.source, archivePath)
  if (spec.archiveSha256) {
    const actual = sha256File(archivePath)
    if (actual !== spec.archiveSha256.toLowerCase()) {
      throw new Error(`${component} archive sha256 mismatch: expected ${spec.archiveSha256}, got ${actual}`)
    }
  }
  const extractDir = path.join(buildRoot, `${component}-extract`)
  fs.mkdirSync(extractDir, { recursive: true })
  extractArchive(archivePath, extractDir)
  materializeComponent(component, target, extractDir, outPlatformRoot)
  prepared[component] = {
    ...spec,
    source: resolvedSource,
    officialSource: spec.source,
    prepared: true
  }
}

const platformManifest = {
  platform: target,
  version: manifest.schemaVersion || 1,
  ...Object.fromEntries(Object.entries(prepared)),
}
fs.writeFileSync(path.join(outPlatformRoot, 'manifest.json'), JSON.stringify(platformManifest, null, 2))
fs.rmSync(buildRoot, { recursive: true, force: true })
console.log(`Prepared runtime for ${target}`)

function detectTarget() {
  const platform = process.platform
  const arch = process.arch
  if (platform === 'win32' && arch === 'x64') return 'windows-x64'
  if (platform === 'win32' && arch === 'arm64') return 'windows-arm64'
  if (platform === 'darwin' && arch === 'x64') return 'macos-x64'
  if (platform === 'darwin' && arch === 'arm64') return 'macos-arm64'
  if (platform === 'linux' && arch === 'x64') return 'linux-x64'
  if (platform === 'linux' && arch === 'arm64') return 'linux-arm64'
  return ''
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256')
  hash.update(fs.readFileSync(filePath))
  return hash.digest('hex')
}

function resolveRuntimeSource(spec) {
  const overrideBase = String(process.env.RUNTIME_BASE_URL || process.env.OPENCLAW_RUNTIME_BASE_URL || '').trim()
  const mirrorBase = overrideBase || (!IS_CI ? DEFAULT_RUNTIME_BASE_URL : '')
  if (!mirrorBase) return spec.source
  try {
    const sourceUrl = new URL(spec.source)
    if (!OFFICIAL_HOSTS.has(sourceUrl.hostname)) return spec.source
    return new URL(spec.archive, ensureTrailingSlash(mirrorBase)).toString()
  } catch {
    return spec.source
  }
}

function ensureTrailingSlash(value) {
  return value.endsWith('/') ? value : `${value}/`
}

async function downloadWithFallback(primaryUrl, fallbackUrl, dest) {
  const tried = []
  if (primaryUrl) {
    tried.push(primaryUrl)
    try {
      await download(primaryUrl, dest)
      return
    } catch (error) {
      console.warn(`[runtime] primary download failed: ${primaryUrl} -> ${error.message || error}`)
      if (!fallbackUrl || fallbackUrl === primaryUrl) throw error
    }
  }
  if (!fallbackUrl || tried.includes(fallbackUrl)) {
    throw new Error(`Download failed for ${tried.join(' , ')}`)
  }
  await download(fallbackUrl, dest)
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http
    client.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(download(res.headers.location, dest))
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Download failed ${res.statusCode} for ${url}`))
        return
      }
      const file = fs.createWriteStream(dest)
      res.pipe(file)
      file.on('finish', () => file.close(resolve))
      file.on('error', reject)
    }).on('error', reject)
  })
}

function extractArchive(archivePath, dest) {
  const lower = archivePath.toLowerCase()
  if (lower.endsWith('.zip')) {
    execFileSync('tar', ['-xf', archivePath, '-C', dest], { stdio: 'inherit' })
    return
  }
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz') || lower.endsWith('.tar.xz')) {
    execFileSync('tar', ['-xf', archivePath, '-C', dest], { stdio: 'inherit' })
    return
  }
  throw new Error(`Unsupported archive format: ${archivePath}`)
}

function materializeComponent(component, target, extractDir, outPlatformRoot) {
  const targetDir = path.join(outPlatformRoot, component)
  fs.mkdirSync(targetDir, { recursive: true })

  if (component === 'node') {
    const root = pickSingleDir(extractDir)
    copyDir(root, targetDir)
    return
  }

  if (component === 'git') {
    if (target.startsWith('windows-')) {
      copyDir(extractDir, targetDir)
      return
    }
  }

  throw new Error(`No materializer for ${component} on ${target}`)
}

function pickSingleDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true }).filter(e => !e.name.startsWith('.'))
  if (entries.length === 1 && entries[0].isDirectory()) {
    return path.join(dir, entries[0].name)
  }
  return dir
}

function copyDir(src, dst) {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name)
    const to = path.join(dst, entry.name)
    if (entry.isDirectory()) {
      fs.mkdirSync(to, { recursive: true })
      copyDir(from, to)
    } else {
      fs.copyFileSync(from, to)
    }
  }
}
