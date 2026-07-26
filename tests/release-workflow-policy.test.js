import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import test from 'node:test'

const workflow = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8')
const ciWorkflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
const dockerWorkflowSource = readFileSync(new URL('../.github/workflows/docker-image.yml', import.meta.url), 'utf8')
const allWorkflowSources = `${workflow}\n${ciWorkflow}\n${dockerWorkflowSource}`
const runtimePrepare = readFileSync(new URL('../scripts/prepare-runtime.mjs', import.meta.url), 'utf8')
const runtimeBuild = readFileSync(new URL('../src-tauri/build.rs', import.meta.url), 'utf8')
const viteConfig = readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8')
const runtimeManifest = JSON.parse(readFileSync(new URL('../_vendor/runtime/manifest.v2.json', import.meta.url), 'utf8'))
const linuxDeploy = readFileSync(new URL('../scripts/linux-deploy.sh', import.meta.url), 'utf8')
const webDeploy = readFileSync(new URL('../deploy.sh', import.meta.url), 'utf8')
const devApi = readFileSync(new URL('../scripts/dev-api.js', import.meta.url), 'utf8')
const mainJs = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
const securityPage = readFileSync(new URL('../src/pages/security.js', import.meta.url), 'utf8')
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
const translatedReadmes = [
  'README.en.md',
  'README.zh-TW.md',
  'README.ja.md',
  'README.ko.md',
  'README.vi.md',
  'README.es.md',
  'README.pt.md',
  'README.ru.md',
  'README.fr.md',
  'README.de.md',
].map(file => [file, readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')])
const contributing = readFileSync(new URL('../CONTRIBUTING.md', import.meta.url), 'utf8')
const securityLocale = readFileSync(new URL('../src/locales/modules/security.js', import.meta.url), 'utf8')
const setupPage = readFileSync(new URL('../src/pages/setup.js', import.meta.url), 'utf8')
const servicesPage = readFileSync(new URL('../src/pages/services.js', import.meta.url), 'utf8')
const aboutPage = readFileSync(new URL('../src/pages/about.js', import.meta.url), 'utf8')
const movieToolPage = readFileSync(new URL('../src/pages/movie-tool.js', import.meta.url), 'utf8')
const tauriApi = readFileSync(new URL('../src/lib/tauri-api.js', import.meta.url), 'utf8')
const aboutLocale = readFileSync(new URL('../src/locales/modules/about.js', import.meta.url), 'utf8')
const commonLocale = readFileSync(new URL('../src/locales/modules/common.js', import.meta.url), 'utf8')
const modelsPage = readFileSync(new URL('../src/pages/models.js', import.meta.url), 'utf8')
const assistantPage = readFileSync(new URL('../src/pages/assistant.js', import.meta.url), 'utf8')
const knowledgeBase = readFileSync(new URL('../src/lib/openclaw-kb.js', import.meta.url), 'utf8')
const zhCnLocale = readFileSync(new URL('../src/locales/zh-CN.json', import.meta.url), 'utf8')
const zhTwLocale = readFileSync(new URL('../src/locales/zh-TW.json', import.meta.url), 'utf8')
const rustConfig = readFileSync(new URL('../src-tauri/src/commands/config.rs', import.meta.url), 'utf8')
const rustMessaging = readFileSync(new URL('../src-tauri/src/commands/messaging.rs', import.meta.url), 'utf8')
const dockerfile = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8')
const dockerCompose = readFileSync(new URL('../docker-compose.yml', import.meta.url), 'utf8')
const dockerDeploy = readFileSync(new URL('../scripts/docker-deploy.sh', import.meta.url), 'utf8')
const dockerWorkflow = readFileSync(new URL('../.github/workflows/docker-image.yml', import.meta.url), 'utf8')
const mirrorUrls = readFileSync(new URL('../src/lib/mirror-urls.js', import.meta.url), 'utf8')
const buildScript = readFileSync(new URL('../scripts/build.sh', import.meta.url), 'utf8')
const devScript = readFileSync(new URL('../scripts/dev.sh', import.meta.url), 'utf8')
const retiredTranslationGenerator = readFileSync(new URL('../scripts/gen-patches-6lang.cjs', import.meta.url), 'utf8')
const releaseGovernanceDocs = Object.fromEntries(
  ['SUPPORT.md', 'PRIVACY.md', 'THIRD_PARTY.md', 'VERIFY_RELEASE.md'].map(file => [
    file,
    readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'),
  ]),
)

function jobBlock(name, nextName) {
  const start = workflow.indexOf(`  ${name}:`)
  assert.notEqual(start, -1, `missing ${name} job`)

  const end = nextName ? workflow.indexOf(`  ${nextName}:`, start + 1) : workflow.length
  assert.notEqual(end, -1, `missing job after ${name}`)
  return workflow.slice(start, end)
}

test('bundled runtime uses complete hashes and verified official HTTPS sources', () => {
  const approvedHosts = new Set([
    'nodejs.org',
    'github.com',
    'objects.githubusercontent.com',
    'release-assets.githubusercontent.com',
  ])
  let bundledEntries = 0

  for (const [component, targets] of Object.entries(runtimeManifest.components)) {
    for (const [target, spec] of Object.entries(targets)) {
      if (spec.strategy === 'system') continue
      bundledEntries += 1
      assert.match(spec.archiveSha256, /^[a-f0-9]{64}$/i, `${component}/${target} must pin SHA-256`)
      const source = new URL(spec.source)
      assert.equal(source.protocol, 'https:', `${component}/${target} must use HTTPS`)
      assert.ok(approvedHosts.has(source.hostname), `${component}/${target} must use an approved official host`)
    }
  }

  assert.equal(bundledEntries, 8)
  assert.ok(runtimePrepare.includes("process.argv.includes('--validate-manifest')"))
  assert.ok(runtimePrepare.includes('archiveSha256 must be a 64-character SHA-256 digest'))
  assert.ok(runtimePrepare.includes('Unsupported OPENCLAW_RUNTIME_TARGET'))
  assert.ok(runtimePrepare.includes('contains no bundled components'))
  assert.ok(runtimePrepare.includes('redirect left approved official HTTPS hosts'))
  assert.ok(runtimePrepare.includes('MAX_ARCHIVE_BYTES'))
  assert.ok(runtimePrepare.includes('MAX_ARCHIVE_ENTRIES'))
  assert.ok(runtimePrepare.includes('MAX_EXTRACTED_BYTES'))
  assert.ok(runtimePrepare.includes('validateArchiveMembers(archivePath)'))
  assert.ok(runtimePrepare.includes('isSafeArchiveSymlink(line)'))
  assert.ok(runtimePrepare.includes('contains an unsafe link or special file'))
  assert.ok(runtimePrepare.includes('contains an unsafe symbolic link'))
  assert.ok(runtimePrepare.includes('expected entry is not a contained regular file'))
  assert.ok(runtimePrepare.includes('entry sha256 mismatch'))
  assert.ok(runtimeBuild.includes('unsupported Cargo TARGET for bundled runtime'))
  assert.ok(!runtimeBuild.includes('"windows-x64".to_string()\n}'))
  assert.ok(!runtimePrepare.includes("from 'http'"))
  assert.ok(!runtimePrepare.includes('RUNTIME_BASE_URL'))
  assert.ok(!ciWorkflow.includes('124.220.22.11'))
  assert.ok(!ciWorkflow.includes('RUNTIME_BASE_URL'))
})

test('application source is not forced into startup-wide manual chunks', () => {
  assert.ok(viteConfig.includes("cleanId.includes('/node_modules/')"))
  assert.ok(viteConfig.includes("return 'vendor'"))
  for (const chunkName of ['app-core', 'hermes-core', 'gateway-core']) {
    assert.ok(!viteConfig.includes(`return '${chunkName}'`), `${chunkName} must remain naturally split`)
  }
})

test('workflow actions are pinned to immutable commit SHAs', () => {
  const actionRefs = [...allWorkflowSources.matchAll(/^\s*(?:-\s*)?uses:\s*([^\s#]+)/gm)].map(match => match[1])
  assert.ok(actionRefs.length > 0)
  for (const ref of actionRefs) {
    assert.match(ref, /^[^@\s]+@[a-f0-9]{40}$/i, `action must pin an immutable commit SHA: ${ref}`)
  }
})

test('paid-release governance documents remain linked and fail-closed', () => {
  for (const file of Object.keys(releaseGovernanceDocs)) {
    assert.ok(readme.includes(`](${file})`), `README must link ${file}`)
  }
  assert.ok(releaseGovernanceDocs['SUPPORT.md'].includes('工作流存在、YAML 可解析或构建命令可执行，不等于安装包已经'))
  assert.ok(releaseGovernanceDocs['PRIVACY.md'].includes('通用配置 API 或 IPC 不应返回明文密码、密码哈希'))
  assert.ok(releaseGovernanceDocs['THIRD_PARTY.md'].includes('package-lock.json'))
  assert.ok(releaseGovernanceDocs['THIRD_PARTY.md'].includes('src-tauri/Cargo.lock'))
  assert.ok(releaseGovernanceDocs['VERIFY_RELEASE.md'].includes('SHA256SUMS'))
  assert.ok(releaseGovernanceDocs['VERIFY_RELEASE.md'].includes('摘要不匹配'))
  for (const [file, source] of Object.entries(releaseGovernanceDocs)) {
    assert.ok(!source.includes('124.220.22.11'), `${file} must not reference the retired runtime mirror`)
    assert.ok(!source.includes('/archive/refs/heads/main'), `${file} must not use mutable main archives`)
  }
})

test('release workflow validates source before platform builds', () => {
  const validate = jobBlock('validate', 'build-windows-x64')

  for (const command of [
    'npm ci --prefer-offline',
    'npm test',
    'npm run build',
    'node scripts/prepare-runtime.mjs --validate-manifest',
    'cargo fmt --all -- --check',
    'cargo check --all-targets',
    'cargo test --all-targets',
  ]) {
    assert.ok(validate.includes(command), `validate job must run: ${command}`)
  }
})

test('every release platform build depends on validation', () => {
  const jobs = [
    ['build-windows-x64', 'build-windows-arm64'],
    ['build-windows-arm64', 'build-macos-arm64'],
    ['build-macos-arm64', 'build-macos-intel'],
    ['build-macos-intel', 'build-linux-x64'],
    ['build-linux-x64', 'release'],
  ]

  for (const [name, nextName] of jobs) {
    assert.match(jobBlock(name, nextName), /\n    needs: validate\n/, `${name} must depend on validate`)
  }
})

test('release publication waits for every platform artifact', () => {
  const release = jobBlock('release')
  const required = [
    'build-windows-x64',
    'build-windows-arm64',
    'build-linux-x64',
    'build-macos-arm64',
    'build-macos-intel',
  ]

  for (const job of required) {
    assert.ok(release.includes(job), `release job must wait for ${job}`)
  }
  assert.ok(release.includes('Verify release tag matches app version'))
  assert.ok(release.includes('git archive --format=tar'))
  assert.ok(release.includes('gzip -n'))
  assert.ok(release.includes("sha256sum > SHA256SUMS"))
  assert.ok(release.includes('sha256sum --check SHA256SUMS'))
  assert.ok(release.includes('cp deploy.sh release-assets/deploy.sh'))
  assert.ok(release.includes('files: release-assets/*'))
})

test('deploy scripts avoid legacy package names and unverified fallback sources', () => {
  assert.ok(webDeploy.includes('api.github.com/repos/$REPO/releases/latest'))
  assert.ok(webDeploy.includes('npm ci --ignore-scripts'))
  assert.ok(webDeploy.includes('SHA256SUMS'))
  assert.ok(webDeploy.includes('XingShuOpenClaw-v$LATEST-source.tar.gz'))
  assert.ok(webDeploy.includes('sha256sum'))
  assert.ok(webDeploy.includes('shasum -a 256'))
  assert.ok(webDeploy.indexOf('SHA-256 校验失败') < webDeploy.indexOf('tar xzf'))
  assert.ok(!webDeploy.includes('/archive/refs/tags/'))
  assert.ok(!webDeploy.includes('@qingchencloud/openclaw-zh'))
  assert.ok(!webDeploy.includes('gitee.com'))
  assert.ok(!webDeploy.includes('raw.githubusercontent.com/TuLu-openclaw/tulu-openclaw-v2/main/deploy.sh'))

  assert.ok(linuxDeploy.includes('npm install -g openclaw'))
  assert.ok(linuxDeploy.includes("manifest.name === 'openclaw'"))
  assert.ok(linuxDeploy.includes('verify_official_openclaw "$oc_path"'))
  assert.ok(linuxDeploy.includes('无法证明来自官方 npm 包'))
  assert.ok(linuxDeploy.includes('无法验证已安装 CLI 属于官方 npm 包 openclaw'))
  assert.ok(linuxDeploy.includes('api.github.com/repos/$REPO/releases/latest'))
  assert.ok(linuxDeploy.includes('npm ci --ignore-scripts'))
  assert.ok(linuxDeploy.includes('tar tzf'))
  assert.ok(linuxDeploy.includes('SHA256SUMS'))
  assert.ok(linuxDeploy.includes('XingShuOpenClaw-v$latest-source.tar.gz'))
  assert.ok(linuxDeploy.includes('sha256sum'))
  assert.ok(linuxDeploy.includes('shasum -a 256'))
  assert.ok(linuxDeploy.indexOf('SHA-256 校验失败') < linuxDeploy.indexOf('tar xzf'))
  assert.ok(!linuxDeploy.includes('/archive/refs/tags/'))
  assert.ok(!linuxDeploy.includes('@qingchencloud/openclaw-zh'))
  assert.ok(!linuxDeploy.includes('pull --ff-only origin main'))
  assert.ok(!linuxDeploy.includes('mustChangePassword'))
  assert.ok(!linuxDeploy.includes('DEFAULT_PASSWORD'))
  assert.ok(linuxDeploy.includes('setup_initial_auth_state'))
})

test('auth bootstrap uses explicit setup flow without password disclosure', () => {
  assert.ok(devApi.includes("state: 'setup_required'"))
  assert.ok(devApi.includes("state: 'login_required'"))
  assert.ok(devApi.includes("state: 'authenticated'"))
  assert.ok(devApi.includes("if (cmd === 'auth_setup')"))
  assert.ok(devApi.includes("code: 'SETUP_REQUIRED'"))
  assert.ok(devApi.includes('if (!hasAccessPassword(cfg)) return false'))
  assert.ok(devApi.includes("const AUTH_EXEMPT = new Set(['auth_check', 'auth_login', 'auth_setup', 'auth_logout'])"))
  assert.ok(devApi.includes("delete config.accessPassword"))
  assert.ok(devApi.includes("delete config.accessPasswordHash"))
  assert.ok(devApi.includes("delete config.mustChangePassword"))
  assert.ok(devApi.includes("delete nextConfig.accessPassword"))
  assert.ok(devApi.includes("delete nextConfig.accessPasswordHash"))
  assert.ok(devApi.includes("delete nextConfig.mustChangePassword"))
  assert.ok(devApi.includes("crypto.pbkdf2Sync(password, salt, PASSWORD_HASH_ITERATIONS, 32, 'sha256')"))
  assert.ok(devApi.includes("req.headers['x-setup-token']"))
  assert.ok(devApi.includes("code: 'SETUP_TOKEN_REQUIRED'"))
  assert.ok(mainJs.includes("'X-Setup-Token': setupToken"))
  assert.ok(!devApi.includes('generateTemporaryPassword()'))
  assert.ok(!mainJs.includes('defaultPw'))
  assert.ok(mainJs.includes('showSetupOverlay'))
  assert.ok(mainJs.includes("mode: 'unavailable'"))
  assert.ok(rustConfig.includes('strip_panel_auth_fields(&mut config)'))
  assert.ok(rustConfig.includes('PANEL_AUTHENTICATED.load(Ordering::SeqCst)'))
  assert.ok(rustConfig.includes('pub fn panel_auth_login(password: String)'))
  assert.ok(rustConfig.includes('static PANEL_CONFIG_WRITE_LOCK: Mutex<()>'))
  assert.match(rustConfig, /pub fn write_panel_config\(mut config: Value\)[\s\S]*?PANEL_CONFIG_WRITE_LOCK[\s\S]*?PANEL_AUTHENTICATED\.load/)
  assert.match(rustConfig, /fn update_panel_runtime_binding\([\s\S]*?PANEL_CONFIG_WRITE_LOCK[\s\S]*?read_panel_config_raw\(\)[\s\S]*?write_panel_config_raw\(&config\)/)
  assert.ok(!mainJs.includes('cfg.accessPassword'))
  assert.ok(!securityPage.includes('cfg.accessPassword'))
})

test('current docs and security copy describe first-visit setup without legacy concepts', () => {
  for (const legacy of [
    'github.com/qingchencloud/clawpanel',
    '~/.openclaw/clawpanel.json',
    'mustChangePassword',
    '自动生成默认密码',
  ]) {
    assert.ok(!contributing.includes(legacy), `CONTRIBUTING must not contain: ${legacy}`)
  }
  assert.ok(contributing.includes('首次启动且没有密码'))
  assert.ok(contributing.includes('SETUP_REQUIRED'))
  assert.ok(securityLocale.includes("ignoreRiskTitle: _('免密码访问'"))
  assert.ok(securityLocale.includes('欢迎使用，请先设置访问密码'))
})

test('README documents version-specific Node compatibility instead of legacy 18+ guidance', () => {
  assert.ok(readme.includes('OpenClaw `2026.6.5+`'))
  assert.ok(readme.includes('OpenClaw `2026.7.1+`'))
  assert.ok(!readme.includes('| Node.js | 18+ |'))
})

test('web deployment guidance uses release assets instead of raw main scripts', () => {
  const expected = 'curl -fsSL -o deploy.sh https://github.com/TuLu-openclaw/tulu-openclaw-v2/releases/latest/download/deploy.sh && bash deploy.sh'
  assert.ok(readme.includes(expected))
  assert.ok(setupPage.includes(expected))
  assert.ok(!readme.includes('raw.githubusercontent.com/TuLu-openclaw/tulu-openclaw-v2/main/deploy.sh'))
  assert.ok(!setupPage.includes('raw.githubusercontent.com/TuLu-openclaw/tulu-openclaw-v2/main/deploy.sh'))
  assert.ok(!readme.includes('cd clawpanel'))
})

test('translated READMEs do not advertise retired sources or unsupported release artifacts', () => {
  const forbidden = [
    'github.com/1186258278/OpenClawChineseTranslation',
    'github.com/qingchencloud',
    'ghcr.io/qingchencloud',
    'gpt.qt.cool',
    'qingchencloud.com',
    'Node.js 18+',
    '| MSI |',
    '| RPM |',
    '.msi`',
    '.rpm`',
  ]

  for (const [file, contents] of translatedReadmes) {
    assert.ok(contents.includes('https://github.com/openclaw/openclaw'), `${file} must link to official OpenClaw`)
    assert.ok(contents.includes('https://github.com/TuLu-openclaw/tulu-openclaw-v2/releases/latest'), `${file} must link to formal releases`)
    for (const value of forbidden) {
      assert.ok(!contents.includes(value), `${file} must not contain: ${value}`)
    }
  }
})

test('panel update and about page no longer advertise legacy mirrors or obsolete package hubs', () => {
  assert.ok(rustConfig.includes('https://api.github.com/repos/TuLu-openclaw/tulu-openclaw-v2/releases/latest'))
  assert.ok(rustConfig.includes('https://github.com/TuLu-openclaw/tulu-openclaw-v2/releases/latest'))
  assert.ok(!rustConfig.includes('qingchencloud/星枢OpenClaw'))
  assert.ok(!rustConfig.includes('QtCodeCreators/星枢OpenClaw'))
  assert.ok(!rustConfig.includes('https://claw.qt.cool'))
  assert.ok(!aboutPage.includes('QtCodeCreators/星枢OpenClaw'))
  assert.ok(!aboutPage.includes('OpenClawChineseTranslation'))
  assert.ok(!aboutPage.includes("t('about.domesticMirrorHint')"))
  assert.ok(!aboutPage.includes("t('about.linkOpenClawZh')"))
  assert.ok(!aboutLocale.includes('domesticMirrorHint'))
  assert.ok(!aboutLocale.includes('linkOpenClawZh'))
})

test('legacy default-password copy is removed from shared and aggregated locales', () => {
  assert.ok(!commonLocale.includes('defaultPasswordBanner'))
  assert.ok(!zhCnLocale.includes('已自动填充默认密码'))
  assert.ok(!zhCnLocale.includes('使用默认密码（需修改）'))
  assert.ok(!zhTwLocale.includes('已自動填充預設密碼'))
  assert.ok(!zhTwLocale.includes('使用預設密碼（需修改）'))
})

test('active pages and knowledge base no longer promote qtcool to new users', () => {
  assert.ok(!modelsPage.includes('id="qtcool-promo"'))
  assert.ok(!assistantPage.includes('id="ast-qtcool-promo"'))
  assert.ok(!knowledgeBase.includes('https://gpt.qt.cool/'))
  assert.ok(!knowledgeBase.includes('https://qt.cool/'))
  assert.ok(!movieToolPage.includes('https://claw.qt.cool/'))
})

test('active install and upgrade paths are restricted to official OpenClaw via npm', () => {
  for (const retired of ['standalone-r2', 'standalone-github', 'data-source="chinese"', 'value="chinese"']) {
    assert.ok(!setupPage.includes(retired), `setup page must not expose: ${retired}`)
    assert.ok(!servicesPage.includes(retired), `services page must not expose: ${retired}`)
  }
  assert.ok(!servicesPage.includes('switchToChinese'))
  assert.ok(tauriApi.includes("invoke('upgrade_openclaw', { source: 'official', version, method: 'npm' }"))
  assert.match(devApi, /async list_openclaw_versions\(\) \{\r?\n    const source = 'official'/)
  assert.match(devApi, /async function getLatestVersionFor\(\) \{\r?\n  const pkg = npmPackageName\('official'\)/)
  assert.ok(devApi.includes("const recommended = recommendedVersionFor('official')"))
  assert.match(devApi, /async upgrade_openclaw\(\{ version \} = \{\}\) \{\r?\n    const source = 'official'/)
  assert.ok(!devApi.includes('github.com/qingchencloud/openclaw-standalone'))
  assert.ok(rustConfig.includes('let source = "official".to_string();'))
  assert.ok(rustConfig.includes('async fn get_latest_version_for()'))
  assert.equal((rustConfig.match(/let recommended = recommended_version_for\("official"\);/g) || []).length, 2)
  assert.match(
    rustConfig,
    /upgrade_openclaw_inner\(\s*app2\.clone\(\),\s*"official"\.into\(\),\s*version,\s*"npm"\.into\(\)\s*\)/,
  )
  assert.ok(!rustConfig.includes('github.com/qingchencloud/openclaw-standalone'))
  assert.equal((rustConfig.match(/try_standalone_install\(/g) || []).length, 1, 'legacy standalone installer must have no caller')
  assert.equal((devApi.match(/_tryStandaloneInstall\(/g) || []).length, 1, 'Web legacy standalone installer must have no caller')
  assert.ok(!rustMessaging.includes('npm i -g @qingchencloud/openclaw-zh'))
  assert.ok(rustMessaging.includes('npm i -g openclaw@latest --registry https://registry.npmjs.org'))
})

test('Docker paths use official packages and build only the checked-out source', () => {
  assert.ok(dockerfile.includes('npm install -g openclaw'))
  assert.ok(dockerfile.includes('registry.npmjs.org'))
  assert.ok(!dockerfile.includes('@qingchencloud/openclaw-zh'))
  assert.ok(!dockerfile.includes('registry.npmmirror.com'))

  assert.ok(dockerCompose.includes('xingshu-openclaw:'))
  assert.ok(!dockerCompose.includes('@qingchencloud/openclaw-zh'))
  assert.ok(!dockerCompose.includes('registry.npmmirror.com'))

  assert.ok(dockerDeploy.includes('仅从当前检出的源码构建'))
  assert.ok(dockerDeploy.includes('首次访问时请设置访问密码'))
  assert.ok(!dockerDeploy.includes('git fetch origin main'))
  assert.ok(!dockerDeploy.includes('git pull origin main'))

  assert.ok(devApi.includes("const DEFAULT_OPENCLAW_IMAGE = 'ghcr.io/openclaw/openclaw'"))
  assert.ok(dockerWorkflow.includes('permissions:\n  contents: read'))
  assert.ok(dockerWorkflow.includes('tulu-openclaw:ci'))
})

test('URL helpers expose formal repositories and Release assets only', () => {
  assert.ok(mirrorUrls.includes('https://github.com/TuLu-openclaw'))
  assert.ok(mirrorUrls.includes('/releases/latest'))
  assert.ok(!mirrorUrls.includes('gitee.com'))
  assert.ok(!mirrorUrls.includes('raw.githubusercontent.com'))
  assert.ok(!mirrorUrls.includes('/main/deploy.sh'))
})

test('repository root excludes one-off debug, repair, crawl, and commit helper files', () => {
  const rootFiles = readdirSync(new URL('..', import.meta.url), { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
  const forbidden = /^(?:\.git_commit_msg\.txt|\.gitmsg\.txt|_dev_server\.js|_inject_.*\.py|analyze-.*\.cjs|check_.*\.py|commit-fix\.sh|find-bytes.*\.cjs|fix(?:_|-|\d).*\.(?:cjs|js|py)|line\d+\.cjs|make-test\.js|test-(?:crawl.*|bfzy|detail|movie-api|play)\.(?:cjs|js|mjs)|verify(?:-fix)?\.(?:cjs|mjs))$/
  assert.deepEqual(rootFiles.filter((name) => forbidden.test(name)), [])
})

test('developer scripts avoid stale binaries, destructive cleanup, and retired locale generation', () => {
  assert.ok(buildScript.includes('Rust 二进制包名: XingShu'))
  assert.ok(!buildScript.includes('target/debug/clawpanel'))
  assert.ok(!devScript.includes('pkill'))
  assert.ok(!devScript.includes('kill -9'))
  assert.ok(devScript.includes('npm run dev -- --port 1420'))
  assert.ok(retiredTranslationGenerator.includes('Retired generator: edit src/locales/ directly'))
  assert.ok(retiredTranslationGenerator.indexOf('throw new Error') < retiredTranslationGenerator.indexOf("require('fs')"))
})
