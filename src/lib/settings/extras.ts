import { eq, like } from 'drizzle-orm'
import { db } from '@/lib/db'
import { serverSettings } from '@/lib/db/schema'
import { decryptToken, encryptToken } from '@/lib/auth/token-encryption'
import { writeServerSetting } from './server'

/**
 * Optional extras an admin can switch on from Admin → System, for whoever
 * didn't know about them when they set ADHX up: Jev, email for sign-in
 * links, the X app keys and a name for the server.
 *
 * The environment always wins: a variable that's set is used as it is, and
 * the admin page shows "Set in the environment" instead of a field. Only
 * when it's unset does a value saved here count. Secrets are stored
 * encrypted (the same key as X tokens) and never sent back to the page.
 *
 * Read through `extra()`; never `process.env` directly for these names.
 */

export interface ExtraSpec {
  label: string
  secret: boolean
  /** What it's for, in a line. */
  help: string
  /** Checks a value before it's saved; returns why it's wrong, or null. */
  check?: (value: string) => string | null
}

export const EXTRAS = {
  TYPESAFE_API_KEY: {
    label: 'Jev key',
    secret: true,
    help: 'Refines search, names channels and moments. From typesafe.ai.',
  },
  TYPESAFE_CHANNEL_IMAGES: {
    label: 'Jev looks at channel pictures',
    secret: false,
    help: 'Sends public post pictures to Jev to name channels by what they show. on or off.',
    check: (v) => (v === 'on' || v === 'off' ? null : 'Use on or off.'),
  },
  RESEND_API_KEY: {
    label: 'Resend key',
    secret: true,
    help: 'Emails sign-in links through Resend.',
  },
  SMTP_URL: {
    label: 'SMTP',
    secret: true,
    help: 'Emails sign-in links through your own mail server: smtps://user:password@host:465.',
    check: (v) => (/^smtps?:\/\/\S+$/.test(v) ? null : 'Start it with smtp:// or smtps://.'),
  },
  EMAIL_FROM: {
    label: 'Emails come from',
    secret: false,
    help: 'Like ADHX <login@your.domain>. The address must be one your mail service lets you send as.',
    check: (v) => (/@/.test(v) ? null : 'Include an email address.'),
  },
  TWITTER_CLIENT_ID: {
    label: 'X app id',
    secret: false,
    help: 'From your X developer app, to bring in X bookmarks.',
  },
  TWITTER_CLIENT_SECRET: {
    label: 'X app secret',
    secret: true,
    help: 'From the same X developer app.',
  },
  SERVER_LABEL: {
    label: 'Server name',
    secret: false,
    help: 'What the System page calls this machine, like UGREEN NAS.',
  },
} satisfies Record<string, ExtraSpec>

export type ExtraName = keyof typeof EXTRAS

export function isExtraName(value: unknown): value is ExtraName {
  return typeof value === 'string' && Object.hasOwn(EXTRAS, value)
}

const PREFIX = 'extra.'
const CACHE_MS = 5_000
const MAX_LENGTH = 500

const g = globalThis as unknown as {
  __adhxExtras?: { at: number; values: Map<string, string> }
}

function stored(): Map<string, string> {
  const cached = g.__adhxExtras
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.values
  const values = new Map<string, string>()
  try {
    for (const row of db
      .select({ key: serverSettings.key, value: serverSettings.value })
      .from(serverSettings)
      .where(like(serverSettings.key, `${PREFIX}%`))
      .all()) {
      const name = row.key.slice(PREFIX.length)
      if (!isExtraName(name)) continue
      try {
        values.set(name, EXTRAS[name].secret ? decryptToken(row.value) : row.value)
      } catch {
        // Saved under another server secret: treat it as unset.
      }
    }
  } catch {
    // No database yet (a build, or before the first migration).
  }
  g.__adhxExtras = { at: Date.now(), values }
  return values
}

function fromEnv(name: ExtraName): string | null {
  const v = process.env[name]?.trim()
  return v ? v : null
}

/** The value in use: the environment's, else the admin's, else null. */
export function extra(name: ExtraName): string | null {
  return fromEnv(name) ?? stored().get(name) ?? null
}

/** Where the value in use comes from. */
export function extraSource(name: ExtraName): 'env' | 'admin' | null {
  if (fromEnv(name)) return 'env'
  return stored().has(name) ? 'admin' : null
}

export class ExtraError extends Error {}

/** Save (or with null, clear) an admin value. Refused when the environment sets it. */
export function setExtra(name: ExtraName, value: string | null): void {
  if (fromEnv(name)) throw new ExtraError(`${name} is set in the environment; change it there.`)
  const key = `${PREFIX}${name}`
  const clean = value?.trim() ?? ''
  if (!clean) {
    db.delete(serverSettings).where(eq(serverSettings.key, key)).run()
  } else {
    if (clean.length > MAX_LENGTH) throw new ExtraError('That’s too long.')
    const spec: ExtraSpec = EXTRAS[name]
    const problem = spec.check?.(clean)
    if (problem) throw new ExtraError(problem)
    writeServerSetting(key, spec.secret ? encryptToken(clean) : clean)
  }
  g.__adhxExtras = undefined
}

/** For the System page: every extra, where it comes from, and its value only when not secret. */
export function extrasView(): {
  name: ExtraName
  label: string
  help: string
  secret: boolean
  source: 'env' | 'admin' | null
  value: string | null
}[] {
  return (Object.keys(EXTRAS) as ExtraName[]).map((name) => {
    const spec: ExtraSpec = EXTRAS[name]
    const source = extraSource(name)
    return {
      name,
      label: spec.label,
      help: spec.help,
      secret: spec.secret,
      source,
      value: spec.secret || !source ? null : extra(name),
    }
  })
}

/** Tests: drop the cache. */
export function __resetExtrasCache(): void {
  g.__adhxExtras = undefined
}
