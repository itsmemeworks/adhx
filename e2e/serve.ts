/**
 * Dedicated e2e Next process on :3002 plus the FxTwitter mock.
 * Does not touch the owner's `pnpm dev` on :3001.
 */
import { spawn } from 'node:child_process'
import { E2E_FX_PORT, E2E_PORT } from './constants'
import { E2E_ROOT, e2eProcessEnv } from './env'
import { startFxMock } from './fx-mock'

const fx = startFxMock(E2E_FX_PORT)
const env = e2eProcessEnv()
console.log(`[e2e] next DATABASE_PATH=${env.DATABASE_PATH} distDir=${env.NEXT_DIST_DIR}`)

const next = spawn('pnpm', ['exec', 'next', 'dev', '-p', String(E2E_PORT)], {
  cwd: E2E_ROOT,
  env,
  stdio: 'inherit',
})

function shutdown(code = 0) {
  fx.close()
  if (!next.killed) next.kill('SIGTERM')
  process.exit(code)
}

next.on('exit', (code) => {
  fx.close()
  process.exit(code ?? 1)
})

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
