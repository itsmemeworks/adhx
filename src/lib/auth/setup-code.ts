import crypto from 'node:crypto'
import { serverSecret } from './server-secret'

/**
 * The one-time code that makes someone the owner of a fresh ADHX (`/setup`).
 * Whoever reaches a new server first must not get to run it, so the code is
 * only shown where the person installing it can look: the host's dashboard
 * (deploy templates set `SETUP_CODE`) or the server log. Without
 * `SETUP_CODE` it is derived from the server secret, so it stays the same
 * across restarts. It stops working once there is an admin.
 *
 * No database here: the startup migration prints it.
 */

// No 0/O, 1/I/L or U, so it reads aloud and types cleanly.
const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'

export function setupCode(): string {
  const fromEnv = process.env['SETUP_CODE']?.trim()
  if (fromEnv) return fromEnv
  const bytes = crypto.createHmac('sha256', serverSecret()).update('adhx-setup-code').digest()
  let code = ''
  for (let i = 0; i < 12; i++) code += ALPHABET[bytes[i] % ALPHABET.length]
  return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)}`
}

function normalise(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function matchesSetupCode(input: string): boolean {
  const expected = normalise(setupCode())
  if (!expected) return false
  const digest = (value: string) => crypto.createHash('sha256').update(value).digest()
  return crypto.timingSafeEqual(digest(normalise(input)), digest(expected))
}

/** The startup log lines for an ADHX nobody has set up yet. */
export function setupAnnouncement(address: string): string[] {
  const code = setupCode()
  const link = `${address}/setup?code=${encodeURIComponent(code)}`
  return [
    '[setup] This ADHX has no owner yet. Open this link to make it yours:',
    `[setup]   ${link}`,
    `[setup] On another address? Open /setup there and enter the code ${code}.`,
  ]
}
