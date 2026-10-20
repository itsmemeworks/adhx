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
import {
  PARITY_CREDENTIALS,
  PARITY_DB_PATH,
  PARITY_MEDIA_DIR,
  PARITY_ORIGIN,
  PARITY_OUT,
  PARITY_PORT,
  PARITY_ROOT,
  parityProcessEnv,
} from './env'

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
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
