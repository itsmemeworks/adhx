import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

/**
 * The secret behind sessions, phone sign-in codes, file links and stored
 * tokens. `SESSION_SECRET` wins (older installs may only have
 * `TWITTER_CLIENT_SECRET`). Without either, ADHX makes one on first start and
 * keeps it next to the database as `session-secret`, so a one-click install
 * needs no setup and a restart keeps everyone signed in. Back it up with the
 * database: stored X tokens can't be read without it.
 */

const FILE_NAME = 'session-secret'
const MIN_LENGTH = 32

let kept: string | null = null

function fromEnv(): string | null {
  return process.env['SESSION_SECRET'] || process.env['TWITTER_CLIENT_SECRET'] || null
}

/** Where the made-up secret lives: beside the database. */
export function secretFilePath(): string {
  const database = process.env['DATABASE_PATH'] || './data/adhdone.db'
  return path.join(path.dirname(path.resolve(database)), FILE_NAME)
}

/**
 * Read the kept secret, or make it. Several processes start at once (the
 * migration, the web server, the workers), so the file is written aside and
 * linked into place: whoever links first wins and everyone reads theirs.
 */
export function readOrMakeSecret(file: string): string {
  try {
    return check(fs.readFileSync(file, 'utf8').trim(), file)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const draft = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}`
  fs.writeFileSync(draft, crypto.randomBytes(48).toString('base64'), { mode: 0o600 })
  try {
    fs.linkSync(draft, file)
    console.warn(`[setup] Made a session secret at ${file}. Back it up with the database.`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  } finally {
    fs.rmSync(draft, { force: true })
  }
  return check(fs.readFileSync(file, 'utf8').trim(), file)
}

function check(secret: string, file: string): string {
  if (secret.length < MIN_LENGTH) {
    throw new Error(`${file} is shorter than ${MIN_LENGTH} characters. Set SESSION_SECRET instead.`)
  }
  return secret
}

export function serverSecret(): string {
  const env = fromEnv()
  if (env) return env
  if (process.env.NODE_ENV === 'test') return 'test-secret-for-vitest-only'
  kept ??= readOrMakeSecret(secretFilePath())
  return kept
}
