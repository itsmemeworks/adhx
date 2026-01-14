import * as Sentry from '@sentry/node'

const SENTRY_DSN = process.env.SENTRY_DSN

let initialized = false

export function initSentry() {
  if (initialized || !SENTRY_DSN) {
    return
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 1.0,
    // Only send errors in production
    enabled: process.env.NODE_ENV === 'production',
  })

  initialized = true
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
