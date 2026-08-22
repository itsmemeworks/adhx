import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  E2E_DB_RELATIVE,
  E2E_FX_ORIGIN,
  E2E_ORIGIN,
  E2E_PORT,
  E2E_SESSION_SECRET,
} from './constants'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const E2E_ROOT = ROOT
export const E2E_DB_PATH = path.join(ROOT, E2E_DB_RELATIVE)

/** Env for migrate / seed / the dedicated Next process on :3002. */
export function e2eProcessEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    DATABASE_PATH: E2E_DB_PATH,
    SESSION_SECRET: E2E_SESSION_SECRET,
    TWITTER_CLIENT_ID: 'e2e-twitter-client',
    TWITTER_CLIENT_SECRET: 'e2e-twitter-secret',
    NEXT_PUBLIC_APP_URL: E2E_ORIGIN,
    PORT: String(E2E_PORT),
    FXTWITTER_API_BASE: E2E_FX_ORIGIN,
    INSTAGRAM_OG_BASE: E2E_FX_ORIGIN,
    TNKTOK_API_BASE: E2E_FX_ORIGIN,
    YOUTUBE_OEMBED_BASE: E2E_FX_ORIGIN,
    NEXT_DIST_DIR: '.next-e2e',
    ...extra,
  }
}
