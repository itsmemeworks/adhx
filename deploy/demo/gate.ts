/**
 * The demo's front door: listens on PORT and passes reading requests to ADHX
 * on APP_PORT. Anything that could change something (a save, a reaction, a
 * sign-in, X sync) is refused here, before the app sees it, with the header
 * the page's demo bar listens for. Streams both ways, so video ranges and
 * live updates work as they do without it.
 */
import http from 'node:http'
import { DEMO_HEADER, DEMO_REFUSAL, demoRefuses } from '../../src/lib/demo/mode'

const port = Number(process.env['PORT'] || 8080)
const appPort = Number(process.env['APP_PORT'] || 3000)

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url ?? '/', 'http://demo').pathname
  if (demoRefuses(req.method ?? 'GET', pathname)) {
    req.resume()
    res.writeHead(403, { 'content-type': 'application/json', [DEMO_HEADER]: '1' })
    res.end(JSON.stringify({ error: DEMO_REFUSAL }))
    return
  }
  const upstream = http.request(
    { host: '127.0.0.1', port: appPort, method: req.method, path: req.url, headers: req.headers },
    (reply) => {
      res.writeHead(reply.statusCode ?? 502, reply.headers)
      reply.pipe(res)
    },
  )
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' })
    res.end('The demo is starting. Try again in a moment.')
  })
  res.on('close', () => upstream.destroy())
  req.pipe(upstream)
})

server.listen(port, '0.0.0.0', () => {
  console.warn(`[demo] gate on :${port} → ADHX on :${appPort} (reading only)`)
})
