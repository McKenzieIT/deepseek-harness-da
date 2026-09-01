/**
 * PROTOTYPE (throwaway) — G2 DAG panel placement prototype server.
 * Zero-dependency static server: serves this directory plus the repo's own
 * @antv/g6 UMD bundle so the page needs no CDN and no build step.
 *
 * Run:  node server.mjs     →  http://localhost:4310/?variant=A
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = Number(process.env.PORT ?? 4310)
const ROOT = fileURLToPath(new URL('.', import.meta.url))
const G6_DIST = fileURLToPath(new URL(
  '../../../packages/client/ui-context-layer/node_modules/@antv/g6/dist/g6.min.js',
  import.meta.url,
))

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.md': 'text/markdown; charset=utf-8',
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname === '/vendor/g6.min.js') {
      res.writeHead(200, { 'content-type': MIME['.js'] })
      res.end(await readFile(G6_DIST))
      return
    }
    let path = url.pathname === '/' ? '/index.html' : url.pathname
    const file = normalize(join(ROOT, path))
    if (!file.startsWith(ROOT)) throw new Error('outside prototype root')
    const body = await readFile(file)
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('not found')
  }
}).listen(PORT, () => {
  console.log(`G2 prototype → http://localhost:${PORT}/?variant=A`)
})
