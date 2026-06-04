/**
 * npm install / upgrade error diagnosis.
 * Parses npm error output and returns user-facing title/hint/command.
 */

const NPM_CMD = 'npm install -g @qingchencloud/openclaw-zh --registry https://registry.npmmirror.com'
const GIT_HTTPS_CMD = 'git config --global url."https://github.com/".insteadOf ssh://git@github.com/ && git config --global --add url."https://github.com/".insteadOf ssh://git@github.com && git config --global --add url."https://github.com/".insteadOf ssh://git@://github.com/ && git config --global --add url."https://github.com/".insteadOf git@github.com: && git config --global --add url."https://github.com/".insteadOf git://github.com/ && git config --global --add url."https://github.com/".insteadOf git+ssh://git@github.com/'
const GIT_HTTPS_ROOT_CMD = 'sudo git config --global url."https://github.com/".insteadOf ssh://git@github.com/ && sudo git config --global --add url."https://github.com/".insteadOf ssh://git@github.com && sudo git config --global --add url."https://github.com/".insteadOf ssh://git@://github.com/ && sudo git config --global --add url."https://github.com/".insteadOf git@github.com: && sudo git config --global --add url."https://github.com/".insteadOf git://github.com/ && sudo git config --global --add url."https://github.com/".insteadOf git+ssh://git@github.com/'

const INSTALL_ERROR_FALLBACK = {
  installGitSshDeniedTitle: '安装失败 — Git SSH 认证被拒绝',
  installGitSshDeniedRootHint: 'GitHub SSH 认证失败。检测到本次安装实际由 root/sudo 执行，请先为 root 用户配置 HTTPS 替代规则后重试：',
  installGitSshDeniedHint: 'GitHub SSH 认证失败。星枢OpenClaw 已尝试自动配置 HTTPS 替代，但可能未生效。请在终端手动执行：',
  installGitSshDeniedRetryRootHint: 'GitHub SSH 认证失败。检测到本次安装由 root/sudo 执行，请先为 root 用户配置 HTTPS 替代规则后重试：',
  installGitSshDeniedRetryHint: 'GitHub SSH 认证失败。星枢OpenClaw 已尝试自动配置 HTTPS 替代，但可能未生效。请在终端手动执行后重试：',
  installGitPullTitle: '安装失败 — Git 拉取依赖错误',
  installGitPullRootHint: 'Git 操作失败（exit 128）。检测到本次安装由 root/sudo 执行，请先确认网络正常，再为 root 用户执行以下 HTTPS 替代规则后重试：',
  installGitPullHint: 'Git 操作失败（exit 128）。可能是网络问题或 SSH 认证失败。请先确认网络正常，然后在终端手动执行以下命令后重试：',
  installNativeBindingTitle: '安装失败 — 原生依赖缺失',
  installNativeBindingHint: 'OpenClaw 的原生模块未正确安装。这通常是 npm optional dependencies 的 bug。请尝试在终端手动重装：',
  installEpermTitle: '安装失败 — 文件被占用或权限不足',
  installEpermHint: '常见原因：杀毒软件拦截、Gateway 进程未关闭、或终端缺少管理员权限。\n请先关闭 Gateway，再以管理员身份打开终端手动安装：',
  installEexistTitle: '安装失败 — 文件冲突',
  installEexistHint: '旧版本的 openclaw 命令文件仍然存在。星枢OpenClaw 已尝试自动清理，如仍失败请手动处理后重试：',
  installNpmPrefixTitle: '安装失败 — npm 全局目录异常',
  installNpmPrefixHint: 'npm 全局安装目录可能不存在或损坏（{path}）。\n请先修复 npm 目录，再重试安装：',
  installEnoentTitle: '安装失败 — 文件或目录不存在',
  installEnoentHint: '常见原因：npm 全局目录未创建、杀毒软件隔离了文件、或磁盘权限问题。\n建议步骤：\n1. 关闭杀毒软件的实时防护\n2. 以管理员身份打开 PowerShell\n3. 手动运行安装命令：',
  installEaccesTitle: '安装失败 — 权限不足',
  installEaccesMacHint: '请在终端使用 sudo 安装：',
  installEaccesWinHint: '请以管理员身份打开 PowerShell 安装：',
  installModuleMissingTitle: '安装不完整',
  installModuleMissingHint: '上次安装可能中断了。先清理残留再重装：',
  installNetworkTitle: '安装失败 — 网络连接错误',
  installProxyHint: '检测到代理/证书问题。如果你使用了 VPN 或公司代理，请尝试关闭后重试，或设置 npm 信任证书：',
  installNetworkHint: '无法连接到 npm 仓库。请检查网络连接，或尝试使用国内镜像源：',
  installCacheTitle: '安装失败 — npm 缓存异常',
  installCacheHint: '本地缓存可能损坏。清理缓存后重试：',
  installNodeVersionTitle: '安装失败 — Node.js 版本不兼容',
  installNodeVersionHint: '当前 Node.js 版本过低，OpenClaw 需要 Node.js 18 或更高版本。\n请升级 Node.js：',
  installNodeDownloadCommand: '下载最新版: https://nodejs.org/',
  installNpmErrorTitle: '安装失败 — npm 异常',
  installNpmErrorHint: 'npm 自身可能异常。尝试更新 npm 后重试：',
  installDiskSpaceTitle: '安装失败 — 磁盘空间不足',
  installDiskSpaceHint: '磁盘空间不足，请清理磁盘后重试。',
  installFailedTitle: '安装失败',
  installFallbackHint: '请在终端手动尝试安装，查看完整错误信息：',
}

function createInstallErrorTranslator(translate) {
  return (key, params = {}) => {
    const fullKey = `setup.${key}`
    let value = typeof translate === 'function' ? translate(fullKey, params) : ''
    if (!value || value === fullKey) value = INSTALL_ERROR_FALLBACK[key] || fullKey
    return String(value).replace(/\{(\w+)\}/g, (_, name) => params[name] ?? '')
  }
}

/**
 * @param {string} errStr - npm error output, including streamed logs
 * @param {(key: string, params?: object) => string} [translate] - optional i18n function
 * @returns {{ title: string, hint?: string, command?: string }}
 */
export function diagnoseInstallError(errStr, translate) {
  const tr = createInstallErrorTranslator(translate)
  const raw = String(errStr || '')
  const s = raw.toLowerCase()
  const rootNpm = s.includes('/root/.npm/') || s.includes('/root/.config/') || s.includes('sudo npm')
  const gitFixCommand = rootNpm ? GIT_HTTPS_ROOT_CMD : GIT_HTTPS_CMD
  const gitFixHint = rootNpm ? tr('installGitSshDeniedRootHint') : tr('installGitSshDeniedHint')

  if (s.includes('permission denied (publickey)') || s.includes('host key verification failed')) {
    return { title: tr('installGitSshDeniedTitle'), hint: gitFixHint, command: gitFixCommand }
  }

  if (s.includes('code 128') || s.includes('exit 128')) {
    if (s.includes('permission denied') || s.includes('publickey') || s.includes('host key verification')) {
      return {
        title: tr('installGitSshDeniedTitle'),
        hint: rootNpm ? tr('installGitSshDeniedRetryRootHint') : tr('installGitSshDeniedRetryHint'),
        command: gitFixCommand,
      }
    }
    return {
      title: tr('installGitPullTitle'),
      hint: rootNpm ? tr('installGitPullRootHint') : tr('installGitPullHint'),
      command: gitFixCommand,
    }
  }

  if (s.includes('cannot find native binding') || s.includes('native binding')) {
    return {
      title: tr('installNativeBindingTitle'),
      hint: tr('installNativeBindingHint'),
      command: 'npm i -g @qingchencloud/openclaw-zh@latest --registry https://registry.npmmirror.com',
    }
  }

  if (s.includes('eperm') || s.includes('operation not permitted')) {
    return { title: tr('installEpermTitle'), hint: tr('installEpermHint'), command: NPM_CMD }
  }

  if (s.includes('eexist') || s.includes('file already exists') || s.includes('file exists')) {
    return {
      title: tr('installEexistTitle'),
      hint: tr('installEexistHint'),
      command: 'npm install -g @qingchencloud/openclaw-zh --force --registry https://registry.npmmirror.com',
    }
  }

  if (s.includes('enoent') || s.includes('-4058') || s.includes('code -4058')) {
    const pathMatch = raw.match(/enoent[^']*'([^']+)'/i) || raw.match(/path\s+'([^']+)'/i)
    const missingPath = pathMatch?.[1] || ''
    if (missingPath.includes('node_modules') || missingPath.includes('npm')) {
      return {
        title: tr('installNpmPrefixTitle'),
        hint: tr('installNpmPrefixHint', { path: missingPath }),
        command: 'npm config set prefix "%APPDATA%\\npm" && ' + NPM_CMD,
      }
    }
    return { title: tr('installEnoentTitle'), hint: tr('installEnoentHint'), command: NPM_CMD }
  }

  if (s.includes('eacces') || s.includes('permission denied')) {
    const isMac = navigator.platform?.includes('Mac') || navigator.userAgent?.includes('Mac')
    return {
      title: tr('installEaccesTitle'),
      hint: isMac ? tr('installEaccesMacHint') : tr('installEaccesWinHint'),
      command: isMac ? 'sudo ' + NPM_CMD : NPM_CMD,
    }
  }

  if (s.includes('module_not_found') || s.includes('cannot find module')) {
    return { title: tr('installModuleMissingTitle'), hint: tr('installModuleMissingHint'), command: 'npm cache clean --force && ' + NPM_CMD }
  }

  if (s.includes('etimedout') || s.includes('econnrefused') || s.includes('enotfound')
    || s.includes('fetch failed') || s.includes('socket hang up')
    || s.includes('econnreset') || s.includes('unable to get local issuer')) {
    const isProxy = s.includes('proxy') || s.includes('unable to get local issuer')
    return {
      title: tr('installNetworkTitle'),
      hint: isProxy ? tr('installProxyHint') : tr('installNetworkHint'),
      command: isProxy ? 'npm config set strict-ssl false && ' + NPM_CMD : NPM_CMD,
    }
  }

  if (s.includes('integrity') || s.includes('sha512') || s.includes('cache')) {
    return { title: tr('installCacheTitle'), hint: tr('installCacheHint'), command: 'npm cache clean --force && ' + NPM_CMD }
  }

  if (s.includes('engine') || s.includes('unsupported') || s.includes('required:')) {
    return { title: tr('installNodeVersionTitle'), hint: tr('installNodeVersionHint'), command: tr('installNodeDownloadCommand') }
  }

  if (s.includes('npm err') && (s.includes('cb() never called') || s.includes('code 1'))) {
    return { title: tr('installNpmErrorTitle'), hint: tr('installNpmErrorHint'), command: 'npm install -g npm@latest && ' + NPM_CMD }
  }

  if (s.includes('enospc') || s.includes('no space')) {
    return { title: tr('installDiskSpaceTitle'), hint: tr('installDiskSpaceHint') }
  }

  return { title: tr('installFailedTitle'), hint: tr('installFallbackHint'), command: NPM_CMD }
}
