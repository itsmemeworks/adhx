import { eq, like } from 'drizzle-orm'
import { db } from '@/lib/db'
import { serverSettings } from '@/lib/db/schema'
import { decryptToken, encryptToken } from '@/lib/auth/token-encryption'
import { writeServerSetting } from './server'
import { envSetting, installStoredSettings, setting, storedSetting } from './value'

/**
 * Settings an admin can change from Admin → System instead of the server's
 * environment: optional extras (Jev, email, the X app, a server name) and the
 * day-to-day knobs (what gets kept, how closely videos are read, how often X
 * syncs, who may sign up).
 *
 * A value saved here wins; the environment gives the starting value, and
 * clearing a saved value goes back to it. Every one of these is read when it's
 * used, so a change applies within a few seconds, without a restart. Settings
 * read once at startup (paths, the processing mode, the session secret) stay
 * in the environment and show on the page read-only.
 *
 * Secrets are stored encrypted (the same key as X tokens) and never sent back
 * to the page. Read through `setting()` / `extra()`; never `process.env`
 * directly for these names.
 */

export type SettingKind = 'text' | 'secret' | 'choice' | 'number' | 'list' | 'cookies'

export type SettingGroup =
  'Sign-in and email' | 'Keeping copies' | 'Understanding' | 'Jev' | 'X' | 'This server'

export interface ExtraSpec {
  group: SettingGroup
  label: string
  kind: SettingKind
  /** What it does, in a line. */
  help: string
  /** The value used when nothing is set, as it would be written. */
  fallback?: string
  /** What nothing set means, when it isn't a value ("Anyone"). */
  unset?: string
  choices?: readonly { value: string; label: string }[]
  /** Numbers: the allowed range. */
  min?: number
  max?: number
  /** Checks a value before it's saved; returns why it's wrong, or null. */
  check?: (value: string) => string | null
  /** The value in words, for the page. */
  show?: (value: string) => string
  /** Longest value accepted (default 2,000 characters). */
  maxLength?: number
}

const ON_OFF = [
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
] as const

/** The cookie lines of a Netscape cookies.txt (comments and blanks dropped). */
export function cookieLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && (!line.startsWith('#') || line.startsWith('#HttpOnly_')))
}

/** The sites a cookies.txt signs in to, like "tiktok.com, instagram.com". */
export function cookieSites(text: string): string[] {
  const sites = new Set<string>()
  for (const line of cookieLines(text)) {
    const host = line
      .split('\t')[0]
      .replace(/^#HttpOnly_/, '')
      .replace(/^\./, '')
      .toLowerCase()
    const parts = host.split('.').filter(Boolean)
    if (parts.length) sites.add(parts.slice(-2).join('.'))
  }
  return [...sites].sort()
}

const isOff = (v: string) => ['off', '0', 'false'].includes(v.toLowerCase())
const onOff = (v: string) => (isOff(v) ? 'Off' : 'On')

export const EXTRAS = {
  RESEND_API_KEY: {
    group: 'Sign-in and email',
    label: 'Resend key',
    kind: 'secret',
    help: 'Emails sign-in links through Resend.',
  },
  SMTP_URL: {
    group: 'Sign-in and email',
    label: 'SMTP',
    kind: 'secret',
    help: 'Or your own mail server: smtps://user:password@host:465.',
    check: (v) => (/^smtps?:\/\/\S+$/.test(v) ? null : 'Start it with smtp:// or smtps://.'),
  },
  EMAIL_FROM: {
    group: 'Sign-in and email',
    label: 'Emails come from',
    kind: 'text',
    help: 'Like ADHX <login@your.domain>: an address your mail service lets you send as.',
    fallback: 'ADHX <login@adhx.com>',
    check: (v) => (/@/.test(v) ? null : 'Include an email address.'),
  },
  ALLOWED_EMAILS: {
    group: 'Sign-in and email',
    label: 'Who may sign up by email',
    kind: 'list',
    help: 'Emails or @domains, separated by commas, or * for anyone. Empty or none: only people you send an invite link. People with an account can always sign in.',
    unset: 'Only people with an invite',
    check: (v) =>
      v === '*' ||
      v.toLowerCase() === 'none' ||
      v
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean)
        .every((e) => /^[^@\s,]*@[^@\s,]+\.[^@\s,]+$/.test(e))
        ? null
        : 'Use emails or @domains separated by commas, * for anyone, or none.',
    show: (v) => {
      if (v === '*') return 'Anyone'
      if (v.toLowerCase() === 'none') return 'Only people with an invite'
      const n = v.split(',').filter((e) => e.trim()).length
      return `${n} ${n === 1 ? 'entry' : 'entries'}`
    },
  },
  KEEP_MEDIA: {
    group: 'Keeping copies',
    label: 'Keep copies',
    kind: 'choice',
    help: 'Download every save’s media once and serve it from here. Off: posts play from their source.',
    fallback: 'on',
    choices: ON_OFF,
    show: onOff,
  },
  KEEP_BACKFILL: {
    group: 'Keeping copies',
    label: 'Older saves too',
    kind: 'choice',
    help: 'Off keeps only what’s saved from now on, which is kinder to a small disk.',
    fallback: 'on',
    choices: ON_OFF,
    show: onOff,
  },
  KEEP_CONCURRENCY: {
    group: 'Keeping copies',
    label: 'Downloads at once',
    kind: 'number',
    help: 'More is faster and busier. 1 to 8.',
    fallback: '2',
    min: 1,
    max: 8,
  },
  KEEP_MAX_FILESIZE: {
    group: 'Keeping copies',
    label: 'Largest file',
    kind: 'text',
    help: 'Bigger files are skipped. Like 500M or 4G.',
    fallback: '4G',
    check: (v) => (/^\d+(\.\d+)?[KMG]?$/i.test(v) ? null : 'Use a size like 500M or 4G.'),
  },
  KEEP_MIN_FREE_GB: {
    group: 'Keeping copies',
    label: 'Stop when free disk is under',
    kind: 'number',
    help: 'In GB. Downloads wait until there’s room again.',
    fallback: '2',
    min: 0,
    max: 100_000,
    show: (v) => `${v} GB`,
  },
  YTDLP_COOKIES: {
    group: 'Keeping copies',
    label: 'Signed-in cookies',
    kind: 'cookies',
    help: 'For posts TikTok, Instagram or Facebook only show to signed-in people. Export cookies.txt from a browser signed in to them (a cookies.txt extension does it) and paste or choose the file. Stored encrypted; replace it when downloads start asking to sign in again.',
    maxLength: 1_000_000,
    check: (v) =>
      cookieLines(v).length > 0 && cookieLines(v).every((line) => line.split('\t').length === 7)
        ? null
        : 'That isn’t a cookies.txt. Export one in Netscape format: one cookie a line, seven columns.',
  },
  KEEP_H264: {
    group: 'Keeping copies',
    label: 'Convert videos to H.264',
    kind: 'choice',
    help: 'So every browser plays them. Off keeps whatever the source sent.',
    fallback: 'on',
    choices: ON_OFF,
    show: onOff,
  },
  INDEXING_LEVEL: {
    group: 'Understanding',
    label: 'How closely videos are read',
    kind: 'choice',
    help: 'Deep finds more and takes longer. Changing it reads every video again.',
    fallback: 'normal',
    choices: [
      { value: 'light', label: 'Light' },
      { value: 'normal', label: 'Normal' },
      { value: 'deep', label: 'Deep' },
    ],
    show: (v) => v.charAt(0).toUpperCase() + v.slice(1),
  },
  SEMANTIC_SPEECH: {
    group: 'Understanding',
    label: 'Listen to speech',
    kind: 'choice',
    help: 'Writes down what’s said in videos so search finds it.',
    fallback: 'on',
    choices: ON_OFF,
    show: onOff,
  },
  SEMANTIC_SCREEN_TEXT: {
    group: 'Understanding',
    label: 'Read text on screen',
    kind: 'choice',
    help: 'Reads captions, memes and screenshots so search finds the words.',
    fallback: 'on',
    choices: ON_OFF,
    show: onOff,
  },
  TYPESAFE_API_KEY: {
    group: 'Jev',
    label: 'Jev key',
    kind: 'secret',
    help: 'Sharper search, and names for channels and moments. From typesafe.ai.',
  },
  TYPESAFE_CHANNEL_IMAGES: {
    group: 'Jev',
    label: 'Jev looks at channel pictures',
    kind: 'choice',
    help: 'Sends public post pictures to Jev to name channels by what they show.',
    fallback: 'off',
    choices: ON_OFF,
    show: (v) => (v === 'on' ? 'On' : 'Off'),
  },
  TWITTER_CLIENT_ID: {
    group: 'X',
    label: 'X app id',
    kind: 'text',
    help: 'From your X developer app, to bring in X bookmarks.',
  },
  TWITTER_CLIENT_SECRET: {
    group: 'X',
    label: 'X app secret',
    kind: 'secret',
    help: 'From the same X developer app.',
  },
  AUTO_SYNC_EVERY_MINUTES: {
    group: 'X',
    label: 'Bring in new bookmarks every',
    kind: 'number',
    help: 'In minutes, for everyone who connected X. 0 turns it off.',
    fallback: '50',
    min: 0,
    max: 1440,
    show: (v) => (Number(v) === 0 ? 'Off' : `${v} minutes`),
  },
  PUBLIC_PAGES: {
    group: 'This server',
    label: 'Show up in search engines',
    kind: 'choice',
    help: 'On lets Google and others list Right now, public channels and shared posts. Off keeps them out; links people send still open.',
    fallback: 'off',
    choices: ON_OFF,
    show: (v) => (v === 'on' ? 'On' : 'Off'),
  },
  SERVER_LABEL: {
    group: 'This server',
    label: 'Server name',
    kind: 'text',
    help: 'What this page calls the machine, like UGREEN NAS.',
    unset: 'The machine’s own name',
  },
} satisfies Record<string, ExtraSpec>

export type ExtraName = keyof typeof EXTRAS

export function isExtraName(value: unknown): value is ExtraName {
  return typeof value === 'string' && Object.hasOwn(EXTRAS, value)
}

const PREFIX = 'extra.'
const CACHE_MS = 5_000
const MAX_LENGTH = 2_000
/** Kept encrypted and never sent back to the page. */
const isSecret = (spec: ExtraSpec) => spec.kind === 'secret' || spec.kind === 'cookies'

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
        values.set(name, isSecret(EXTRAS[name]) ? decryptToken(row.value) : row.value)
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

// Importing this module is what lets `setting()` see saved values in this process.
installStoredSettings(stored)

/** The value in use: the one saved here, else the environment's, else null. */
export function extra(name: ExtraName): string | null {
  return setting(name)
}

/** Where the value in use comes from. */
export function extraSource(name: ExtraName): 'admin' | 'env' | null {
  if (storedSetting(name) !== null) return 'admin'
  return envSetting(name) ? 'env' : null
}

export class ExtraError extends Error {}

/** Why a value can't be saved, or null. */
function problemWith(spec: ExtraSpec, value: string): string | null {
  if (value.length > (spec.maxLength ?? MAX_LENGTH)) return 'That’s too long.'
  if (spec.kind === 'choice' && !spec.choices?.some((c) => c.value === value))
    return `Choose ${spec.choices?.map((c) => c.label.toLowerCase()).join(' or ')}.`
  if (spec.kind === 'number') {
    const n = Number(value)
    if (!/^\d+(\.\d+)?$/.test(value) || !Number.isFinite(n)) return 'Use a number.'
    if (spec.min !== undefined && n < spec.min) return `Use ${spec.min} or more.`
    if (spec.max !== undefined && n > spec.max) return `Use ${spec.max} or less.`
  }
  return spec.check?.(value) ?? null
}

/** Save (or with null, clear back to the environment's) a value. */
export function setExtra(name: ExtraName, value: string | null): void {
  const key = `${PREFIX}${name}`
  const clean = value?.trim() ?? ''
  const spec: ExtraSpec = EXTRAS[name]
  if (!clean) {
    db.delete(serverSettings).where(eq(serverSettings.key, key)).run()
  } else {
    const problem = problemWith(spec, clean)
    if (problem) throw new ExtraError(problem)
    writeServerSetting(key, isSecret(spec) ? encryptToken(clean) : clean)
  }
  g.__adhxExtras = undefined
}

export interface ExtraView {
  name: ExtraName
  group: SettingGroup
  label: string
  help: string
  kind: SettingKind
  choices: { value: string; label: string }[] | null
  min: number | null
  max: number | null
  /** Where the value in use comes from; 'default' when nothing is set. */
  source: 'admin' | 'env' | 'default'
  /** True when the environment also sets it (so clearing goes back to that). */
  inEnv: boolean
  /** The value in use, as written; null for secrets and when unset. */
  value: string | null
  /** The value in use, in words ("Set" / "Not set" for secrets). */
  shown: string
}

/** For the System page: every setting, where it comes from, and its value only when not secret. */
export function extrasView(): ExtraView[] {
  return (Object.keys(EXTRAS) as ExtraName[]).map((name) => {
    const spec: ExtraSpec = EXTRAS[name]
    const secret = isSecret(spec)
    const source = extraSource(name) ?? 'default'
    const raw = extra(name) ?? spec.fallback ?? null
    return {
      name,
      group: spec.group,
      label: spec.label,
      help: spec.help,
      kind: spec.kind,
      choices: spec.choices ? [...spec.choices] : null,
      min: spec.min ?? null,
      max: spec.max ?? null,
      source,
      inEnv: envSetting(name) !== null,
      value: secret ? null : raw,
      shown: secret
        ? source === 'default'
          ? 'Not set'
          : spec.kind === 'cookies'
            ? // Pasted here, or the environment's YTDLP_COOKIES file.
              source === 'admin'
              ? `For ${cookieSites(raw ?? '').join(', ') || 'some sites'}`
              : 'From a file'
            : 'Set'
        : raw === null
          ? (spec.unset ?? 'Not set')
          : (spec.show?.(raw) ?? raw),
    }
  })
}

/** Tests: drop the cache. */
export function __resetExtrasCache(): void {
  g.__adhxExtras = undefined
}
