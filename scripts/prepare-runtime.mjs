#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import https from 'https'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'

const OFFICIAL_HOSTS = new Set([
  'nodejs.org',
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
])
const DOWNLOAD_TIMEOUT_MS = positiveIntegerEnv('RUNTIME_DOWNLOAD_TIMEOUT_MS', 300_000)
const DOWNLOAD_RETRIES = positiveIntegerEnv('RUNTIME_DOWNLOAD_RETRIES', 3)
const RETRY_DELAY_MS = positiveIntegerEnv('RUNTIME_RETRY_DELAY_MS', 2_000)
const MAX_ARCHIVE_BYTES = positiveIntegerEnv('RUNTIME_MAX_ARCHIVE_BYTES', 512 * 1024 * 1024)
const MAX_ARCHIVE_ENTRIES = positiveIntegerEnv('RUNTIME_MAX_ARCHIVE_ENTRIES', 100_000)
const MAX_EXTRACTED_BYTES = positiveIntegerEnv('RUNTIME_MAX_EXTRACTED_BYTES', 2 * 1024 * 1024 * 1024)

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const manifestPath = path.join(repoRoot, '_vendor', 'runtime', 'manifest.v2.json')
const buildRoot = path.join(repoRoot, '_vendor', `runtime-build-${process.pid}`)
const outRoot = path.join(repoRoot, '_vendor', 'runtime')

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
validateManifest(manifest)
if (process.argv.includes('--validate-manifest')) {
  console.log('Runtime manifest is valid')
  process.exit(0)
}
const target = process.argv[2] || process.env.OPENCLAW_RUNTIME_TARGET || detectTarget()
if (!target) {
  console.error('Unable to detect OPENCLAW_RUNTIME_TARGET')
  process.exit(1)
}
validateTarget(target, manifest)

async function main() {
  fs.mkdirSync(buildRoot, { recursive: true })
  const outPlatformRoot = path.join(outRoot, target)
  const stagedPlatformRoot = path.join(buildRoot, `${target}-stage`)
  fs.rmSync(stagedPlatformRoot, { recursive: true, force: true })
  fs.mkdirSync(stagedPlatformRoot, { recursive: true })

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
    const archivePath = path.join(buildRoot, spec.archive)
    await downloadWithRetries(spec.source, archivePath)
    const actual = sha256File(archivePath)
    if (actual !== spec.archiveSha256.toLowerCase()) {
      throw new Error(`${component} archive sha256 mismatch: expected ${spec.archiveSha256}, got ${actual}`)
    }
    const extractDir = path.join(buildRoot, `${component}-extract`)
    fs.mkdirSync(extractDir, { recursive: true })
    extractArchive(archivePath, extractDir)
    materializeComponent(component, target, extractDir, stagedPlatformRoot)
    validateExpectedEntry(component, spec, stagedPlatformRoot)
    prepared[component] = {
      ...spec,
      source: spec.source,
      prepared: true
    }
  }

  if (!Object.values(prepared).some((spec) => spec?.prepared)) {
    throw new Error(`Prepared runtime for ${target} contains no bundled components`)
  }
  const platformManifest = {
    platform: target,
    version: manifest.schemaVersion || 1,
    ...Object.fromEntries(Object.entries(prepared)),
  }
  fs.writeFileSync(path.join(stagedPlatformRoot, 'manifest.json'), JSON.stringify(platformManifest, null, 2))
  if (!dirHasFiles(stagedPlatformRoot)) {
    throw new Error(`Prepared runtime for ${target} contains no files`)
  }
  fs.rmSync(outPlatformRoot, { recursive: true, force: true })
  fs.renameSync(stagedPlatformRoot, outPlatformRoot)
  validatePreparedRuntime(prepared, outPlatformRoot)
  fs.rmSync(buildRoot, { recursive: true, force: true })
  console.log(`Prepared runtime for ${target}`)
}

main().catch(error => {
  fs.rmSync(buildRoot, { recursive: true, force: true })
  console.error(error?.stack || error?.message || error)
  process.exit(1)
})

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

function positiveIntegerEnv(name, fallback) {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }
  return value
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256')
  hash.update(fs.readFileSync(filePath))
  return hash.digest('hex')
}

function validateManifest(value) {
  if (!value || typeof value !== 'object' || !value.components || typeof value.components !== 'object') {
    throw new Error('Runtime manifest must define components')
  }
  for (const [component, targets] of Object.entries(value.components)) {
    if (!targets || typeof targets !== 'object') {
      throw new Error(`Runtime component ${component} must define targets`)
    }
    for (const [runtimeTarget, spec] of Object.entries(targets)) {
      if (spec?.strategy === 'system') continue
      if (!spec || typeof spec !== 'object') {
        throw new Error(`${component}/${runtimeTarget} must define a runtime specification`)
      }
      if (!/^[A-Za-z0-9._-]+$/.test(spec.archive || '') || path.basename(spec.archive) !== spec.archive) {
        throw new Error(`${component}/${runtimeTarget} archive must be a safe filename`)
      }
      if (!isOfficialHttpsUrl(spec.source)) {
        throw new Error(`${component}/${runtimeTarget} source must use an approved official HTTPS host`)
      }
      if (!/^[a-f0-9]{64}$/i.test(spec.archiveSha256 || '')) {
        throw new Error(`${component}/${runtimeTarget} archiveSha256 must be a 64-character SHA-256 digest`)
      }
      if (!isSafeRelativePath(spec.expectedEntry)) {
        throw new Error(`${component}/${runtimeTarget} expectedEntry must be a safe relative path`)
      }
      if (spec.sha256 !== undefined && !/^[a-f0-9]{64}$/i.test(spec.sha256)) {
        throw new Error(`${component}/${runtimeTarget} sha256 must be a 64-character SHA-256 digest when provided`)
      }
    }
  }
}

function validateTarget(value, manifestValue) {
  const supportedTargets = new Set(
    Object.values(manifestValue.components).flatMap((targets) => Object.keys(targets)),
  )
  if (!supportedTargets.has(value)) {
    throw new Error(`Unsupported OPENCLAW_RUNTIME_TARGET: ${value}`)
  }
}

function isOfficialHttpsUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && OFFICIAL_HOSTS.has(url.hostname) && !url.username && !url.password
  } catch {
    return false
  }
}

function isSafeRelativePath(value) {
  if (typeof value !== 'string' || !value || path.isAbsolute(value)) return false
  const normalized = value.replaceAll('\\', '/')
  return !normalized.split('/').some((segment) => segment === '..' || segment === '')
}

async function downloadWithRetries(url, dest) {
  let lastError
  for (let attempt = 1; attempt <= DOWNLOAD_RETRIES; attempt += 1) {
    try {
      await download(url, dest)
      return
    } catch (error) {
      lastError = error
      fs.rmSync(dest, { force: true })
      if (attempt < DOWNLOAD_RETRIES) {
        console.warn(`[runtime] download retry ${attempt}/${DOWNLOAD_RETRIES} failed: ${url} -> ${error.message || error}`)
        await delay(RETRY_DELAY_MS * attempt)
      }
    }
  }
  throw lastError
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function download(url, dest, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (!isOfficialHttpsUrl(url)) {
      reject(new Error(`Runtime download URL is not an approved official HTTPS URL: ${url}`))
      return
    }
    const request = https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        request.destroy()
        if (redirectCount >= 5) {
          reject(new Error(`Too many redirects while downloading ${url}`))
          return
        }
        const redirectUrl = new URL(res.headers.location, url).toString()
        if (!isOfficialHttpsUrl(redirectUrl)) {
          reject(new Error(`Runtime download redirect left approved official HTTPS hosts: ${redirectUrl}`))
          return
        }
        resolve(download(redirectUrl, dest, redirectCount + 1))
        return
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Download failed ${res.statusCode} for ${url}`))
        return
      }
      const contentLength = Number(res.headers['content-length'] || 0)
      if (contentLength > MAX_ARCHIVE_BYTES) {
        res.destroy()
        reject(new Error(`Runtime archive exceeds ${MAX_ARCHIVE_BYTES} byte download limit: ${url}`))
        return
      }
      const file = fs.createWriteStream(dest)
      let downloadedBytes = 0
      let settled = false
      const fail = (error) => {
        if (settled) return
        settled = true
        res.destroy()
        file.destroy()
        reject(error)
      }
      res.on('data', (chunk) => {
        downloadedBytes += chunk.length
        if (downloadedBytes > MAX_ARCHIVE_BYTES) {
          fail(new Error(`Runtime archive exceeds ${MAX_ARCHIVE_BYTES} byte download limit: ${url}`))
        }
      })
      res.on('aborted', () => fail(new Error(`Runtime download response was aborted: ${url}`)))
      res.on('error', fail)
      res.pipe(file)
      file.on('finish', () => {
        if (settled) return
        settled = true
        file.close(resolve)
      })
      file.on('error', fail)
    })
    request.setTimeout(DOWNLOAD_TIMEOUT_MS, () => {
      request.destroy(new Error(`Download timed out after ${DOWNLOAD_TIMEOUT_MS}ms for ${url}`))
    })
    request.on('error', reject)
  })
}

function extractArchive(archivePath, dest) {
  const lower = archivePath.toLowerCase()
  if (!lower.endsWith('.zip') && !lower.endsWith('.tar.gz') && !lower.endsWith('.tgz') && !lower.endsWith('.tar.xz')) {
    throw new Error(`Unsupported archive format: ${archivePath}`)
  }

  validateArchiveMembers(archivePath)
  execFileSync('tar', ['-xf', archivePath, '-C', dest, '--no-same-owner', '--no-same-permissions'], {
    stdio: 'inherit',
  })
  validateExtractedTree(dest)
}

function validateArchiveMembers(archivePath) {
  const names = execFileSync('tar', ['-tf', archivePath], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  }).split(/\r?\n/).filter(Boolean)
  if (names.length === 0 || names.length > MAX_ARCHIVE_ENTRIES) {
    throw new Error(`Runtime archive entry count must be between 1 and ${MAX_ARCHIVE_ENTRIES}`)
  }
  for (const name of names) {
    if (!isSafeArchiveMemberPath(name)) {
      throw new Error(`Runtime archive contains an unsafe member path: ${JSON.stringify(name)}`)
    }
  }

  const listing = execFileSync('tar', ['-tvf', archivePath], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  }).split(/\r?\n/).filter(Boolean)
  if (listing.length !== names.length) {
    throw new Error('Runtime archive member listing is inconsistent')
  }
  for (const line of listing) {
    const type = line[0]
    if (type !== '-' && type !== 'd') {
      throw new Error(`Runtime archive contains a link or special file: ${line}`)
    }
  }
}

function isSafeArchiveMemberPath(value) {
  if (typeof value !== 'string' || !value || value.includes('\0')) return false
  const normalized = value.replaceAll('\\', '/')
  if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) return false
  return !normalized.split('/').some((segment) => segment === '..')
}

function validateExtractedTree(root) {
  const rootReal = fs.realpathSync(root)
  let entryCount = 0
  let totalBytes = 0

  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      entryCount += 1
      if (entryCount > MAX_ARCHIVE_ENTRIES) {
        throw new Error(`Extracted runtime exceeds ${MAX_ARCHIVE_ENTRIES} entries`)
      }
      const entryPath = path.join(dir, entry.name)
      const stat = fs.lstatSync(entryPath)
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) {
        throw new Error(`Extracted runtime contains a link or special file: ${entryPath}`)
      }
      const real = fs.realpathSync(entryPath)
      if (!isPathInside(rootReal, real)) {
        throw new Error(`Extracted runtime escaped its destination: ${entryPath}`)
      }
      if (stat.isDirectory()) {
        visit(entryPath)
      } else {
        totalBytes += stat.size
        if (totalBytes > MAX_EXTRACTED_BYTES) {
          throw new Error(`Extracted runtime exceeds ${MAX_EXTRACTED_BYTES} bytes`)
        }
      }
    }
  }

  visit(root)
}

function isPathInside(root, candidate) {
  const relative = path.relative(root, candidate)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
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
      const root = pickSingleDir(extractDir)
      copyDir(root, targetDir)
      return
    }
  }

  throw new Error(`No materializer for ${component} on ${target}`)
}

function validateExpectedEntry(component, spec, outPlatformRoot) {
  if (!spec.expectedEntry) return
  const rootReal = fs.realpathSync(outPlatformRoot)
  const entryPath = path.join(outPlatformRoot, spec.expectedEntry)
  let stat
  try {
    stat = fs.lstatSync(entryPath)
  } catch {
    throw new Error(`${component} expected entry missing after prepare: ${spec.expectedEntry}`)
  }
  if (!stat.isFile() || stat.isSymbolicLink() || !isPathInside(rootReal, fs.realpathSync(entryPath))) {
    throw new Error(`${component} expected entry is not a contained regular file: ${spec.expectedEntry}`)
  }
  if (spec.sha256) {
    const actual = sha256File(entryPath)
    if (actual !== spec.sha256.toLowerCase()) {
      throw new Error(`${component} entry sha256 mismatch: expected ${spec.sha256}, got ${actual}`)
    }
  }
}

function validatePreparedRuntime(prepared, outPlatformRoot) {
  for (const [component, spec] of Object.entries(prepared)) {
    if (!spec?.prepared) continue
    validateExpectedEntry(component, spec, outPlatformRoot)
  }
}

function dirHasFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name)
    if (entry.isFile()) return true
    if (entry.isDirectory() && dirHasFiles(entryPath)) return true
  }
  return false
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
    } else if (entry.isFile()) {
      fs.copyFileSync(from, to)
    } else {
      throw new Error(`Runtime materialization rejected a link or special file: ${from}`)
    }
  }
}
