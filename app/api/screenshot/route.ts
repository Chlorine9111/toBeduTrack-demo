import { lookup } from 'dns/promises'
import { NextRequest, NextResponse } from 'next/server'

type ScreenshotPage = {
  setViewport: (viewport: { width: number; height: number }) => Promise<void>
  goto: (
    url: string,
    options: { waitUntil: 'networkidle2'; timeout: number },
  ) => Promise<void>
  screenshot: (options: {
    fullPage: boolean
    type: 'png'
    encoding: 'binary'
  }) => Promise<Uint8Array | Buffer | string>
}

type ScreenshotBrowser = {
  newPage: () => Promise<ScreenshotPage>
  close: () => Promise<void>
}

type PuppeteerModule = {
  launch: (options: {
    headless: boolean
    args: string[]
  }) => Promise<ScreenshotBrowser>
}

async function loadPuppeteer(): Promise<PuppeteerModule> {
  try {
    const dynamicImport = new Function(
      'specifier',
      'return import(specifier)',
    ) as (specifier: string) => Promise<{ default?: PuppeteerModule } & PuppeteerModule>
    const mod = await dynamicImport('puppeteer')
    const candidate = mod.default ?? mod
    if (!candidate || typeof candidate.launch !== 'function') {
      throw new Error('puppeteer 模块缺少 launch 方法')
    }
    return candidate
  } catch {
    throw new Error(
      '截图服务缺少 puppeteer 运行依赖；当前环境可继续编译与启动，但该接口暂不可用。',
    )
  }
}

/** SSRF 防护：禁止访问的主机名 */
const BLOCKED_HOSTNAMES = new Set([
  '127.0.0.1',
  'localhost',
  '0.0.0.0',
  '::1',
  '[::1]',
  '169.254.169.254',        // AWS / GCP metadata
  '100.100.100.200',        // 阿里云 metadata
  'metadata.google.internal',
])

/** SSRF 防护：检测是否为 IPv4 私有地址 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.')
  if (parts.length !== 4) return false

  const octets = parts.map(Number)
  if (octets.some((o) => isNaN(o) || o < 0 || o > 255)) return false

  // 127.0.0.0/8 — 回环地址
  if (octets[0] === 127) return true

  // 0.0.0.0/8
  if (octets[0] === 0) return true

  // 10.0.0.0/8
  if (octets[0] === 10) return true

  // 172.16.0.0/12
  if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true

  // 192.168.0.0/16
  if (octets[0] === 192 && octets[1] === 168) return true

  // 169.254.0.0/16 — link-local
  if (octets[0] === 169 && octets[1] === 254) return true

  // 100.64.0.0/10 — Carrier-grade NAT（含阿里云 metadata 100.100.100.200）
  if (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127) return true

  return false
}

/** SSRF 防护：检测是否为 IPv6 私有/保留地址 */
function isPrivateIPv6(ip: string): boolean {
  // 去掉方括号（如 [::1]）
  const cleaned = ip.replace(/^\[|\]$/g, '')

  // 规范化：展开缩写，统一为小写
  const expanded = expandIPv6(cleaned)
  if (!expanded) return false

  // ::1 — 回环地址
  if (expanded === '0000:0000:0000:0000:0000:0000:0000:0001') return true

  // :: (全零) — 未指定地址
  if (expanded === '0000:0000:0000:0000:0000:0000:0000:0000') return true

  const firstGroup = parseInt(expanded.substring(0, 4), 16)

  // fc00::/7 — Unique Local Address (ULA)，等价于 IPv4 私有地址
  // fc00::/7 包含 fc00:: 到 fdff::
  if ((firstGroup & 0xfe00) === 0xfc00) return true

  // fe80::/10 — Link-Local 地址
  // fe80::/10 包含 fe80:: 到 febf::
  if ((firstGroup & 0xffc0) === 0xfe80) return true

  return false
}

/** 将 IPv6 地址展开为完整的 8 组 4 位十六进制形式 */
function expandIPv6(ip: string): string | null {
  // 去掉 zone ID（如 %eth0）
  const withoutZone = ip.split('%')[0]
  const lower = withoutZone.toLowerCase()

  // 处理 :: 缩写
  let groups: string[]

  if (lower.includes('::')) {
    const [left, right] = lower.split('::')
    const leftGroups = left ? left.split(':') : []
    const rightGroups = right ? right.split(':') : []
    const missingCount = 8 - leftGroups.length - rightGroups.length

    if (missingCount < 0) return null

    groups = [
      ...leftGroups,
      ...Array(missingCount).fill('0'),
      ...rightGroups,
    ]
  } else {
    groups = lower.split(':')
  }

  if (groups.length !== 8) return null

  const expanded = groups.map((g) => g.padStart(4, '0'))

  // 校验每一组是否为合法的十六进制
  if (expanded.some((g) => !/^[0-9a-f]{4}$/.test(g))) return null

  return expanded.join(':')
}

type ValidationResult =
  | { valid: true; url: URL }
  | { valid: false; status: number; error: string }

/** 验证 URL 是否安全可访问（含 DNS 解析校验，防止 DNS Rebinding） */
async function validateUrl(raw: string): Promise<ValidationResult> {
  // 1. 基础 URL 格式验证
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { valid: false, status: 400, error: 'URL 格式无效' }
  }

  // 2. 协议检查：仅允许 http/https
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { valid: false, status: 400, error: '仅允许 http 或 https 协议' }
  }

  const hostname = url.hostname

  // 3. hostname 黑名单检查
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { valid: false, status: 403, error: '禁止访问内部地址' }
  }

  // 对 hostname 本身做私有 IP 检测（用户可能直接传 IP 地址）
  if (isPrivateIPv4(hostname) || isPrivateIPv6(hostname)) {
    return { valid: false, status: 403, error: '禁止访问私有 IP 地址' }
  }

  // 4. DNS 解析 hostname → 获取真实 IP（防 DNS Rebinding）
  try {
    const { address, family } = await lookup(hostname)

    // 5. 对解析后的真实 IP 再次校验
    if (family === 4 && isPrivateIPv4(address)) {
      return { valid: false, status: 403, error: '禁止访问私有 IP 地址（DNS 解析后）' }
    }

    if (family === 6 && isPrivateIPv6(address)) {
      return { valid: false, status: 403, error: '禁止访问私有 IP 地址（DNS 解析后）' }
    }

    // 解析后的 IP 也要过黑名单
    if (BLOCKED_HOSTNAMES.has(address)) {
      return { valid: false, status: 403, error: '禁止访问内部地址（DNS 解析后）' }
    }
  } catch {
    return { valid: false, status: 400, error: 'DNS 解析失败，无法验证目标地址' }
  }

  return { valid: true, url }
}

export async function POST(request: NextRequest) {
  let body: { url?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { ok: false, error: '请求体必须为有效的 JSON' },
      { status: 400 },
    )
  }

  const { url } = body

  if (!url || typeof url !== 'string') {
    return NextResponse.json(
      { ok: false, error: '缺少必填字段 url' },
      { status: 400 },
    )
  }

  const validation = await validateUrl(url)
  if (!validation.valid) {
    return NextResponse.json(
      { ok: false, error: validation.error },
      { status: validation.status },
    )
  }

  let browser: ScreenshotBrowser | null = null

  try {
    const puppeteer = await loadPuppeteer()
    if (!puppeteer?.launch) {
      throw new Error('截图服务未启用：缺少 puppeteer 运行时依赖')
    }
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })

    const page = await browser.newPage()

    await page.setViewport({ width: 1440, height: 900 })

    await page.goto(validation.url.href, {
      waitUntil: 'networkidle2',
      timeout: 30_000,
    })

    const screenshotBuffer = await page.screenshot({
      fullPage: true,
      type: 'png',
      encoding: 'binary',
    })

    const base64 = Buffer.from(screenshotBuffer).toString('base64')

    // 使用 PNG 头部信息解析实际图片尺寸
    const buf = Buffer.from(screenshotBuffer)
    const width = buf.readUInt32BE(16)
    const height = buf.readUInt32BE(20)

    return NextResponse.json({ ok: true, image: base64, width, height })
  } catch (error) {
    const message = error instanceof Error ? error.message : '截图失败'
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    )
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}
