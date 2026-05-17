/**
 * TVBox Framework Runtime - 前端 JS 层
 * 实现 TVBox 的核心接口，供 JS 解析器调用
 * 通过 Tauri Command 与 Rust 后端通信
 */

// ── 解析器链配置（TVBox 标准中间地址解析服务） ──────────────
const PARSER_URLS = [
  'https://vip.gaotian.top/api.php?url=$INPUT&type=auto&misc=0',
  'https://jx.86555.xyz/api.php?url=$INPUT',
  'https://api.bbbbbb.xyz/api.php?url=$INPUT',
];

// 等待 Tauri 就绪
const TAURI = window.__TAURI__;
let invoke;
if (TAURI && TAURI.core) {
  invoke = TAURI.core.invoke;
} else if (window.invoke) {
  invoke = window.invoke;
} else {
  console.warn('[TVBox] Tauri invoke not available, using fetch fallback');
}

const isTauri = !!invoke;

// ── req() 实现 ────────────────────────────────────────────────
let cookieStore = {};

async function req(options) {
  const {
    url,
    headers = {},
    body,
    method = 'GET',
    timeout = 30000,
    dataType = 'text',
  } = options;

  if (isTauri) {
    try {
      const result = await invoke('tvbox_req', {
        url,
        method,
        headers: JSON.stringify(headers),
        body: body || null,
        timeout: Math.floor(timeout / 1000),
      });

      // 更新 cookie store
      if (result.headers) {
        for (const [k, v] of Object.entries(result.headers)) {
          if (k.toLowerCase() === 'set-cookie') {
            parseSetCookie(v);
          }
        }
      }

      if (dataType === 'json') {
        return { code: result.code, content: JSON.parse(result.content), headers: result.headers };
      }
      return { code: result.code, content: result.content, headers: result.headers };
    } catch (e) {
      return { code: -1, content: e.toString(), headers: {} };
    }
  } else {
    // 非 Tauri 环境，使用 fetch
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      const resp = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);
      const text = await resp.text();
      if (dataType === 'json') {
        return { code: resp.status, content: JSON.parse(text), headers: {} };
      }
      return { code: resp.status, content: text, headers: {} };
    } catch (e) {
      return { code: -1, content: e.message, headers: {} };
    }
  }
}

function parseSetCookie(header) {
  if (!header) return;
  for (const part of header.split(',')) {
    const [pair] = part.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) {
      const k = pair.slice(0, eq).trim();
      const v = pair.slice(eq + 1).trim();
      if (k) cookieStore[k] = v;
    }
  }
}

// ── 加密模块 ─────────────────────────────────────────────────
const Crypto = {
  md5(input) {
    if (isTauri) {
      return invoke('tvbox_md5', { input });
    }
    return simpleMD5(input);
  },
  async aes_encrypt(plaintext, key, iv) {
    if (isTauri) return invoke('tvbox_aes_encrypt', { plaintext, key, iv });
    return simpleAESEncrypt(plaintext, key, iv);
  },
  async aes_decrypt(ciphertext, key, iv) {
    if (isTauri) return invoke('tvbox_aes_decrypt', { ciphertext, key, iv });
    return simpleAESDecrypt(ciphertext, key, iv);
  },
  base64_encode(input) {
    if (isTauri) return invoke('tvbox_base64_encode', { input });
    return btoa(unescape(encodeURIComponent(input)));
  },
  base64_decode(input) {
    if (isTauri) return invoke('tvbox_base64_decode', { input });
    return decodeURIComponent(escape(atob(input)));
  },
  async rsa(password, pubkey) {
    if (isTauri) return invoke('tvbox_rsa_encrypt', { plaintext: password, key: pubkey });
    return simpleRSAEncrypt(password, pubkey);
  },
};

// ── 本地存储 ─────────────────────────────────────────────────
const MY_STORE = {
  async get(key) {
    if (isTauri) {
      const val = await invoke('tvbox_store_get', { key });
      return val;
    }
    return localStorage.getItem('tvbox_' + key);
  },
  async set(key, value) {
    if (isTauri) {
      await invoke('tvbox_store_set', { key, value });
    } else {
      localStorage.setItem('tvbox_' + key, value);
    }
  },
  async del(key) {
    if (isTauri) {
      await invoke('tvbox_store_del', { key });
    } else {
      localStorage.removeItem('tvbox_' + key);
    }
  },
  async keys() {
    if (isTauri) return invoke('tvbox_store_keys');
    return Object.keys(localStorage).filter(k => k.startsWith('tvbox_')).map(k => k.slice(6));
  },
};

// ── Cookie ───────────────────────────────────────────────────
async function getCookie(domain) {
  if (isTauri) return invoke('tvbox_cookie_get', { domain });
  const cookies = Object.entries(cookieStore)
    .filter(([k]) => !domain || k.includes(domain))
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
  return cookies;
}

// ── 工具函数 ─────────────────────────────────────────────────
function log(info) {
  console.log('[TVBox]', info);
}

function abort() {
  return false;
}

// ── 简化实现（无 Tauri 时） ──────────────────────────────────
function simpleMD5(str) {
  // 简化版，真实项目用完整 MD5 库
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  return { code: 0, content: hex.repeat(8).slice(0, 32) };
}

// ── 视频解析 ─────────────────────────────────────────────────
// 主解析入口：遍历解析链，返回最终可播放地址
async function parseUrl(input, chains) {
  // chains: [{name, parse_url}, ...] 格式
  // 如果未传 chains，使用内置默认解析器
  if (!chains || chains.length === 0) {
    chains = PARSER_URLS.map((url, i) => ({ name: `parser${i}`, parse_url: url }));
  }

  let url = input;
  for (const chain of chains) {
    try {
      const result = await callParse(chain.name, url, chain.parse_url);
      if (result && result !== url && result.startsWith('http')) {
        url = result;
      }
    } catch (e) {
      // 单个解析器失败，继续下一个
    }
  }
  return url;
}

// 调用单个解析器（直接请求解析服务，返回解析后的最终地址）
async function callParse(name, url, parseUrl) {
  if (!parseUrl || !url) return url;

  // 替换占位符
  const api = parseUrl
    .replace(/\$INPUT/gi, encodeURIComponent(url))
    .replace(/\$UA/gi, encodeURIComponent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'));

  const result = await req({ url: api, dataType: 'text', timeout: 15000 });
  if (result.code === 200) {
    const txt = result.content.trim();
    // 尝试从 JSON 响应中提取 URL
    try {
      const json = JSON.parse(txt);
      return (json.url || json.data || json.result || txt).trim();
    } catch {
      return txt;
    }
  }
  return url;
}

// ── 导出全局接口 ─────────────────────────────────────────────
window.TVBox = {
  req,
  Crypto,
  MY_STORE,
  getCookie,
  log,
  abort,
  parseUrl,
  callParse,
  isTauri,
  invoke,
  PARSER_URLS,
  // 默认请求头
  header: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  },
};

console.log('[TVBox] Framework loaded, Tauri mode:', isTauri);
