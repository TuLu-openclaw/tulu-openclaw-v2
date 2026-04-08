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

/**
 * 获取设备标识码
 * 优先使用Tauri API获取MAC地址，降级使用随机UUID（存储在localStorage）
 */
export async function getDeviceMarkcode() {
  // 优先尝试从Tauri读取设备MAC
  try {
    const { api } = await import('./tauri-api.js')
    const info = await api.deviceInfo().catch(() => null)
    if (info?.macAddress) {
      const mac = info.macAddress.toUpperCase().replace(/:/g, '').replace(/-/g, '')
      if (mac && mac.length >= 12) {
        return mac
      }
    }
  } catch {}

  // 降级方案：使用存储的随机设备ID
  let deviceId = localStorage.getItem('tulu_device_id')
  if (!deviceId) {
    deviceId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
    localStorage.setItem('tulu_device_id', deviceId)
  }
  return 'WEB_' + deviceId
}

/**
 * 生成随机6位数字字符串
 */
function generateRandomValue() {
  const arr = new Uint8Array(6)
  crypto.getRandomValues(arr)
  let val = 0
  for (let i = 0; i < 6; i++) {
    val = val * 10 + (arr[i] % 10)
  }
  return String(val).padStart(6, '0')
}

/**
 * 获取当前Unix时间戳（秒）
 */
function getUnixTimestamp() {
  return Math.floor(Date.now() / 1000)
}

/**
 * 发送HTTP POST请求（纯浏览器fetch，无CORS限制）
 * 使用URLSearchParams格式
 */
async function httpPost(host, path, body) {
  const formData = new URLSearchParams()
  for (const [k, v] of new URLSearchParams(body)) {
    formData.append(k, v)
  }

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

    // resp.text() 也要限制，防止慢响应卡死
    const textPromise = resp.text()
    const timeout2 = setTimeout(() => controller.abort(), 10000)
    try {
      const text = await textPromise
      clearTimeout(timeout2)
      return text
    } catch {
      clearTimeout(timeout2)
      throw new Error('响应读取超时')
    }
  } catch (err) {
    clearTimeout(timeout)
    throw err
  }
}

/**
 * 解析HTTP响应体，提取JSON（处理chunked编码）
 */
function extractBody(httpResponse) {
  // 去掉HTTP头，找到第一个{的位置
  const bodyStart = httpResponse.indexOf('{')
  if (bodyStart === -1) return null
  const body = httpResponse.slice(bodyStart)
  try {
    return JSON.parse(body)
  } catch {
    return null
  }
}

/**
 * 执行卡密登录
 * 精确匹配 C++ Weiyan::Login 逻辑：
 * 1. sign = MD5("kami={kami}&markcode={imei}&t={timestamp}&{appkey}")
 * 2. data = binToHex(RC4("kami={kami}&markcode={imei}&t={timestamp}&sign={sign}&value={randomValue}"))
 * 3. POST -> RC4(hexToBin(body)) -> JSON
 * 4. 校验 code + 时间戳 ±30s + check 校验
 * @param {string} kami - 卡密
 * @returns {Promise<object>} 验证结果
 */
export async function login(kami) {
  try {
    const imei = await getDeviceMarkcode()
    const timestamp = getUnixTimestamp()
    const randomValue = generateRandomValue()

    // 保存 randValue，用于后续 check 校验
    _lastRandValue = randomValue

    // 计算签名: MD5("kami={卡密}&markcode={设备码}&t={时间戳}&{appkey}")
    const signStr = `kami=${kami}&markcode=${imei}&t=${timestamp}&${APPKEY}`
    const sign = md5(signStr)

    // 构造请求原文
    const reqPlain = `kami=${kami}&markcode=${imei}&t=${timestamp}&sign=${sign}&value=${randomValue}`

    // RC4 加密并转 hex
    const encrypted = binToHex(rc4(reqPlain, RC4KEY))

    // 发送 HTTP 请求
    const raw = await httpPost(WY_HOST, `api/?id=kmlogon`, `app=${APPID}&data=${encrypted}`)

    // C++ 逻辑：从 HTTP body（纯 hex 字符串）取 hexToBin -> RC4 -> JSON
    const bodyHex = raw.trim()
    const decrypted = rc4(hexToBin(bodyHex), RC4KEY)
    let response
    try {
      response = JSON.parse(decrypted)
    } catch {
      return { success: false, error: '响应解密失败，数据格式错误', code: -1 }
    }

    // 检查返回码
    if (response.code !== SUCCESS_CODE) {
      return { success: false, code: response.code, error: response.msg || '卡密验证失败' }
    }

    // === 安全校验（必须与 C++ 完全一致）===

    // 1. 时间戳校验：服务器时间与本地时间误差必须在 ±30 秒内
    const serverTime = response.time
    const timeDiff = Math.abs(serverTime - timestamp)
    if (timeDiff > 30) {
      return { success: false, error: '设备时间不准，请校准系统时间后重试', code: -2 }
    }

    // 2. check 校验: check = MD5(time + appkey + randValue)
    if (response.check) {
      const checkStr = `${serverTime}${APPKEY}${randomValue}`
      const expectedCheck = md5(checkStr)
      if (response.check !== expectedCheck) {
        return { success: false, error: '校验失败，数据被篡改', code: -3 }
      }
    }

    // 验证通过
    return {
      success: true,
      time: serverTime,
      msg: response.msg,
      // 额外信息（到期时间或剩余次数）
      vip: response.msg?.ktype === 'code' ? response.msg.vip : null,
      num: response.msg?.ktype === 'num' ? response.msg.num : null,
    }
  } catch (err) {
    return { success: false, error: `网络请求失败: ${err.message}`, code: -1 }
  }
}

// 内部：上次验证的 randValue（用于 check 校验）
let _lastRandValue = ''

/**
 * 验证已存储的卡密（用于5分钟自动重验）
 * @param {string} kami - 已验证通过的卡密
 * @returns {Promise<object>} 验证结果
 */
export async function revalidate(kami) {
  // 重验逻辑：直接重新登录检查
  return login(kami)
}

/**
 * 检查是否已记住卡密
 * @returns {string|null} 已存储的卡密或null
 */
export function getStoredKami() {
  return localStorage.getItem(KAMI_STORED_KEY) || null
}

/**
 * 保存卡密到本地存储
 * @param {string} kami - 要保存的卡密
 */
export function saveKami(kami) {
  localStorage.setItem(KAMI_STORED_KEY, kami)
}

/**
 * 清除已存储的卡密
 */
export function clearStoredKami() {
  localStorage.removeItem(KAMI_STORED_KEY)
  localStorage.removeItem(KAMI_VERIFIED_KEY)
  localStorage.removeItem(KAMI_TIME_KEY)
}

/**
 * 获取最近一次验证成功的时间戳
 */
export function getLastVerifiedTime() {
  return parseInt(localStorage.getItem(KAMI_TIME_KEY) || '0', 10)
}

/**
 * 标记卡密已验证通过
 * @param {string} kami - 验证通过的卡密
 * @param {number} serverTime - 服务器返回的时间戳
 */
export function markVerified(kami, serverTime) {
  localStorage.setItem(KAMI_STORED_KEY, kami)
  localStorage.setItem(KAMI_VERIFIED_KEY, '1')
  localStorage.setItem(KAMI_TIME_KEY, String(serverTime || getUnixTimestamp()))
}

// 导出配置常量供外部使用
export const KAMI_CONFIG = {
  host: WY_HOST,
  appid: APPID,
  successCode: SUCCESS_CODE,
  checkIntervalMs: 5 * 60 * 1000, // 5分钟
  errorMessage: '屠戮尚未对该用户进行授权',
}
