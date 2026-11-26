/**
 * M1 smoke test: mount the real dsh tool pipeline (Cordis + dsh-tools +
 * native executor) with the hdc-phone plugin and execute one tool against a
 * real device. No model/API key is involved.
 *
 * Run:
 *   set HDC_PATH=...\hdc.exe
 *   set HDC_TARGET=192.168.200.42:8710
 *   node scripts/smoke.mjs
 */
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolsService from '@deepseek-ai/dsh-tools'
import * as NativeExecutor from '@deepseek-ai/dsh-tool-executor-native'
import * as hdcPhone from '../src/index.js'

const hdcPath = process.env.HDC_PATH || 'hdc'
const device = process.env.HDC_TARGET || ''
const ctx = new Context()
ctx.logger.level = 'info'

await ctx.plugin(SystemPrompt)
await ctx.plugin(ToolsService)
await ctx.plugin(NativeExecutor)
await ctx.plugin(hdcPhone, { hdcPath, device, timeoutMs: 30000, maxNodes: 20 })

const schemas = ctx.tools.schemas()
console.log('LOADED_TOOLS=' + schemas.map((schema) => schema.name).join(','))
console.log('DANGER_RULE=' + JSON.stringify({
  '退出登录': hdcPhone.isDangerous('退出登录'),
  '支付': hdcPhone.isDangerous('确认支付'),
  '直播': hdcPhone.isDangerous('直播'),
}))

const batch = await ctx.tools.execute({
  calls: [{
    type: 'tool-call',
    id: 'smoke-observe-1',
    name: 'phone_observe',
    arguments: JSON.stringify({ max: 20 }),
  }],
  signal: AbortSignal.timeout(30000),
})

const first = batch.results[0]
console.log('IS_ERROR=' + first?.result?.isError)
console.log('CANONICAL_VALUE=' + JSON.stringify(first?.result?.value))
console.log('MODEL_CONTENT=' + JSON.stringify(first?.result?.content))

await ctx.fiber.dispose()
