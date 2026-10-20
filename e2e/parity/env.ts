/**
 * Paths and environment for the design parity server (`pnpm parity:serve`).
 * Everything it writes lives under `e2e/parity/.out/` (gitignored).
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const PARITY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const PARITY_DIR = path.join(PARITY_ROOT, 'e2e/parity')
export const PARITY_OUT = path.join(PARITY_DIR, '.out')

export const PARITY_PORT = Number(process.env.PARITY_PORT || 3600)
export const PARITY_ORIGIN = `http://127.0.0.1:${PARITY_PORT}`
export const PARITY_DB_PATH = path.join(PARITY_OUT, 'parity.db')
export const PARITY_MEDIA_DIR = path.join(PARITY_OUT, 'media')
/** Videos made from stills and the like, reused across runs. */
export const PARITY_MEDIA_CACHE = path.join(PARITY_OUT, 'media-cache')
export const PARITY_CREDENTIALS = path.join(PARITY_OUT, 'credentials.json')
export const PARITY_SESSION_SECRET = 'adhx-parity-dev-session-secret'

/** The design boards rendered to PNG (one per board, named like the board). */
export const PARITY_REF_DIR = process.env.PARITY_REF_DIR || '/private/tmp/claude-501/parity/ref'

/** Where the real kept media for the boards' posts lives. Missing → placeholders. */
export function parityMediaSource(): string | null {
  const raw = process.env.PARITY_MEDIA_SRC
  return raw ? path.resolve(raw) : null
}

/** Nothing listens here: outbound fetches for unknown posts fail fast instead of going online. */
const DEAD_ORIGIN = 'http://127.0.0.1:9'

/** Env for migrate, seed and the parity Next process. */
export function parityProcessEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    DATABASE_PATH: PARITY_DB_PATH,
    ADHX_DATABASE_PATH: PARITY_DB_PATH,
    MEDIA_DIR: PARITY_MEDIA_DIR,
    SESSION_SECRET: PARITY_SESSION_SECRET,
    TWITTER_CLIENT_ID: 'parity-twitter-client',
    TWITTER_CLIENT_SECRET: 'parity-twitter-secret',
    NEXT_PUBLIC_APP_URL: PARITY_ORIGIN,
    PORT: String(PARITY_PORT),
    NEXT_DIST_DIR: '.next-parity',
    NEXT_TELEMETRY_DISABLED: '1',
    // No model downloads or inference; Right now runs on seeded vectors.
    SEMANTIC_SEARCH: 'off',
    MOMENT_MIN_SAVERS: '1',
    // Keep stays on (so /doing can show keeping and retrying) but the seed pins
    // the backfill cutoff far in the future, so nothing is ever downloaded.
    KEEP_BACKFILL: 'off',
    AUTO_SYNC_EVERY_MINUTES: '0',
    FXTWITTER_API_BASE: DEAD_ORIGIN,
    INSTAGRAM_OG_BASE: DEAD_ORIGIN,
    TNKTOK_API_BASE: DEAD_ORIGIN,
    SENTRY_DSN: '',
    ...extra,
  }
}
