/**
 * M4a transport check: run phone_observe / phone_tap / phone_swipe through the
 * real dsh tool pipeline with whichever transport is selected by the
 * environment (no model / no API key).
 *
 *   hdc-cli mode:
 *     $env:HDC_PATH='...\hdc.exe'; $env:HDC_TARGET='192.168.200.42:8710'
 *     node scripts/transport-check.mjs
 *
 *   bridge mode:
 *     $env:HDC_PHONE_BRIDGE='127.0.0.1:18790'
 *     node scripts/transport-check.mjs
 *
 * `HDC_TAP_TEXT` may pin the tap target; otherwise the first clickable node
 * from phone_observe that is not a danger verb is used (danger verbs would be
 * blocked by the confirmation gate anyway).
 */
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolsService from '@deepseek-ai/dsh-tools'
import * as NativeExecutor from '@deepseek-ai/dsh-tool-executor-native'
import * as hdcPhone from '../src/index.js'

const ctx = new Context()
ctx.logger.level = 'info'

await ctx.plugin(SystemPrompt)
await ctx.plugin(ToolsService)
await ctx.plugin(NativeExecutor)
await ctx.plugin(hdcPhone, {
  hdcPath: process.env.HDC_PATH || 'hdc',
  device: process.env.HDC_TARGET || '',
  timeoutMs: 30000,
  maxNodes: 20,
})

console.log('TRANSPORT=' + (process.env.HDC_PHONE_BRIDGE || 'hdc-cli'))
console.log('LOADED_TOOLS=' + ctx.tools.schemas().map((schema) => schema.name).join(','))

const call = async (tool, args) => {
  const batch = await ctx.tools.execute({
    calls: [{ type: 'tool-call', id: `m4a-${tool}-${Date.now()}`, name: `phone_${tool}`, arguments: JSON.stringify(args) }],
    signal: AbortSignal.timeout(30000),
  })
  const result = batch.results[0]?.result
  console.log(`TOOL[${tool}] args=${JSON.stringify(args)} isError=${result?.isError} value=${JSON.stringify(result?.value)}`)
  return result?.value
}

const observed = await call('observe', { max: 12 })

let tapText = process.env.HDC_TAP_TEXT
if (!tapText && Array.isArray(observed?.data?.nodes)) {
  const candidate = observed.data.nodes.find(
    (node) => node.clickable === true && node.text && !hdcPhone.isDangerous(node.text),
  )
  tapText = candidate?.text
}
if (tapText) {
  await call('tap', { text: tapText })
} else {
  console.log('TOOL[tap] skipped: no safe clickable node found (set HDC_TAP_TEXT to force one)')
}

await call('swipe', { dir: 'up' })

await ctx.fiber.dispose()
