/**
 * Sync Configuration
 *
 * Centralized configuration for sync-related settings.
 * Values can be overridden via environment variables.
 */

/**
 * Default cooldown between syncs in milliseconds (15 minutes)
 */
const DEFAULT_COOLDOWN_MS = 15 * 60 * 1000

/**
 * Get the sync cooldown duration in milliseconds.
 *
 * Can be configured via SYNC_COOLDOWN_MINUTES environment variable.
 * Defaults to 15 minutes if not set.
 *
 * @example
 * // In .env.local
 * SYNC_COOLDOWN_MINUTES=60  // 1 hour cooldown
 */
export function getSyncCooldownMs(): number {
  const envMinutes = process.env.SYNC_COOLDOWN_MINUTES

  if (envMinutes) {
    const minutes = parseInt(envMinutes, 10)
    if (!isNaN(minutes) && minutes > 0) {
      return minutes * 60 * 1000
    }
  }

  return DEFAULT_COOLDOWN_MS
}

/**
 * Sync cooldown in milliseconds.
 * Use getSyncCooldownMs() for dynamic access that respects env changes.
 */
export const SYNC_COOLDOWN_MS = getSyncCooldownMs()
