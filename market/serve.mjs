// Serve `market/public/` for the private plugin market: the format-1 index, the
// npm-style packument, and the packed tarball. Read-only, no dependencies.
//
//   node market/serve.mjs          # 127.0.0.1:18792
//   MARKET_PORT=18793 node market/serve.mjs
//
// Then add the index URL to the profile's plugin-market rows:
//
//   - id: plugin-market
//     config:
//       indexes:
//         - http://127.0.0.1:18792/dsh-index.json
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, 'public')
const host = process.env.MARKET_HOST || '127.0.0.1'
const port = Number(process.env.MARKET_PORT || 18792)

const TYPES = {
  '.json': 'application/json; charset=utf-8',
  '.tgz': 'application/octet-stream',
  '.md': 'text/markdown; charset=utf-8',
}

function send(res, status, body, type) {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'access-control-allow-origin': '*' })
  res.end(body)
}

function file(res, filePath, type) {
  let data
  try {
    data = fs.readFileSync(filePath)
  } catch {
    return send(res, 404, `not found: ${path.basename(filePath)}`, 'text/plain; charset=utf-8')
  }
  send(res, 200, data, type)
}

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0])
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'read-only', 'text/plain; charset=utf-8')
  console.log(`${req.method} ${url}`)

  if (url === '/' || url === '/index.json' || url === '/dsh-index.json') {
    return file(res, path.join(root, 'dsh-index.json'), TYPES['.json'])
  }
  // npm-style packument: /registry/<name>
  const packument = /^\/registry\/((?:@[^/]+\/)?[^/]+)\/?$/.exec(url)
  if (packument) return file(res, path.join(root, 'registry', `${packument[1]}.json`), TYPES['.json'])
  // tarball: /registry/<name>/-/<file>.tgz
  const tarball = /^\/registry\/(?:@[^/]+\/)?[^/]+\/-\/([^/]+)$/.exec(url)
  if (tarball) return file(res, path.join(root, 'registry', 'tarballs', tarball[1]), TYPES['.tgz'])

  send(res, 404, `not found: ${url}`, 'text/plain; charset=utf-8')
})

server.listen(port, host, () => {
  console.log(`market   http://${host}:${port}/dsh-index.json`)
  console.log(`registry http://${host}:${port}/registry/`)
})
