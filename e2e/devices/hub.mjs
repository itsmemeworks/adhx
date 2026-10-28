#!/usr/bin/env node
/**
 * The device hub: the iPhone's DeviceDriver UI test polls it for commands and
 * posts results back; `drive.mjs ios …` hands it one command at a time and
 * waits for the answer. Plain Node, no dependencies.
 *
 *   node e2e/devices/hub.mjs            # listens on port 3700, IPv4 and IPv6
 *
 * The phone reaches it over the LAN, so commands are accepted only from this
 * Mac (loopback); the phone can only fetch them and answer.
 */
import http from 'node:http'

const PORT = Number(process.env.DEVICE_HUB_PORT || 3700)
const queue = []
const waiting = new Map() // command cid → resolve(result)
let poller = null // the phone's pending GET /next
let device = null
let lastSeen = 0
let seq = 0

const json = (res, status, body) => {
  if (res.headersSent || res.writableEnded) return
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(body === undefined ? '' : JSON.stringify(body))
}

const readBody = (req) =>
  new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk) => (data += chunk))
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {})
      } catch {
        resolve({})
      }
    })
  })

const loopback = (req) =>
  ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)

function hand() {
  if (!poller || queue.length === 0) return
  const { res, timer } = poller
  poller = null
  clearTimeout(timer)
  json(res, 200, queue.shift())
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://hub')
  if (req.method === 'GET' && url.pathname === '/next') {
    lastSeen = Date.now()
    if (poller) {
      clearTimeout(poller.timer)
      json(poller.res, 204)
    }
    const timer = setTimeout(() => {
      if (poller?.res === res) poller = null
      json(res, 204)
    }, 25_000)
    poller = { res, timer }
    hand()
    return
  }
  if (req.method === 'POST' && url.pathname === '/hello') {
    device = await readBody(req)
    lastSeen = Date.now()
    console.log(`[hub] driver connected: ${device.device} (iOS ${device.system})`)
    return json(res, 200, { ok: true })
  }
  if (req.method === 'POST' && url.pathname === '/result') {
    const body = await readBody(req)
    lastSeen = Date.now()
    // Only answers to a command still waiting here resolve anything.
    const done =
      typeof body.cid === 'string' && waiting.has(body.cid) ? waiting.get(body.cid) : null
    if (typeof done === 'function') {
      waiting.delete(body.cid)
      done(body)
    }
    return json(res, 200, { ok: true })
  }
  if (req.method === 'GET' && url.pathname === '/status') {
    return json(res, 200, {
      device,
      connected: Date.now() - lastSeen < 45_000,
      queued: queue.length,
    })
  }
  if (req.method === 'POST' && url.pathname === '/cmd') {
    if (!loopback(req)) return json(res, 403, { ok: false, error: 'commands only from this Mac' })
    const command = { ...(await readBody(req)), cid: `c${++seq}` }
    const timeoutMs = Number(command.hubTimeout || 120) * 1000
    const result = await new Promise((resolve) => {
      const timer = setTimeout(() => {
        waiting.delete(command.cid)
        // Never run a command its caller gave up on (a stale quit would end the driver).
        const at = queue.findIndex((c) => c.cid === command.cid)
        if (at !== -1) queue.splice(at, 1)
        resolve({ ok: false, error: `no answer from the phone in ${timeoutMs / 1000}s` })
      }, timeoutMs)
      waiting.set(command.cid, (r) => {
        clearTimeout(timer)
        resolve(r)
      })
      queue.push(command)
      hand()
    })
    return json(res, 200, result)
  }
  json(res, 404, { ok: false, error: 'not found' })
})

// '::' takes IPv4 too: the LAN, and the USB tunnel Xcode keeps to a wired iPhone.
server.listen(PORT, '::', () => console.log(`[hub] listening on :${PORT}`))
