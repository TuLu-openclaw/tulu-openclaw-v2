/**
 * 微验卡密验证系统 - API封装
 * 文档参考: https://llua.cn/
 *
 * 加密流程:
 * 1. sign = MD5("kami={卡密}&markcode={设备码}&t={时间戳}&{appkey}")
 * 2. data = binToHex(RC4("kami={卡密}&markcode={设备码}&t={时间戳}&sign={sign}&value={随机值}", rc4key))
 * 3. POST data to wy.llua.cn/api/?id=kmlogon
 */

import { md5, rc4, hexToBin, binToHex } from './crypto-utils.js'

// 微验API配置
const WY_HOST = 'wy.llua.cn'
const APPID = '67696'
const APPKEY = 'sd47K5r8v7K0KsH0'
const RC4KEY = '5361bf9449f83bd06d29325ee99d2d45'
const SUCCESS_CODE = 2552667173

// localStorage keys
const KAMI_STORED_KEY = 'tulu_kami'
const KAMI_VERIFIED_KEY = 'tulu_kami_verified'
const KAMI_TIME_KEY = 'tulu_kami_time'
const KAMI_NOTICE_KEY = 'tulu_kami_notice'

/**
 * 检查字符串是否为有效 UTF-8（不含非打印/控制字符异常）
 * 用于判断解密结果是否可信
 */
function isValidUTF8Text(str) {
  if (!str || typeof str !== 'string' || str.length === 0) return false
  // 检查是否包含大量不可打印字符（控制字符但非换行/回退/制表）
  let badChars = 0
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i)
    // C0 控制字符（0x00-0x1F 除 \t\t\n\r 外）和 C1 控制字符（0x80-0x9F）
    if ((c <= 0x1F && c !== 0x09 && c !== 0x0A && c !== 0x0D) || (c >= 0x80 && c <= 0x9F)) {
      badChars++
    }
  }
  // 不可打印字符超过 5% 视为无效文本
  return badChars / str.length < 0.05
}

/**
 * 安全获取错误提示文本（防止乱码字节显示）
 */
function safeErrorText(str) {
  if (!str || typeof str !== 'string') return '未知错误'
  if (isValidUTF8Text(str)) return str
  return '验证失败，请检查网络后重试'
}

/**
 * 获取设备标识码
 * 优先使用Tauri API获取MAC地址，降级使用随机UUID（存储在localStorage）
 */
export async function getDeviceMarkcode() {
  try {
    const { api } = await import('./tauri-api.js')
    const info = await api.deviceInfo().catch(() => null)
    if (info?.macAddress) {
      const mac = info.macAddress.toUpperCase().replace(/:/g, '').replace(/-/g, '')
      if (mac && mac.length >= 12) return mac
    }
  } catch {}
  let deviceId = localStorage.getItem('tulu_device_id')
  if (!deviceId) {
    deviceId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
    localStorage.setItem('tulu_device_id', deviceId)
  }
  return 'WEB_' + deviceId
}

function generateRandomValue() {
  const arr = new Uint8Array(6)
  crypto.getRandomValues(arr)
  let val = 0
  for (let i = 0; i < 6; i++) val = val * 10 + (arr[i] % 10)
  return String(val).padStart(6, '0')
}

function getUnixTimestamp() {
  return Math.floor(Date.now() / 1000)
}

async function httpPost(host, path, body) {
  const formData = new URLSearchParams()
  for (const [k, v] of new URLSearchParams(body)) formData.append(k, v)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    const resp = await fetch(`https://${host}/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/4.0 (compatible; WeiyanVerify/1.0)',
      },
      body: formData.toString(),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    return await resp.text()
  } catch (err) {
    clearTimeout(timeout)
    throw err
  }
}

/**
 * 执行卡密登录
 * 错误提示始终使用 safeErrorText() 过滤乱码字节
 */
export async function login(kami) {
  try {
    const imei = await getDeviceMarkcode()
    const timestamp = getUnixTimestamp()
    const randomValue = generateRandomValue()

    _lastRandValue = randomValue

    // 计算签名: MD5("kami={卡密}&markcode={设备码}&t={时间戳}&{appkey}")
    const signStr = `kami=${kami}&markcode=${imei}&t=${timestamp}&${APPKEY}`
    const sign = md5(signStr)

    // 构造请求原文
    const reqPlain = `kami=${kami}&markcode=${imei}&t=${timestamp}&sign=${sign}&value=${randomValue}`

    // RC4 加密并转 hex
    const encrypted = binToHex(rc4(reqPlain, RC4KEY))

    const raw = await httpPost(WY_HOST, `api/?id=kmlogon`, `app=${APPID}&data=${encrypted}`)

    // 提取 hex body
    let bodyHex = raw.replace(/[^0-9a-fA-F]/g, '')

    if (bodyHex.length < 8 || bodyHex.length % 2 !== 0) {
      return { success: false, error: '服务器响应格式异常', code: -10 }
    }

    // RC4 解密
    let decrypted
    try {
      decrypted = rc4(hexToBin(bodyHex), RC4KEY)
    } catch (e) {
      return { success: false, error: safeErrorText(e.message), code: -1 }
    }

    // JSON 解析（先用 UTF-8 验证）
    let response
    try {
      if (!isValidUTF8Text(decrypted)) {
        throw new Error('decrypted invalid utf8')
      }
      response = JSON.parse(decrypted)
    } catch {
      return { success: false, error: '响应格式异常，请检查网络后重试', code: -1 }
    }

    // 检查返回码
    if (response.code !== SUCCESS_CODE) {
      return { success: false, code: response.code, error: safeErrorText(response.msg) }
    }

    // 安全校验
    const serverTime = response.time
    const timeDiff = Math.abs(serverTime - timestamp)
    if (timeDiff > 30) {
      return { success: false, error: '设备时间不准，请校准系统时间后重试', code: -2 }
    }

    if (response.check) {
      const checkStr = `${serverTime}${APPKEY}${randomValue}`
      const expectedCheck = md5(checkStr)
      if (response.check !== expectedCheck) {
        return { success: false, error: '校验失败，数据被篡改', code: -3 }
      }
    }

    return {
      success: true,
      time: serverTime,
      msg: response.msg,
      vip: response.msg?.ktype === 'code' ? response.msg.vip : null,
      num: response.msg?.ktype === 'num' ? response.msg.num : null,
    }
  } catch (err) {
    return { success: false, error: `网络请求失败: ${err.message}`, code: -1 }
  }
}

let _lastRandValue = ''

export async function revalidate(kami) {
  return login(kami)
}

export function getStoredKami() {
  return localStorage.getItem(KAMI_STORED_KEY) || null
}

export function saveKami(kami) {
  localStorage.setItem(KAMI_STORED_KEY, kami)
}

export function clearStoredKami() {
  localStorage.removeItem(KAMI_STORED_KEY)
  localStorage.removeItem(KAMI_VERIFIED_KEY)
  localStorage.removeItem(KAMI_TIME_KEY)
}

export function getLastVerifiedTime() {
  return parseInt(localStorage.getItem(KAMI_TIME_KEY) || '0', 10)
}

export function markVerified(kami, serverTime) {
  localStorage.setItem(KAMI_STORED_KEY, kami)
  localStorage.setItem(KAMI_VERIFIED_KEY, '1')
  localStorage.setItem(KAMI_TIME_KEY, String(serverTime || getUnixTimestamp()))
}

/**
 * 获取真实公告
 * 公告 API 返回 RC4 加密的 JSON，统一使用 textContent 渲染（浏览器自动处理所有实体编码）
 * 公告文本来自服务器，已是纯文本，不含 HTML 标签
 */
export async function getNotice() {
  try {
    const cached = localStorage.getItem(KAMI_NOTICE_KEY)
    if (cached) {
      try {
        const { text, ts } = JSON.parse(cached)
        if (Date.now() - ts < 60 * 60 * 1000) return text
      } catch {}
    }

    const formData = new URLSearchParams()
    formData.append('app', APPID)
    const resp = await fetch(`https://${WY_HOST}/api/?id=notice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/4.0 (compatible; WeiyanVerify/1.0)',
      },
      body: formData.toString(),
    })
    const raw = await resp.text()

    let bodyHex = raw.replace(/[^0-9a-fA-F]/g, '')
    if (bodyHex.length < 8 || bodyHex.length % 2 !== 0) return ''

    let decrypted
    try {
      decrypted = rc4(hexToBin(bodyHex), RC4KEY)
    } catch {
      return ''
    }
    if (!decrypted || decrypted.length < 2) return ''

    let json
    try {
      if (!isValidUTF8Text(decrypted)) return ''
      json = JSON.parse(decrypted)
    } catch {
      return ''
    }

    if (json.code !== 200 || !json.msg?.app_gg) return ''
    const text = json.msg.app_gg

    localStorage.setItem(KAMI_NOTICE_KEY, JSON.stringify({ text, ts: Date.now() }))
    return text
  } catch {
    return ''
  }
}

export const KAMI_CONFIG = {
  host: WY_HOST,
  appid: APPID,
  successCode: SUCCESS_CODE,
  checkIntervalMs: 5 * 60 * 1000,
  errorMessage: '屠戮尚未对该用户进行授权',
}
