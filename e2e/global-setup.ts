import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { E2E_ROOT, E2E_DB_PATH, e2eProcessEnv } from './env'

function rmIfExists(file: string) {
  try {
    fs.unlinkSync(file)
  } catch {
    // first run
  }
}

export default function globalSetup(): void {
  console.log(`[e2e] migrate/seed ${E2E_DB_PATH}`)
  fs.mkdirSync(`${E2E_ROOT}/data`, { recursive: true })
  rmIfExists(E2E_DB_PATH)
  rmIfExists(`${E2E_DB_PATH}-wal`)
  rmIfExists(`${E2E_DB_PATH}-shm`)

  const env = e2eProcessEnv()
  const migrate = spawnSync('pnpm', ['exec', 'tsx', 'src/lib/db/migrate.ts'], {
    cwd: E2E_ROOT,
    env,
    stdio: 'inherit',
  })
  if (migrate.status !== 0) {
    throw new Error(`e2e migrate failed with status ${migrate.status}`)
  }

  const seed = spawnSync('pnpm', ['exec', 'tsx', 'e2e/seed.ts'], {
    cwd: E2E_ROOT,
    env,
    stdio: 'inherit',
  })
  if (seed.status !== 0) {
    throw new Error(`e2e seed failed with status ${seed.status}`)
  }
}
