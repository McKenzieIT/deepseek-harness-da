/** Zero-dependency server for the G15 current-client placement prototype. */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = Number(process.env.PORT ?? 4315)
const ROOT = fileURLToPath(new URL('.', import.meta.url))
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
}

createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store')
  try {
    const url = new URL(request.url ?? '/', 'http://localhost')
    const pathname = url.pathname === '/' ? '/index.html' : url.pathname
    const file = normalize(join(ROOT, pathname))
    if (!file.startsWith(ROOT)) throw new Error('outside prototype root')
    const body = await readFile(file)
    response.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
    response.end(body)
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('not found')
  }
}).listen(PORT, () => {
  console.log(`G15 prototype → http://localhost:${PORT}/`)
})
