/**
 * Paths and environment for the design parity server (`pnpm parity:serve`).
 * Everything it writes lives under `e2e/parity/.out/` (gitignored).
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const PARITY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const PARITY_DIR = path.join(PARITY_ROOT, 'e2e/parity')
/** `PARITY_OUT_DIR` moves it (the public demo uses a scratch folder). */
export const PARITY_OUT = process.env.PARITY_OUT_DIR || path.join(PARITY_DIR, '.out')

export const PARITY_PORT = Number(process.env.PARITY_PORT || 3600)
export const PARITY_ORIGIN = `http://127.0.0.1:${PARITY_PORT}`
/**
 * Where Next listens. `0.0.0.0` (with `PARITY_PUBLIC_ORIGIN` set to this Mac's
 * LAN address) lets real phones on the same Wi-Fi reach the test world; see
 * `e2e/devices/README.md`. Loopback by default.
 */
export const PARITY_HOST = process.env.PARITY_HOST || '127.0.0.1'
/** The address links, invites and phone pairing use. Defaults to `PARITY_ORIGIN`. */
export const PARITY_PUBLIC_ORIGIN = (process.env.PARITY_PUBLIC_ORIGIN || PARITY_ORIGIN).replace(
  /\/$/,
  '',
)
export const PARITY_DB_PATH = path.join(PARITY_OUT, 'parity.db')
export const PARITY_MEDIA_DIR = path.join(PARITY_OUT, 'media')
/** Videos made from stills and the like, reused across runs. */
export const PARITY_MEDIA_CACHE = path.join(PARITY_OUT, 'media-cache')
export const PARITY_CREDENTIALS = path.join(PARITY_OUT, 'credentials.json')
export const PARITY_SESSION_SECRET = 'adhx-parity-dev-session-secret'
/**
 * The machine token a Mac helper would use (`PROCESSING_WORKER_TOKEN`). The
 * parity server runs in remote processing mode and `parity:serve` polls with
 * it, so /doing shows "Mac helper connected" (board j8-3). Local only.
 */
export const PARITY_WORKER_TOKEN = 'parity-mac-helper-token-local-only-0123456789'

/** The design boards rendered to PNG (one per board, named like the board). */
export const PARITY_REF_DIR = process.env.PARITY_REF_DIR || '/private/tmp/claude-501/parity/ref'

/** Where the real kept media for the boards' posts lives. Missing → placeholders. */
export function parityMediaSource(): string | null {
  // Showcase mode: the credited posts from site/public/media (showcase.ts).
  if (process.env.PARITY_SHOWCASE === '1') return path.join(PARITY_OUT, 'showcase-media')
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
    NEXT_PUBLIC_APP_URL: PARITY_PUBLIC_ORIGIN,
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
    // A Mac helper does the learning and converting; serve.ts keeps one "connected".
    PROCESSING_MODE: 'remote',
    PROCESSING_WORKER_TOKEN: PARITY_WORKER_TOKEN,
    FXTWITTER_API_BASE: DEAD_ORIGIN,
    INSTAGRAM_OG_BASE: DEAD_ORIGIN,
    TNKTOK_API_BASE: DEAD_ORIGIN,
    SENTRY_DSN: '',
    ...extra,
  }
}
