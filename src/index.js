/**
 * dsh-plugin-hdc-phone (on-device bridge edition)
 *
 * Drives the TARGET phone (another device) through the local HTTP bridge that
 * the HdcBridge / DSH NEXT app runs (default 127.0.0.1:18790). The bridge owns
 * hdc; this plugin only validates arguments and formats results.
 *
 *   POST http://<host>:<port>/tool/<name>   {"ok":true,"data":{...}} | {"ok":false,"error":"..."}
 *
 * Bridge endpoint is configurable:
 *   1) env  DSH_HDC_PHONE_HOST / DSH_HDC_PHONE_PORT
 *   2) file <DSH_HOME|HOME>/.dsh-hdc-phone.json  {"host":"127.0.0.1","port":18791,"timeoutMs":30000}
 *   3) tool call phone_bridge {port: 18791}
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const name = 'hdc-phone'
export const inject = ['tools']

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 18790
const DEFAULT_TIMEOUT_MS = 30000
const CONFIG_FILE = '.dsh-hdc-phone.json'

const DANGER = /(\u5220\u9664|\u652f\u4ed8|\u8f6c\u8d26|\u5378\u8f7d|\u6e05\u7a7a|\u9000\u51fa\u767b\u5f55)/

const output = {
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      ok: { type: 'boolean' },
      text: { type: 'string' },
      data: { type: 'json' },
      error: { type: 'string' },
      needs_confirmation: { type: 'boolean' },
      hit: { type: 'string' },
    },
  },
  render: (_args, value) => [{ type: 'text', text: value.text ?? (value.ok ? 'ok' : (value.error ?? 'error')) }],
}

function configPath() {
  const home = process.env.DSH_HOME || process.env.HOME || os.homedir()
  return path.join(home, CONFIG_FILE)
}

function readConfig() {
  const cfg = { host: DEFAULT_HOST, port: DEFAULT_PORT, timeoutMs: DEFAULT_TIMEOUT_MS }
  try {
    const file = configPath()
    if (fs.existsSync(file)) {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (typeof raw.host === 'string' && raw.host.length > 0) cfg.host = raw.host
      if (Number.isInteger(raw.port) && raw.port > 0 && raw.port < 65536) cfg.port = raw.port
      if (Number.isInteger(raw.timeoutMs) && raw.timeoutMs > 0) cfg.timeoutMs = raw.timeoutMs
    }
  } catch {
  }
  const envHost = process.env.DSH_HDC_PHONE_HOST
  const envPort = process.env.DSH_HDC_PHONE_PORT
  if (typeof envHost === 'string' && envHost.length > 0) cfg.host = envHost
  if (typeof envPort === 'string' && envPort.length > 0) {
    const port = Number(envPort)
    if (Number.isInteger(port) && port > 0 && port < 65536) cfg.port = port
  }
  return cfg
}

function writeConfig(patch) {
  const cfg = readConfig()
  if (typeof patch.host === 'string' && patch.host.trim().length > 0) cfg.host = patch.host.trim()
  if (Number.isInteger(patch.port) && patch.port > 0 && patch.port < 65536) cfg.port = patch.port
  if (Number.isInteger(patch.timeoutMs) && patch.timeoutMs > 0) cfg.timeoutMs = patch.timeoutMs
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2), { encoding: 'utf8', mode: 0o600 })
  return cfg
}

function endpointOf(cfg) {
  return 'http://' + cfg.host + ':' + String(cfg.port)
}

function callTool(tool, body) {
  return new Promise((resolve, reject) => {
    const cfg = readConfig()
    const payload = Buffer.from(JSON.stringify(body ?? {}), 'utf8')
    const req = http.request({
      host: cfg.host,
      port: cfg.port,
      method: 'POST',
      path: '/tool/' + tool,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': payload.length,
      },
      timeout: cfg.timeoutMs,
    }, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8')
        try {
          resolve(JSON.parse(raw))
        } catch (error) {
          reject(new Error('bridge returned non-JSON: ' + raw.slice(0, 200)))
        }
      })
    })
    req.on('timeout', () => {
      req.destroy(new Error('bridge timeout at ' + endpointOf(cfg)))
    })
    req.on('error', (error) => reject(new Error('bridge unreachable at ' + endpointOf(cfg) + ': ' + String(error && error.message || error))))
    req.write(payload)
    req.end()
  })
}

function toText(data) {
  if (data === undefined || data === null) return ''
  if (typeof data === 'string') return data
  return JSON.stringify(data)
}

async function runTool(tool, body) {
  try {
    const json = await callTool(tool, body)
    if (json.ok !== true) {
      return { ok: false, error: String(json.error ?? 'bridge_error'), text: 'ERROR: ' + String(json.error ?? 'bridge_error') }
    }
    const data = json.data ?? {}
    return { ok: true, data, text: toText(data) }
  } catch (error) {
    const message = String(error && error.message || error)
    return { ok: false, error: message, text: 'ERROR: ' + message }
  }
}

export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: 'phone_bridge',
    description:
      'USED FOR: reading or changing the local hdc bridge endpoint used by the phone_* tools. ' +
      'Call with no arguments to show the current endpoint; pass port/host/timeoutMs to persist a new endpoint ' +
      '(the HdcBridge app must listen on the same port).',
    parameters: {
      host: { type: 'string', description: 'bridge host (default 127.0.0.1)' },
      port: { type: 'number', description: 'bridge port (default 18790)' },
      timeoutMs: { type: 'number', description: 'request timeout in ms (default 30000)' },
    },
    output,
    async execute(args) {
      const hasPatch = typeof args.host === 'string' || typeof args.port === 'number' || typeof args.timeoutMs === 'number'
      if (!hasPatch) {
        const cfg = readConfig()
        return { ok: true, data: cfg, text: 'endpoint=' + endpointOf(cfg) + ' timeoutMs=' + String(cfg.timeoutMs) }
      }
      try {
        const cfg = writeConfig({
          host: args.host,
          port: args.port,
          timeoutMs: args.timeoutMs,
        })
        return { ok: true, data: cfg, text: 'saved endpoint=' + endpointOf(cfg) + ' timeoutMs=' + String(cfg.timeoutMs) }
      } catch (error) {
        const message = String(error && error.message || error)
        return { ok: false, error: message, text: 'ERROR: ' + message }
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'phone_observe',
    description:
      'USED FOR: reading the TARGET phone screen (hdc + uitest dumpLayout) - not this phone. ' +
      'Returns visible nodes with text and center coordinates; call it before any tap/input.',
    parameters: {
      max: { type: 'number', description: 'max nodes to return (default 60, max 300)' },
    },
    output,
      async execute(args) {
        const max = typeof args.max === 'number' ? Math.max(1, Math.min(300, Math.floor(args.max))) : 60
        const res = await runTool('observe', { max })
        if (!res.ok && String(res.error) === 'target_unreachable') {
          res.text = 'ERROR: target_unreachable - the configured target phone is offline or its wireless-debug address changed. ' +
            'Tell the user to enable wireless debugging on the target phone and update the address (host auto-rediscovers it every 60s when the target is reachable).'
        } else if (!res.ok && String(res.error) === 'dump_empty') {
          res.text = 'ERROR: dump_empty - target screen may be OFF or LOCKED, or the hdc session went stale. ' +
            'Ask the user to wake and unlock the target phone, then retry (host auto-reconnects hdc within 60s).'
        }
        return res
      },
  }))

  ctx.tools.register(defineTool({
    name: 'phone_tap',
    description:
      'USED FOR: tapping the TARGET phone. Give text to fuzzy-match a node and tap its center, ' +
      'or x/y for absolute coordinates. Dangerous actions (delete/pay/uninstall) return ' +
      'needs_confirmation first; resend with confirm:true after the user agrees.',
    parameters: {
      text: { type: 'string', description: 'node text (fuzzy match)' },
      x: { type: 'number', description: 'absolute X (with y)' },
      y: { type: 'number', description: 'absolute Y (with x)' },
      confirm: { type: 'boolean', description: 'user confirmed a dangerous action' },
    },
    output,
    async execute(args) {
      const text = typeof args.text === 'string' ? args.text.trim() : ''
      const hasPoint = typeof args.x === 'number' && typeof args.y === 'number'
      if (text === '' && !hasPoint) return { ok: false, error: 'need text or x/y' }
      if (text !== '' && !args.confirm && DANGER.test(text)) {
        return {
          ok: false,
          needs_confirmation: true,
          hit: text,
          error: 'needs_confirmation',
          text: 'dangerous action - resend with confirm:true after the user agrees',
        }
      }
      const body = {}
      if (text !== '') body.text = text
      if (hasPoint) { body.x = args.x; body.y = args.y }
      if (args.confirm === true) body.confirm = true
      return runTool('tap', body)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'phone_swipe',
    description: 'USED FOR: swiping the TARGET phone screen (up/down/left/right). No auto-retry.',
    parameters: {
      dir: { type: 'string', required: true, enum: ['up', 'down', 'left', 'right'], description: 'direction' },
    },
    output,
    async execute(args) {
      return runTool('swipe', { dir: String(args.dir ?? '') })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'phone_key',
    description: 'USED FOR: sending a system key (Back / Home) to the TARGET phone.',
    parameters: {
      key: { type: 'string', required: true, enum: ['Back', 'Home'], description: 'key name' },
    },
    output,
    async execute(args) {
      return runTool('key', { key: String(args.key ?? '') })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'phone_input',
    description:
      'USED FOR: typing text into the focused field on the TARGET phone. ' +
      'If nothing is focused, tap the input box first with phone_tap.',
    parameters: {
      text: { type: 'string', required: true, description: 'text to type' },
    },
    output,
    async execute(args) {
      const text = typeof args.text === 'string' ? args.text : ''
      if (text === '') return { ok: false, error: 'text is required' }
      return runTool('input', { text })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'phone_launch',
    description: 'USED FOR: launching an app on the TARGET phone via aa start (bundle + ability).',
    parameters: {
      bundle: { type: 'string', required: true, description: 'bundle name, e.g. com.example.app' },
      ability: { type: 'string', required: true, description: 'ability name, e.g. EntryAbility' },
    },
    output,
    async execute(args) {
      return runTool('launch', { bundle: String(args.bundle ?? ''), ability: String(args.ability ?? '') })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'phone_health',
    description: 'Checks whether the target phone is connected through the hdc bridge.',
    parameters: {},
    output,
    async execute() {
      return runTool('health', {})
    },
  }))
}
