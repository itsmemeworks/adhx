import * as Sentry from '@sentry/node'

const SENTRY_DSN = process.env.SENTRY_DSN
// Release version is set at build time from package.json version
const SENTRY_RELEASE = process.env.SENTRY_RELEASE || process.env.npm_package_version

let initialized = false

export function initSentry() {
  if (initialized || !SENTRY_DSN) {
    return
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    // Release tracking - links errors to specific versions
    release: SENTRY_RELEASE ? `adhx@${SENTRY_RELEASE}` : undefined,
    // Performance monitoring sample rate
    tracesSampleRate: 1.0,
    // Only send errors in production
    enabled: process.env.NODE_ENV === 'production',
    // Automatically capture unhandled promise rejections
    integrations: [
      Sentry.onUnhandledRejectionIntegration({ mode: 'warn' }),
    ],
  })

  initialized = true
}

/**
 * Get the current Sentry release identifier
 */
export function getSentryRelease(): string | undefined {
  return SENTRY_RELEASE ? `adhx@${SENTRY_RELEASE}` : undefined
}

export function captureException(
  error: Error | unknown,
  context?: Record<string, unknown>
) {
  if (!SENTRY_DSN) {
    console.error('[Sentry disabled] Error:', error)
    return
  }

  initSentry()

  if (context) {
    Sentry.withScope((scope) => {
      Object.entries(context).forEach(([key, value]) => {
        scope.setExtra(key, value)
      })
      Sentry.captureException(error)
    })
  } else {
    Sentry.captureException(error)
  }
}

export function captureMessage(
  message: string,
  level: 'info' | 'warning' | 'error' = 'info',
  context?: Record<string, unknown>
) {
  if (!SENTRY_DSN) {
    console.warn(`[Sentry disabled] ${level}: ${message}`)
    return
  }

  initSentry()

  if (context) {
    Sentry.withScope((scope) => {
      Object.entries(context).forEach(([key, value]) => {
        scope.setExtra(key, value)
      })
      Sentry.captureMessage(message, level)
    })
  } else {
    Sentry.captureMessage(message, level)
  }
}

// ============================================================================
// METRICS - Track user behavior and performance
// Sentry SDK 10.x uses count(), gauge(), distribution() with attributes option
// ============================================================================

type MetricAttributes = Record<string, string | number | boolean>

/**
 * Increment a counter metric
 * Use for: button clicks, API calls, events that happen
 */
export function metricCount(
  name: string,
  value: number = 1,
  attributes?: MetricAttributes
) {
  if (!SENTRY_DSN) return
  initSentry()
  Sentry.metrics.count(name, value, attributes ? { attributes } : undefined)
}

/**
 * Track a gauge metric (value that goes up and down)
 * Use for: queue depth, active users, items in cart
 */
export function metricGauge(
  name: string,
  value: number,
  attributes?: MetricAttributes
) {
  if (!SENTRY_DSN) return
  initSentry()
  Sentry.metrics.gauge(name, value, attributes ? { attributes } : undefined)
}

/**
 * Track a distribution metric (for aggregating values)
 * Use for: response times, file sizes, durations
 */
export function metricDistribution(
  name: string,
  value: number,
  unit?: 'millisecond' | 'second' | 'byte' | 'none',
  attributes?: MetricAttributes
) {
  if (!SENTRY_DSN) return
  initSentry()
  Sentry.metrics.distribution(name, value, {
    unit,
    ...(attributes && { attributes }),
  })
}

// ============================================================================
// PRE-DEFINED METRICS - Consistent naming for common events
// ============================================================================

export const metrics = {
  // Auth/Onboarding
  authStarted: () => metricCount('auth.oauth_started'),
  authCompleted: (isNewUser: boolean) =>
    metricCount('auth.oauth_completed', 1, { is_new_user: isNewUser }),
  authFailed: (reason: string) =>
    metricCount('auth.oauth_failed', 1, { reason }),

  // Sync operations
  syncStarted: (syncType: 'full' | 'incremental') =>
    metricCount('sync.started', 1, { sync_type: syncType }),
  syncCompleted: (
    bookmarksCount: number,
    pagesCount: number,
    durationMs: number
  ) => {
    metricCount('sync.completed')
    metricCount('sync.bookmarks_synced', bookmarksCount)
    metricCount('sync.pages_fetched', pagesCount)
    metricDistribution('sync.duration', durationMs, 'millisecond')
  },
  syncFailed: (reason: string) => metricCount('sync.failed', 1, { reason }),

  // Bookmark interactions
  bookmarkViewed: () => metricCount('bookmark.viewed'),
  bookmarkReadToggled: (isRead: boolean) =>
    metricCount('bookmark.read_toggled', 1, { new_state: isRead ? 'read' : 'unread' }),
  bookmarkTagged: (tagCount: number) =>
    metricCount('bookmark.tagged', 1, { tag_count: tagCount }),
  bookmarkAdded: (source: 'manual' | 'url_prefix') =>
    metricCount('bookmark.added', 1, { source }),
  bookmarkDeleted: () => metricCount('bookmark.deleted'),

  // Feed/Search
  feedLoaded: (itemCount: number, filterType?: string) =>
    metricCount('feed.loaded', 1, {
      item_count: itemCount,
      ...(filterType && { filter: filterType }),
    }),
  feedSearched: (hasResults: boolean, resultCount: number) =>
    metricCount('feed.searched', 1, {
      has_results: hasResults,
      result_count: resultCount,
    }),
  feedFiltered: (filterType: string) =>
    metricCount('feed.filtered', 1, { filter: filterType }),

  // Settings
  settingsChanged: (setting: string, value: string) =>
    metricCount('settings.changed', 1, { setting, value }),
  dataCleared: () => metricCount('settings.data_cleared'),

  // API performance
  apiLatency: (endpoint: string, durationMs: number, statusCode: number) =>
    metricDistribution('api.latency', durationMs, 'millisecond', {
      endpoint,
      status: statusCode,
    }),

  // Daily active users (track activity with user_id attribute for unique counting)
  trackUser: (userId: string) =>
    metricCount('users.daily_active', 1, { user_id: userId }),
}

export { Sentry }
