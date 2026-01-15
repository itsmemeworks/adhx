/**
 * Database reset script
 *
 * Deletes existing database files (including WAL) and runs migrations
 * for a completely fresh start. Useful for testing and development.
 */
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

const DB_PATH = process.env.DATABASE_PATH || './data/adhdone.db'

// SQLite WAL mode creates additional files that must also be deleted
const filesToDelete = [
  DB_PATH,
  `${DB_PATH}-wal`,
  `${DB_PATH}-shm`,
]

console.warn('[reset] Removing existing database files...')

for (const file of filesToDelete) {
  const resolved = path.resolve(file)
  if (fs.existsSync(resolved)) {
    fs.rmSync(resolved, { force: true })
    console.warn(`[reset] Deleted: ${resolved}`)
  }
}

console.warn('[reset] Running migrations...')
execSync('pnpm db:migrate', { stdio: 'inherit' })

console.warn('[reset] Database reset complete!')
