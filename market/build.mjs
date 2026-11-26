// Build a private DSH plugin-market index plus a read-only npm-style registry
// for this package. Nothing is published anywhere: `market/public/` is served
// over plain http by `serve.mjs`, and the index entry points the install at
// that registry.
//
//   node market/build.mjs      # after changing the version or the metadata
//   node market/serve.mjs      # http://127.0.0.1:18792/dsh-index.json
//
// Requires `pnpm` for `pack`: set PNPM_CJS to the CLI script (run through node)
// or have `pnpm` on PATH. MARKET_URL sets the absolute origin baked into the
// index/tarball URLs (default http://127.0.0.1:18792/).
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgDir = path.resolve(here, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'))
const origin = (process.env.MARKET_URL || 'http://127.0.0.1:18792/').replace(/\/*$/, '/')
const publicDir = path.join(here, 'public')
const registryDir = path.join(publicDir, 'registry')
const tarballDir = path.join(registryDir, 'tarballs')
const tarballName = `${pkg.name}-${pkg.version}.tgz`
const tarballPath = path.join(tarballDir, tarballName)
const tarballUrl = `${origin}registry/${pkg.name}/-/${tarballName}`
const registryUrl = `${origin}registry/`

fs.rmSync(publicDir, { recursive: true, force: true })
fs.mkdirSync(tarballDir, { recursive: true })

const packOut = fs.mkdtempSync(path.join(pkgDir, '.market-pack-'))
const pnpmArgs = ['pack', '--pack-destination', packOut]
const pnpmCjs = process.env.PNPM_CJS
if (pnpmCjs) execFileSync(process.execPath, [pnpmCjs, ...pnpmArgs], { cwd: pkgDir, stdio: 'inherit' })
else execFileSync('pnpm', pnpmArgs, { cwd: pkgDir, stdio: 'inherit', shell: true })
const packed = fs.readdirSync(packOut).find((name) => name.endsWith('.tgz'))
if (!packed) throw new Error(`pnpm pack produced no tarball in ${packOut}`)
fs.copyFileSync(path.join(packOut, packed), tarballPath)
fs.rmSync(packOut, { recursive: true, force: true })

const bytes = fs.readFileSync(tarballPath)
const shasum = crypto.createHash('sha1').update(bytes).digest('hex')
const integrity = `sha512-${crypto.createHash('sha512').update(bytes).digest('base64')}`
const published = Math.floor(Date.now() / 1000)

const manifest = {
  name: pkg.name,
  version: pkg.version,
  description: pkg.description,
  type: pkg.type,
  main: pkg.main,
  exports: pkg.exports,
  files: pkg.files,
  keywords: pkg.keywords,
  license: pkg.license,
  engines: pkg.engines,
  peerDependencies: pkg.peerDependencies,
  peerDependenciesMeta: pkg.peerDependenciesMeta,
  dsh: pkg.dsh,
  dist: { tarball: tarballUrl, shasum, integrity },
}
const packument = {
  name: pkg.name,
  description: pkg.description,
  'dist-tags': { latest: pkg.version },
  versions: { [pkg.version]: manifest },
  time: {
    created: new Date(published * 1000).toISOString(),
    modified: new Date(published * 1000).toISOString(),
    [pkg.version]: new Date(published * 1000).toISOString(),
  },
}
fs.writeFileSync(path.join(registryDir, `${pkg.name}.json`), JSON.stringify(packument, null, 2) + '\n')

const index = {
  format: 1,
  title: { en: 'HdcDsh local plugins', zh: 'HdcDsh 本地插件' },
  description: {
    en: 'Plugins built inside this HdcDsh checkout, served from 127.0.0.1.',
    zh: '本仓库内构建、由 127.0.0.1 提供的插件。',
  },
  metadata: {
    categories: {
      tools: { title: { en: 'Tools', zh: '工具' } },
      remote: { title: { en: 'Remote control', zh: '远程控制' } },
      dev: { title: { en: 'Development', zh: '开发' } },
    },
    labels: {
      network: { title: { en: 'Network', zh: '网络' } },
      'host-runtime': { title: { en: 'Host runtime', zh: '宿主运行时' } },
    },
    sortKeys: { added: { title: { en: 'Added', zh: '加入时间' }, order: 'desc' } },
  },
  plugins: [
    {
      name: pkg.name,
      title: { en: 'HDC phone', zh: 'HDC 手机操控' },
      description: {
        en: 'Drive a second HarmonyOS phone through the on-device hdc bridge: observe, tap, swipe, key, input, launch. Needs the HdcDsh app bridge (hdc fport to reach it from a PC).',
        zh: '通过设备端 hdc 桥驱动第二台 HarmonyOS 手机：观察、点击、滑动、按键、输入、拉起应用。需要 HdcDsh App 的桥（从 PC 用 hdc fport 转发）。',
      },
      author: 'fengy',
      metadata: {
        category: 'remote',
        keywords: pkg.keywords,
        labels: ['network'],
        sortKeys: { added: published },
      },
      versions: [
        {
          version: pkg.version,
          publishTimestamp: published,
          source: { type: 'npm', registry: registryUrl },
          engines: { dsh: '>=0.2.1-alpha.1 <0.3.0-0' },
        },
      ],
    },
  ],
}
fs.writeFileSync(path.join(publicDir, 'dsh-index.json'), JSON.stringify(index, null, 2) + '\n')

console.log(`index      ${origin}dsh-index.json`)
console.log(`registry   ${registryUrl}`)
console.log(`packument  ${registryUrl}${pkg.name}`)
console.log(`tarball    ${tarballUrl}`)
console.log(`bytes      ${bytes.length}  sha1 ${shasum}  ${integrity.slice(0, 24)}…`)
