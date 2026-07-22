const INTERNAL_COMMAND_FAILURE = /(?:exec|command|process)\s+failed|exited?\s+(?:with\s+)?(?:code|status)|exit\s*code/i
const SEARCH_COMMAND = /(?:^|[`'"\s|;&])(rg|grep|search|findstr|select-string)(?:[\s`'".]|$)/i

function errorText(error) {
  return typeof error === 'string' ? error : (error?.message || String(error || ''))
}

function exitCodeOf(value) {
  const match = value.match(/(?:exit(?:ed)?(?:\s+with)?(?:\s+code)?|status)\s*[:=]?\s*(-?\d+)/i)
  return match ? Number(match[1]) : null
}

export function diagnoseChatError(error) {
  const raw = errorText(error).trim()
  const lower = raw.toLowerCase()
  const exitCode = exitCodeOf(raw)

  if (/not recognized as|command not found|enoent|no such file or directory|找不到指定的文件/.test(lower)) {
    return {
      kind: 'command_missing',
      message: '执行任务所需的程序或文件不存在。请检查相关功能是否已安装完整，然后重试。',
    }
  }

  if (/permission denied|access is denied|eacces|eperm|拒绝访问|权限不足/.test(lower)) {
    return {
      kind: 'permission_denied',
      message: '任务因系统权限不足而失败。请检查目标文件或功能的访问权限后重试。',
    }
  }

  if (/insufficient|quota|credit|balance|余额|欠费|payment\s+required|\b429\b/.test(lower)) {
    return {
      kind: 'quota',
      message: '模型服务额度不足或触发了服务商限流。请充值、切换模型，或稍后重试。',
    }
  }

  if (/api.?key|unauthorized|forbidden|invalid key|认证|密钥|\b401\b|\b403\b/.test(lower)) {
    return {
      kind: 'authentication',
      message: '模型服务认证失败。请检查 API Key、服务地址和当前模型权限。',
    }
  }

  if (/timeout|timed out|etimedout|econnreset|network|fetch failed|连接|超时|网络/.test(lower)) {
    return {
      kind: 'network',
      message: '模型请求超时或网络连接中断。请检查网络和代理状态，然后重试。',
    }
  }

  if (INTERNAL_COMMAND_FAILURE.test(raw)) {
    if (SEARCH_COMMAND.test(raw) && exitCode === 1) {
      return {
        kind: 'internal_search_empty',
        message: '内部搜索没有找到匹配内容，当前任务未能继续。请确认目标内容或文件存在后重试。',
      }
    }
    return {
      kind: 'internal_command_failed',
      message: `内部任务执行失败${exitCode == null ? '' : `（错误代码 ${exitCode}）`}。详细信息已记录，请重试；若反复出现，请提交诊断日志。`,
    }
  }

  const exposesInternals = raw.length > 280
    || /```|\bat\s+\S+\s*\(|\$env:|%[a-z_][a-z0-9_]*%|[a-z]:[\\/]|\/users\/|\/home\//i.test(raw)
  if (exposesInternals) {
    return {
      kind: 'internal_details',
      message: '任务执行失败。详细诊断信息已记录，请重试；若反复出现，请提交诊断日志。',
    }
  }

  return { kind: 'plain', message: raw || '任务执行失败，请重试。' }
}
