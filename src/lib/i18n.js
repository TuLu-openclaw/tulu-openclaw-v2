/**
 * i18n 国际化核心模块
 * 模块化多语言架构，支持 zh-CN / en / zh-TW / ja / ko
 */
import {
  buildLocaleModule,
  buildLocales,
  getRouteLocaleModules,
  loadLocaleModule,
} from '../locales/index.js'

const LANGS = buildLocales()
const LANG_KEY = '星枢OpenClaw_lang'
const FALLBACK = 'zh-CN'

let _lang = FALLBACK
let _dict = LANGS[FALLBACK]
let _listeners = []
const _registeredModules = new Set(Object.keys(LANGS[FALLBACK]))
const _registrationPromises = new Map()

/**
 * 翻译函数
 * @param {string} key - 点分隔路径，如 'sidebar.dashboard'
 * @param {object} [params] - 插值参数，如 { count: 3 } 替换 {count}
 * @returns {string}
 */
export function t(key, params) {
  let val = _resolve(_dict, key)
  if (val === undefined) {
    // fallback 到中文
    val = _resolve(LANGS[FALLBACK], key)
  }
  if (val === undefined) return key
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      val = val.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
    }
  }
  return val
}

function _resolve(obj, path) {
  const parts = path.split('.')
  let cur = obj
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = cur[p]
  }
  return typeof cur === 'string' ? cur : undefined
}

/** 获取当前语言 */
export function getLang() { return _lang }

/** 获取所有可用语言 */
export function getAvailableLangs() {
  return [
    { code: 'zh-CN', label: '简体中文' },
    { code: 'zh-TW', label: '繁體中文' },
    { code: 'en', label: 'English' },
    { code: 'ja', label: '日本語' },
    { code: 'ko', label: '한국어' },
    { code: 'vi', label: 'Tiếng Việt' },
    { code: 'es', label: 'Español' },
    { code: 'pt', label: 'Português' },
    { code: 'ru', label: 'Русский' },
    { code: 'fr', label: 'Français' },
    { code: 'de', label: 'Deutsch' },
  ]
}

/** 切换语言。所有已注册模块同时可用，无需重新加载。 */
export function setLang(lang) {
  if (!LANGS[lang]) return
  _lang = lang
  _dict = LANGS[lang]
  try { localStorage.setItem(LANG_KEY, lang) } catch {}
  _listeners.forEach(fn => { try { fn(lang) } catch {} })
}

/** 注册一个包含全部支持语言的功能模块。并发调用只加载和合并一次。 */
export function ensureLocaleModule(name) {
  if (_registeredModules.has(name)) return Promise.resolve()
  if (_registrationPromises.has(name)) return _registrationPromises.get(name)

  const registration = loadLocaleModule(name).then(entries => {
    for (const lang of Object.keys(LANGS)) {
      LANGS[lang][name] = buildLocaleModule(entries, lang)
    }
    _registeredModules.add(name)
  }).finally(() => {
    _registrationPromises.delete(name)
  })

  _registrationPromises.set(name, registration)
  return registration
}

/** 在页面渲染前注册该路由所需翻译，可与页面动态 import 并行执行。 */
export function ensureRouteLocale(routePath) {
  return Promise.all(getRouteLocaleModules(routePath).map(ensureLocaleModule)).then(() => undefined)
}

export function getLoadedLocaleModules() {
  return [..._registeredModules]
}

/** 监听语言变化 */
export function onLangChange(fn) {
  _listeners.push(fn)
  return () => { _listeners = _listeners.filter(cb => cb !== fn) }
}

/** 初始化：localStorage 优先；未保存时默认简体中文，仅对繁体中文做自动识别 */
export function initI18n() {
  let saved = null
  try { saved = localStorage.getItem(LANG_KEY) } catch {}
  if (saved && LANGS[saved]) {
    _lang = saved
    _dict = LANGS[saved]
    return
  }
  // 默认优先简体中文，避免因浏览器/系统语言为英文导致界面意外回退成英文
  const nav = navigator.language || navigator.languages?.[0] || ''
  if (nav === 'zh-TW' || nav === 'zh-HK') {
    _lang = 'zh-TW'
  } else {
    _lang = 'zh-CN'
  }
  _dict = LANGS[_lang] || LANGS[FALLBACK]
}
