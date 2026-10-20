/**
 * `pnpm parity:serve`: a fresh parity database and media, then one Next dev
 * server on :3600 that the web capture and the phone apps share.
 *
 * Migrate and seed run here, before Next starts, so Next never opens a file
 * that's about to be replaced (same rule as e2e/serve.ts).
 */
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import Database from 'better-sqlite3'
import {
  PARITY_CREDENTIALS,
  PARITY_DB_PATH,
  PARITY_MEDIA_DIR,
  PARITY_ORIGIN,
  PARITY_OUT,
  PARITY_PORT,
  PARITY_ROOT,
  PARITY_WORKER_TOKEN,
  parityProcessEnv,
} from './env'
import { DOING, POSTS } from './world'

function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' })
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
  })
}

function step(label: string, args: string[]) {
  const result = spawnSync('pnpm', ['exec', 'tsx', ...args], {
    cwd: PARITY_ROOT,
    env: parityProcessEnv(),
    stdio: 'inherit',
  })
  if (result.status !== 0) throw new Error(`[parity] ${label} failed with status ${result.status}`)
}

/**
 * The keep worker turns every `running` job back to `pending` when it starts
 * (a restart mid-download tries again). Once Next is up, put dark chocolate's
 * job back to running at 62%, so the theater shows "Getting it ready · 62%"
 * (board j1-4) and /doing its percent. With the backfill cutoff in 2999 the
 * worker never claims it, so it stays that way until the next restart.
 */
async function pinKeeping(): Promise<void> {
  for (let i = 0; i < 300; i++) {
    const ok = await fetch(`${PARITY_ORIGIN}/api/health`)
      .then((r) => r.ok)
      .catch(() => false)
    if (ok) break
    await new Promise((r) => setTimeout(r, 1_000))
  }
  await new Promise((r) => setTimeout(r, 1_000))
  const choc = POSTS.find((p) => p.key === DOING.keeping)
  if (!choc) return
  const db = new Database(PARITY_DB_PATH)
  try {
    db.prepare(
      `UPDATE keep_jobs SET status = 'running', progress = 62 WHERE platform = ? AND post_id = ?`,
    ).run(choc.platform, choc.id)
    console.log(`[parity] ${choc.platform}:${choc.id} is being kept (62%)`)
  } finally {
    db.close()
  }
}

/**
 * Keep the Mac helper "connected" (board j8-3): a helper polls
 * `/api/processing/jobs` with its token every few seconds, and the server
 * reads the last authorised request as its heartbeat. This one only ever
 * sends a heartbeat for a lease that doesn't exist, so it never claims,
 * changes or finishes a job (the server answers 409 and notes it was seen).
 */
function keepHelperConnected(): NodeJS.Timeout {
  const beat = () =>
    fetch(`${PARITY_ORIGIN}/api/processing/jobs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PARITY_WORKER_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'heartbeat',
        id: 'parity-presence',
        lease: 'parity-presence',
      }),
    })
      .then((r) => r.body?.cancel())
      .catch(() => {})
  void beat()
  return setInterval(beat, 30_000)
}

async function main() {
  if (await portInUse(PARITY_PORT)) {
    console.error(
      `[parity] something is already listening on :${PARITY_PORT}. Stop it first (or reuse it).`,
    )
    process.exit(1)
  }
  fs.mkdirSync(PARITY_OUT, { recursive: true })
  for (const f of [PARITY_DB_PATH, `${PARITY_DB_PATH}-wal`, `${PARITY_DB_PATH}-shm`]) {
    fs.rmSync(f, { force: true })
  }
  // A dev cache left by an earlier run (and edits since) can send open pages
  // into a reload loop after a restart; start from a clean one.
  fs.rmSync(path.join(PARITY_ROOT, '.next-parity'), { recursive: true, force: true })
  console.log(`[parity] migrate + seed ${PARITY_DB_PATH}`)
  step('migrate', ['src/lib/db/migrate.ts'])
  step('seed', ['e2e/parity/seed.ts'])

  if (process.env.PARITY_SEED_ONLY === '1') return

  const env = parityProcessEnv()
  console.log(`[parity] next dev on ${PARITY_ORIGIN} (MEDIA_DIR=${PARITY_MEDIA_DIR})`)
  console.log(`[parity] credentials: ${PARITY_CREDENTIALS}`)
  const next = spawn(
    'pnpm',
    ['exec', 'next', 'dev', '-p', String(PARITY_PORT), '-H', '127.0.0.1'],
    { cwd: PARITY_ROOT, env, stdio: 'inherit' },
  )
  const shutdown = () => {
    if (!next.killed) next.kill('SIGTERM')
  }
  next.on('exit', (code) => process.exit(code ?? 1))
  void pinKeeping()
    .then(() => {
      const helper = keepHelperConnected()
      next.on('exit', () => clearInterval(helper))
      console.log('[parity] Mac helper connected (heartbeat every 30 s)')
    })
    .catch((error) => console.error('[parity] pin keeping', error))
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
