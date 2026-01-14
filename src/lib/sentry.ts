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

export { Sentry }
