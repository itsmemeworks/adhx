#!/usr/bin/env node
/**
 * Drive a real phone, one step at a time:
 *
 *   node e2e/devices/drive.mjs ios elements
 *   node e2e/devices/drive.mjs ios tap label=Home
 *   node e2e/devices/drive.mjs android tap text="Sign in with email"
 *   node e2e/devices/drive.mjs android shot
 *
 * `ios` sends the command to the device hub (hub.mjs), which the iPhone's
 * DeviceDriver UI test runs; `android` runs it over adb. Arguments are
 * key=value (numbers and true/false are parsed; JSON for lists). Screenshots
 * land in e2e/devices/.out/. The commands are listed in README.md.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(HERE, '.out')
const HUB = `http://127.0.0.1:${process.env.DEVICE_HUB_PORT || 3700}`
const PACKAGE = process.env.ADHX_ANDROID_PACKAGE || 'com.adhx.share'
const ADB =
  process.env.ADB ||
  [path.join(os.homedir(), 'Library/Android/sdk/platform-tools/adb'), 'adb'].find(
    (p) => p === 'adb' || fs.existsSync(p),
  )

function parseArgs(list) {
  const out = {}
  for (const arg of list) {
    const at = arg.indexOf('=')
    if (at === -1) {
      out[arg] = true
      continue
    }
    const key = arg.slice(0, at)
    const raw = arg.slice(at + 1)
    let value = raw
    if (/^-?\d+(\.\d+)?$/.test(raw)) value = Number(raw)
    else if (raw === 'true' || raw === 'false') value = raw === 'true'
    else if (/^[[{]/.test(raw)) {
      try {
        value = JSON.parse(raw)
      } catch {
        value = raw
      }
    }
    out[key] = value
  }
  return out
}

function stamp(prefix) {
  fs.mkdirSync(OUT, { recursive: true })
  return path.join(OUT, `${prefix}-${new Date().toISOString().replace(/[:.]/g, '-')}.png`)
}

// ——— iPhone (through the hub) ———

async function ios(op, args) {
  const res = await fetch(`${HUB}/cmd`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op, ...args }),
  }).catch((error) => {
    throw new Error(`hub not reachable at ${HUB} (${error.message}); start e2e/devices/hub.mjs`)
  })
  const result = await res.json()
  if (!result.ok) {
    console.error(`✗ ${result.error}`)
    process.exit(1)
  }
  if (op === 'shot') {
    const file = args.out || stamp('ios')
    fs.writeFileSync(file, Buffer.from(result.png, 'base64'))
    console.log(file)
  } else if (op === 'elements') {
    for (const e of result.elements) {
      const [x, y, w, h] = e.frame
      const extra = [
        e.id && `#${e.id}`,
        e.value && `= ${e.value}`,
        e.disabled && 'disabled',
        e.selected && 'selected',
      ]
        .filter(Boolean)
        .join(' ')
      console.log(
        `${e.type.padEnd(12)} ${JSON.stringify(e.label ?? '')} ${extra} @${x + Math.round(w / 2)},${y + Math.round(h / 2)} [${w}x${h}]`,
      )
    }
  } else if (op === 'tree') {
    console.log(result.tree)
  } else {
    const { ok: _ok, cid: _cid, ...rest } = result
    console.log(Object.keys(rest).length ? JSON.stringify(rest) : '✓')
  }
}

// ——— Android (adb) ———

function adb(...argv) {
  const serial = process.env.ANDROID_SERIAL ? ['-s', process.env.ANDROID_SERIAL] : []
  return execFileSync(ADB, [...serial, ...argv], { encoding: 'utf8', maxBuffer: 64 << 20 })
}

function adbRaw(...argv) {
  const serial = process.env.ANDROID_SERIAL ? ['-s', process.env.ANDROID_SERIAL] : []
  const r = spawnSync(ADB, [...serial, ...argv], { maxBuffer: 64 << 20 })
  if (r.status !== 0) throw new Error(r.stderr.toString())
  return r.stdout
}

const decode = (s) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

function nodes() {
  let xml = ''
  for (let attempt = 0; attempt < 3 && !xml.includes('<hierarchy'); attempt++) {
    try {
      xml = adb('exec-out', 'uiautomator', 'dump', '--compressed', '/dev/tty')
    } catch {
      xml = ''
    }
  }
  if (!xml.includes('<hierarchy'))
    throw new Error('uiautomator could not read the screen (busy animating?)')
  const out = []
  for (const m of xml.matchAll(/<node ([^>]*?)\/?>/g)) {
    const attr = {}
    for (const a of m[1].matchAll(/([\w-]+)="([^"]*)"/g)) attr[a[1]] = decode(a[2])
    const b = attr.bounds?.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/)
    if (!b) continue
    const [x1, y1, x2, y2] = b.slice(1).map(Number)
    out.push({
      text: attr.text || '',
      desc: attr['content-desc'] || '',
      id: (attr['resource-id'] || '').replace(`${PACKAGE}:id/`, ''),
      cls: (attr.class || '').split('.').pop(),
      clickable: attr.clickable === 'true',
      checked: attr.checked === 'true',
      selected: attr.selected === 'true',
      enabled: attr.enabled !== 'false',
      focused: attr.focused === 'true',
      x: Math.round((x1 + x2) / 2),
      y: Math.round((y1 + y2) / 2),
      w: x2 - x1,
      h: y2 - y1,
    })
  }
  return out
}

function findNode(args) {
  const all = nodes()
  const match = all.filter((n) => {
    if (args.text !== undefined) return n.text === String(args.text) || n.desc === String(args.text)
    if (args.desc !== undefined) return n.desc === String(args.desc)
    if (args.id !== undefined) return n.id === String(args.id)
    if (args.contains !== undefined) {
      const part = String(args.contains).toLowerCase()
      return n.text.toLowerCase().includes(part) || n.desc.toLowerCase().includes(part)
    }
    return false
  })
  const node = match[args.index ?? 0]
  if (!node) throw new Error(`not found: ${JSON.stringify(args)}`)
  return node
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitFor(args) {
  const until = Date.now() + (args.timeout ?? 5) * 1000
  for (;;) {
    try {
      return findNode(args)
    } catch (error) {
      if (Date.now() > until) throw error
      await sleep(400)
    }
  }
}

function typeText(text) {
  // `input text` takes %s for spaces and needs shell metacharacters escaped.
  const escaped = String(text)
    .replace(/([\\"'`$&|;<>()*~!?[\]{}#])/g, '\\$1')
    .replace(/ /g, '%s')
  adb('shell', 'input', 'text', escaped)
}

const KEYS = {
  back: 4,
  home: 3,
  enter: 66,
  del: 67,
  tab: 61,
  recent: 187,
  up: 19,
  down: 20,
  left: 21,
  right: 22,
  menu: 82,
}

async function android(op, args) {
  switch (op) {
    case 'devices':
      return console.log(adb('devices', '-l'))
    case 'elements': {
      for (const n of nodes()) {
        if (!n.text && !n.desc && !n.id && !n.clickable) continue
        const flags = [
          n.clickable && 'tap',
          n.checked && 'checked',
          n.selected && 'selected',
          !n.enabled && 'disabled',
          n.focused && 'focused',
        ]
          .filter(Boolean)
          .join(' ')
        console.log(
          `${n.cls.padEnd(14)} ${JSON.stringify(n.text || n.desc)}${n.id ? ` #${n.id}` : ''} ${flags} @${n.x},${n.y} [${n.w}x${n.h}]`,
        )
      }
      return
    }
    case 'tap':
    case 'long': {
      const { x, y } = args.x !== undefined ? args : await waitFor(args)
      if (op === 'long')
        adb(
          'shell',
          'input',
          'swipe',
          `${x}`,
          `${y}`,
          `${x}`,
          `${y}`,
          `${Math.round((args.seconds ?? 1) * 1000)}`,
        )
      else adb('shell', 'input', 'tap', `${x}`, `${y}`)
      return console.log('✓')
    }
    case 'type':
      if (args.text === undefined) throw new Error('type needs text=…')
      if (args.into !== undefined) {
        const field = await waitFor({ text: args.into })
        adb('shell', 'input', 'tap', `${field.x}`, `${field.y}`)
      }
      typeText(args.text)
      return console.log('✓')
    case 'clear': {
      // Focus the field, select all (Ctrl+A) and delete.
      const { x, y } = args.x !== undefined ? args : await waitFor(args)
      adb('shell', 'input', 'tap', `${x}`, `${y}`)
      await sleep(300)
      adb('shell', 'input', 'keycombination', '113', '29')
      adb('shell', 'input', 'keyevent', '67')
      return console.log('✓')
    }
    case 'key':
      adb('shell', 'input', 'keyevent', `${KEYS[args.name] ?? args.code ?? args.name}`)
      return console.log('✓')
    case 'swipe': {
      const [w, h] = adb('shell', 'wm', 'size')
        .match(/(\d+)x(\d+)/)
        .slice(1)
        .map(Number)
      const dir = args.dir ?? 'up'
      const cx = Math.round(w / 2)
      const from = {
        up: [cx, h * 0.75],
        down: [cx, h * 0.3],
        left: [w * 0.85, h / 2],
        right: [w * 0.15, h / 2],
      }[dir]
      const to = {
        up: [cx, h * 0.25],
        down: [cx, h * 0.8],
        left: [w * 0.15, h / 2],
        right: [w * 0.85, h / 2],
      }[dir]
      const [x1, y1, x2, y2] =
        args.x1 !== undefined ? [args.x1, args.y1, args.x2, args.y2] : [...from, ...to]
      adb(
        'shell',
        'input',
        'swipe',
        ...[x1, y1, x2, y2].map((v) => `${Math.round(v)}`),
        `${args.ms ?? 300}`,
      )
      return console.log('✓')
    }
    case 'exists': {
      try {
        await waitFor(args)
        return console.log(JSON.stringify({ exists: true }))
      } catch {
        return console.log(JSON.stringify({ exists: false }))
      }
    }
    case 'shot': {
      const file = args.out || stamp('android')
      fs.writeFileSync(file, adbRaw('exec-out', 'screencap', '-p'))
      return console.log(file)
    }
    case 'launch':
      adb('shell', 'am', 'start', '-W', '-n', `${PACKAGE}/.main.MainActivity`)
      return console.log('✓')
    case 'stop':
      adb('shell', 'am', 'force-stop', PACKAGE)
      return console.log('✓')
    case 'clear':
      adb('shell', 'pm', 'clear', PACKAGE)
      return console.log('✓')
    case 'install':
      console.log(adb('install', '-r', '-d', args.apk))
      return
    case 'open':
      adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', String(args.url))
      return console.log('✓')
    case 'share':
      // What the share sheet sends: a link as text, to ADHX's share screen.
      adb(
        'shell',
        'am',
        'start',
        '-W',
        '-a',
        'android.intent.action.SEND',
        '-t',
        'text/plain',
        '--es',
        'android.intent.extra.TEXT',
        `'${String(args.text).replace(/'/g, "'\\''")}'`,
        '-n',
        `${PACKAGE}/.share.ShareActivity`,
      )
      return console.log('✓')
    case 'rotate':
      adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0')
      adb(
        'shell',
        'settings',
        'put',
        'system',
        'user_rotation',
        args.to === 'landscape' ? '1' : '0',
      )
      return console.log('✓')
    case 'wait':
      await sleep((args.seconds ?? 1) * 1000)
      return console.log('✓')
    case 'logcat':
      return console.log(
        adb(
          'logcat',
          '-d',
          '-t',
          `${args.lines ?? 200}`,
          '--pid',
          adb('shell', 'pidof', PACKAGE).trim() || '0',
        ),
      )
    default:
      throw new Error(`unknown op ${op}`)
  }
}

const [platform, op, ...rest] = process.argv.slice(2)
const args = parseArgs(rest)
const run = platform === 'ios' ? ios : platform === 'android' ? android : null
if (!run || !op) {
  console.error('Usage: drive.mjs <ios|android> <op> [key=value …]  (see e2e/devices/README.md)')
  process.exit(1)
}
run(op, args).catch((error) => {
  console.error(`✗ ${error.message}`)
  process.exit(1)
})
