/**
 * M1 verification of the full tool set through the real dsh pipeline.
 * Uses only read-only or light operations (observe/tap/swipe/key) plus
 * deliberately invalid arguments for the remaining tools, so no destructive
 * action is triggered.
 *
 * Run:
 *   set HDC_PATH=...\hdc.exe
 *   set HDC_TARGET=192.168.200.42:8710
 *   node scripts/tool-sequence.mjs
 */
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolsService from '@deepseek-ai/dsh-tools'
import * as NativeExecutor from '@deepseek-ai/dsh-tool-executor-native'
import * as hdcPhone from '../src/index.js'

const ctx = new Context()
await ctx.plugin(SystemPrompt)
await ctx.plugin(ToolsService)
await ctx.plugin(NativeExecutor)
await ctx.plugin(hdcPhone, {
  hdcPath: process.env.HDC_PATH || 'hdc',
  device: process.env.HDC_TARGET || '',
  timeoutMs: 30000,
  maxNodes: 20,
})

const cases = [
  ['observe', { max: 10 }],
  ['tap', { text: '推荐' }],
  ['swipe', { dir: 'up' }],
  ['key', { key: 'Back' }],
  ['key', { key: 'Home' }],
  ['tap', { text: '一定不存在的文本xyz' }],
  ['input', { text: '' }],
  ['launch', { bundle: 'bad bundle!', ability: 'EntryAbility' }],
  ['swipe', { dir: 'sideways' }],
  ['key', { key: 'Power' }],
]

for (const [tool, args] of cases) {
  const batch = await ctx.tools.execute({
    calls: [{
      type: 'tool-call',
      id: `seq-${tool}`,
      name: `phone_${tool}`,
      arguments: JSON.stringify(args),
    }],
    signal: AbortSignal.timeout(30000),
  })
  const result = batch.results[0]?.result
  console.log(`${tool}(${JSON.stringify(args)}) -> isError=${result?.isError} ${JSON.stringify(result?.value)}`)
}

await ctx.fiber.dispose()
