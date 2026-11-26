/**
 * M4a safety check: the danger-verb confirmation gate must run before the
 * transport is touched, in bridge mode too.
 *
 * Starts an in-process fake bridge that advertises a node labelled "删除全部记录",
 * then asserts:
 *   - phone_tap({text:"删除"}) returns needs_confirmation and sends NO /tool/tap
 *   - phone_tap({x,y}) (no text) still forwards exactly one /tool/tap
 *
 * Run: node scripts/danger-check.mjs
 */
import http from 'node:http'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolsService from '@deepseek-ai/dsh-tools'
import * as NativeExecutor from '@deepseek-ai/dsh-tool-executor-native'
import * as hdcPhone from '../src/index.js'

const calls = []
const server = http.createServer((req, res) => {
  const chunks = []
  req.on('data', (chunk) => chunks.push(chunk))
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8')
    calls.push({ path: req.url, body })
    if (req.url === '/tool/observe') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        ok: true,
        data: { nodes: [{ i: 0, text: '删除全部记录', x: 100, y: 200, clickable: true }] },
      }))
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, data: {} }))
  })
})

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port
process.env.HDC_PHONE_BRIDGE = `127.0.0.1:${port}`

const ctx = new Context()
await ctx.plugin(SystemPrompt)
await ctx.plugin(ToolsService)
await ctx.plugin(NativeExecutor)
await ctx.plugin(hdcPhone, { hdcPath: 'hdc', device: '', timeoutMs: 30000, maxNodes: 20 })

const call = async (tool, args) => {
  const batch = await ctx.tools.execute({
    calls: [{ type: 'tool-call', id: `danger-${tool}`, name: `phone_${tool}`, arguments: JSON.stringify(args) }],
    signal: AbortSignal.timeout(30000),
  })
  return batch.results[0]?.result?.value
}

const guarded = await call('tap', { text: '删除' })
const tapCallsAfterGuard = calls.filter((entry) => entry.path === '/tool/tap').length
console.log('GUARDED=' + JSON.stringify(guarded))
console.log('TAP_REQUESTS_AFTER_GUARD=' + tapCallsAfterGuard)

const confirmed = await call('tap', { x: 100, y: 200 })
const tapCallsAfterConfirm = calls.filter((entry) => entry.path === '/tool/tap').length
console.log('CONFIRM_BY_POINT=' + JSON.stringify(confirmed))
console.log('TAP_REQUESTS_AFTER_POINT=' + tapCallsAfterConfirm)
console.log('OBSERVE_PATH_SEEN=' + calls.some((entry) => entry.path === '/tool/observe'))

const pass =
  guarded?.error === 'needs_confirmation' &&
  guarded?.needs_confirmation === true &&
  tapCallsAfterGuard === 0 &&
  confirmed?.ok === true &&
  tapCallsAfterConfirm === 1
console.log('DANGER_CHECK=' + (pass ? 'PASS' : 'FAIL'))

await ctx.fiber.dispose()
server.close()
process.exit(pass ? 0 : 1)
