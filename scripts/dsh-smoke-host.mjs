/**
 * Test-only profile plugin: on dsh boot, wait for hdc-phone to register, then
 * execute phone_observe through the real tool pipeline and print the canonical
 * value. Proves the plugin is loaded by the dsh CLI (not only by a standalone
 * Cordis script) and that a tool can reach the real device.
 *
 * Add to a profile patch:
 *   - id: hdc-smoke-host
 *     name: '<absolute path>/scripts/dsh-smoke-host.mjs'
 */
export const name = 'hdc-smoke-host'
export const inject = ['tools']

export function apply(ctx) {
  void (async () => {
    const deadline = Date.now() + 10000
    while (ctx.tools.get('phone_observe') === undefined && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    const loaded = ctx.tools.schemas().map((schema) => schema.name)
    const batch = await ctx.tools.execute({
      calls: [{
        type: 'tool-call',
        id: 'dsh-boot-smoke-1',
        name: 'phone_observe',
        arguments: JSON.stringify({ max: 8 }),
      }],
      signal: AbortSignal.timeout(30000),
    })
    const result = batch.results[0]?.result
    process.stdout.write('DSH_BOOT_SMOKE=' + JSON.stringify({
      loaded,
      isError: result?.isError,
      value: result?.value,
    }) + '\n')
    await new Promise((resolve) => setTimeout(resolve, 300))
    process.exit(0)
  })().catch((error) => {
    process.stderr.write('DSH_BOOT_SMOKE_FAILED=' + String(error?.stack ?? error) + '\n')
    process.exit(1)
  })
}
