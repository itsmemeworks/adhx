import * as Sentry from '@sentry/node'
import { createHmac } from 'node:crypto'

const SENTRY_DSN = process.env.SENTRY_DSN
// Release version is set at build time from package.json version
const SENTRY_RELEASE = process.env.SENTRY_RELEASE || process.env.npm_package_version
const MAX_CONTEXT_DEPTH = 5
const MAX_CONTEXT_ENTRIES = 25
const MAX_CONTEXT_NODES = 200
const MAX_SDK_DEPTH = 10
const MAX_SDK_ENTRIES = 50
const MAX_SDK_NODES = 1_000
const MAX_STRING_LENGTH = 1_000

const SECRET_KEYS = new Set([
  'accesstoken',
  'apikey',
  'authorization',
  'authorizationcode',
  'clientsecret',
  'codeverifier',
  'cookie',
  'cookies',
  'credential',
  'csrf',
  'csrftoken',
  'nonce',
  'oauthcode',
  'oauthstate',
  'password',
  'pkceverifier',
  'policy',
  'privatekey',
  'refreshtoken',
  'secret',
  'session',
  'sessionid',
  'setcookie',
  'signature',
  'token',
])

const USER_IDENTIFIER_KEYS = new Set([
  'accountid',
  'email',
  'emailaddress',
  'identityid',
  'identityids',
  'ownerid',
  'ownerids',
  'providerid',
  'providerids',
  'subjectid',
  'subjectids',
  'twitterid',
  'twitteruserid',
  'twitteruserids',
  'userid',
  'userids',
  'viewerid',
  'viewerids',
  'username',
  'xid',
  'xids',
  'xuserid',
  'xuserids',
  'ip',
  'ipaddress',
  'remoteaddr',
  'remoteaddress',
])

const IDENTITY_CONTAINERS = new Set([
  'account',
  'accounts',
  'identities',
  'identity',
  'provideridentity',
  'twitteruser',
  'user',
  'users',
  'xuser',
])

const IDENTITY_VALUE_KEYS = new Set(['externalid', 'id', 'identifier', 'subject', 'value'])
const ABSOLUTE_URL = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]+/gi
const RELATIVE_URL_WITH_SUFFIX = /(?:\/|\.\.?\/)[^\s"'<>?#]+[?#][^\s"'<>]*/gi
const QUOTED_ASSIGNMENT =
  /(["'])(access[_-]?token|api[_-]?key|authorization|authorization[_-]?code|client[_-]?secret|code[_-]?verifier|cookie|csrf(?:[_-]?token)?|nonce|oauth[_-]?(?:code|state)|password|pkce[_-]?verifier|refresh[_-]?token|secret|session(?:[_-]?id)?|set[_-]?cookie|signature|token|account[_-]?id|email(?:[_-]?address)?|identity[_-]?id|owner[_-]?id|provider[_-]?id|subject[_-]?id|twitter(?:[_-]?user)?[_-]?id|user[_-]?id|viewer[_-]?id|x(?:[_-]?user)?[_-]?id|username|ip[_-]?address)\1\s*:\s*(["'])((?:\\.|(?!\3)[\s\S])*)\3/gi
const AUTH_HEADER_ASSIGNMENT = /\b(authorization|proxy[_-]?authorization)\s*[:=]\s*[^\r\n,]+/gi
const COOKIE_HEADER_ASSIGNMENT = /\b(cookie|set[_-]?cookie)\s*[:=]\s*[^\r\n]+/gi
const SENSITIVE_ASSIGNMENT =
  /\b(access[_-]?token|api[_-]?key|authorization[_-]?code|client[_-]?secret|code[_-]?verifier|csrf(?:[_-]?token)?|nonce|oauth[_-]?(?:code|state)|password|pkce[_-]?verifier|refresh[_-]?token|secret|session(?:[_-]?id)?|signature|token)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi
const IDENTIFIER_ASSIGNMENT =
  /\b(account[_-]?id|email(?:[_-]?address)?|identity[_-]?id|owner[_-]?id|provider[_-]?id|subject[_-]?id|twitter(?:[_-]?user)?[_-]?id|user[_-]?id|viewer[_-]?id|x(?:[_-]?user)?[_-]?id|username|ip[_-]?address)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi
const EMAIL_ADDRESS = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi

function normalizeKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, '').toLowerCase()
}

function stableUserHash(userId: string): string {
  return sentryUserHash(userId)
}

function sentryUserHash(userId: string): string {
  const key =
    process.env.SENTRY_PII_HASH_KEY ||
    process.env.SESSION_SECRET ||
    process.env.TWITTER_CLIENT_SECRET ||
    'adhx:sentry-development-only'
  return createHmac('sha256', key)
    .update('adhx:sentry-user:v1\0')
    .update(userId)
    .digest('hex')
    .slice(0, 24)
}

function isSecretKey(key: string, path: string[] = []): boolean {
  const normalized = normalizeKey(key)
  const isRequestOrAuthMetadata = path.some((part) => {
    const normalizedPart = normalizeKey(part)
    return (
      normalizedPart.includes('request') ||
      normalizedPart.includes('auth') ||
      normalizedPart.includes('oauth') ||
      normalizedPart.includes('pkce') ||
      normalizedPart.endsWith('body')
    )
  })
  return (
    SECRET_KEYS.has(normalized) ||
    normalized.endsWith('apikey') ||
    normalized.endsWith('token') ||
    normalized.endsWith('secret') ||
    normalized.endsWith('authorization') ||
    normalized.endsWith('codeverifier') ||
    normalized.endsWith('cookie') ||
    normalized.endsWith('setcookie') ||
    (isRequestOrAuthMetadata && (normalized === 'code' || normalized === 'state'))
  )
}

function isUserIdentifierKey(key: string, path: string[]): boolean {
  const normalized = normalizeKey(key)
  if (USER_IDENTIFIER_KEYS.has(normalized)) return true
  if (
    [
      'accountid',
      'identityid',
      'ownerid',
      'providerid',
      'subjectid',
      'twitterid',
      'twitteruserid',
      'userid',
      'viewerid',
      'xid',
      'xuserid',
      'clientaddress',
      'ipaddress',
      'username',
    ].some((suffix) => normalized.endsWith(suffix))
  ) {
    return true
  }

  const parent = normalizeKey(path.at(-1) ?? '')
  return IDENTITY_CONTAINERS.has(parent) && IDENTITY_VALUE_KEYS.has(normalized)
}

function isIdentityContainerKey(key: string): boolean {
  return IDENTITY_CONTAINERS.has(normalizeKey(key))
}

function isSentryPseudonym(value: string): boolean {
  return /^sentry:[a-f0-9]{24}$/.test(value)
}

function pseudonymizeIdentifier(value: string | number): string {
  const raw = String(value)
  return isSentryPseudonym(raw) ? raw : `sentry:${sentryUserHash(raw)}`
}

function rememberSensitiveValue(sensitiveValues: Set<string>, value: string | number): void {
  const raw = String(value)
  if (!isSentryPseudonym(raw)) sensitiveValues.add(raw.slice(0, MAX_STRING_LENGTH))
}

function isUrlKey(key: string): boolean {
  return /(?:href|links?|uris?|urls?)$/.test(normalizeKey(key))
}

function isRequestQueryKey(key: string, path: string[]): boolean {
  const normalized = normalizeKey(key)
  return (
    (path.some((part) => normalizeKey(part).includes('request')) &&
      ['query', 'querystring', 'rawquery', 'searchparams'].includes(normalized)) ||
    normalized === 'urlquery' ||
    normalized.endsWith('querystring') ||
    normalized.endsWith('searchparams')
  )
}

function isSensitiveHeaderKey(key: string, path: string[]): boolean {
  const normalized = normalizeKey(key)
  const sensitiveNames = [
    'authorization',
    'cookie',
    'forwarded',
    'proxyauthorization',
    'setcookie',
    'xforwardedfor',
    'xrealip',
  ]
  if (normalizeKey(path.at(-1) ?? '') === 'headers') {
    return sensitiveNames.includes(normalized)
  }
  return sensitiveNames.some((name) => normalized.endsWith(`header${name}`))
}

function sanitizeUrl(value: string, sensitiveValues?: Set<string>): string | undefined {
  const trimmed = value.trim()
  const isAbsolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
  const isRelative = /^(?:\/|\.\/|\.\.\/)/.test(trimmed)
  if (!isAbsolute && !isRelative) return undefined

  try {
    const parsed = new URL(trimmed, isAbsolute ? undefined : 'https://sentry.invalid')
    if (!['http:', 'https:'].includes(parsed.protocol)) return undefined

    const withoutQuery = isAbsolute
      ? `${parsed.protocol}//${parsed.host}${parsed.pathname}`
      : parsed.pathname
    return sensitiveValues
      ? replaceKnownSensitiveValues(withoutQuery, sensitiveValues)
      : withoutQuery
  } catch {
    return undefined
  }
}

function replaceKnownSensitiveValues(value: string, sensitiveValues: Set<string>): string {
  let sanitized = value
  const values = [...sensitiveValues]
    .filter((item) => item.length >= 3 && !isSentryPseudonym(item))
    .sort((a, b) => b.length - a.length)
  for (const sensitiveValue of values) {
    sanitized = sanitized.replaceAll(sensitiveValue, '[redacted]')
  }
  return sanitized
}

function limitSanitizedText(value: string): string {
  return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…` : value
}

function sanitizeText(value: string, sensitiveValues: Set<string>, path: string[] = []): string {
  const wasTruncated = value.length > MAX_STRING_LENGTH
  const boundedValue = wasTruncated ? value.slice(0, MAX_STRING_LENGTH) : value
  const trimmed = boundedValue.trim()
  if (!wasTruncated && (trimmed.startsWith('{') || trimmed.startsWith('['))) {
    try {
      const parsed: unknown = JSON.parse(trimmed)
      const jsonSensitiveValues = new Set(sensitiveValues)
      collectSensitiveValues(parsed, jsonSensitiveValues, path, 0, {
        nodes: 0,
        seen: new WeakSet(),
        maxDepth: MAX_CONTEXT_DEPTH,
        maxEntries: MAX_CONTEXT_ENTRIES,
        maxNodes: MAX_CONTEXT_NODES,
      })
      const rootKey = path.at(-1) ?? 'json'
      const safeJson = sanitizeContextValue(parsed, rootKey, path.slice(0, -1), 0, {
        nodes: 0,
        seen: new WeakSet(),
        sensitiveValues: jsonSensitiveValues,
        maxDepth: MAX_CONTEXT_DEPTH,
        maxEntries: MAX_CONTEXT_ENTRIES,
        maxNodes: MAX_CONTEXT_NODES,
      })
      const serialized = JSON.stringify(safeJson)
      if (serialized !== undefined) return limitSanitizedText(serialized)
    } catch {
      // Upstream bodies are often JSON fragments; regex fallbacks below still
      // redact quoted property assignments without trusting their shape.
    }
  }

  let sanitized = boundedValue.replace(
    ABSOLUTE_URL,
    (url) => sanitizeUrl(url, sensitiveValues) ?? '[redacted-url]',
  )
  sanitized = sanitized.replace(
    RELATIVE_URL_WITH_SUFFIX,
    (url) => sanitizeUrl(url, sensitiveValues) ?? '[redacted-url]',
  )
  sanitized = sanitized.replace(
    QUOTED_ASSIGNMENT,
    (_match, keyQuote: string, key: string, valueQuote: string, rawValue: string) => {
      const replacement = isUserIdentifierKey(key, path)
        ? pseudonymizeIdentifier(rawValue)
        : '[redacted]'
      return `${keyQuote}${key}${keyQuote}:${valueQuote}${replacement}${valueQuote}`
    },
  )
  sanitized = sanitized.replace(AUTH_HEADER_ASSIGNMENT, '$1=[redacted]')
  sanitized = sanitized.replace(COOKIE_HEADER_ASSIGNMENT, '$1=[redacted]')
  sanitized = sanitized.replace(SENSITIVE_ASSIGNMENT, '$1=[redacted]')
  sanitized = sanitized.replace(IDENTIFIER_ASSIGNMENT, '$1=[redacted]')
  sanitized = sanitized.replace(EMAIL_ADDRESS, '[redacted-email]')
  sanitized = replaceKnownSensitiveValues(sanitized, sensitiveValues)
  return wasTruncated ? `${sanitized.slice(0, MAX_STRING_LENGTH)}…` : limitSanitizedText(sanitized)
}

interface CollectState {
  nodes: number
  seen: WeakSet<object>
  maxDepth: number
  maxEntries: number
  maxNodes: number
}

function collectSensitiveValues(
  value: unknown,
  sensitiveValues: Set<string>,
  path: string[] = [],
  depth = 0,
  state: CollectState = {
    nodes: 0,
    seen: new WeakSet(),
    maxDepth: MAX_CONTEXT_DEPTH,
    maxEntries: MAX_CONTEXT_ENTRIES,
    maxNodes: MAX_CONTEXT_NODES,
  },
): void {
  if (
    state.nodes >= state.maxNodes ||
    depth > state.maxDepth ||
    value === null ||
    typeof value !== 'object'
  ) {
    return
  }
  if (state.seen.has(value)) return
  state.nodes += 1
  state.seen.add(value)

  if (Array.isArray(value)) {
    value.slice(0, state.maxEntries).forEach((item) => {
      const containerKey = path.at(-1) ?? ''
      if (
        (isUserIdentifierKey(containerKey, path.slice(0, -1)) ||
          isIdentityContainerKey(containerKey)) &&
        (typeof item === 'string' || typeof item === 'number')
      ) {
        rememberSensitiveValue(sensitiveValues, item)
      }
      collectSensitiveValues(item, sensitiveValues, path, depth + 1, state)
    })
    return
  }

  Object.entries(value)
    .slice(0, state.maxEntries)
    .forEach(([key, child]) => {
      if (
        (isSecretKey(key, path) || isUserIdentifierKey(key, path) || isIdentityContainerKey(key)) &&
        (typeof child === 'string' || typeof child === 'number')
      ) {
        rememberSensitiveValue(sensitiveValues, child)
      }
      collectSensitiveValues(child, sensitiveValues, [...path, key], depth + 1, state)
    })
}

interface SanitizeState {
  nodes: number
  seen: WeakSet<object>
  sensitiveValues: Set<string>
  maxDepth: number
  maxEntries: number
  maxNodes: number
}

function sanitizeContextValue(
  value: unknown,
  key: string,
  path: string[],
  depth: number,
  state: SanitizeState,
): unknown {
  if (state.nodes >= state.maxNodes || depth > state.maxDepth) return undefined
  state.nodes += 1

  if (isSecretKey(key, path) || isRequestQueryKey(key, path) || isSensitiveHeaderKey(key, path)) {
    return undefined
  }

  const isIdentifier =
    isUserIdentifierKey(key, path) ||
    (isIdentityContainerKey(key) && (typeof value === 'string' || typeof value === 'number'))
  if (isIdentifier && (typeof value === 'string' || typeof value === 'number')) {
    return pseudonymizeIdentifier(value)
  }
  if (isUserIdentifierKey(key, path) && !Array.isArray(value)) return undefined

  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value

  if (typeof value === 'string') {
    if (isUrlKey(key)) return sanitizeUrl(value, state.sensitiveValues)

    const safeUrl = sanitizeUrl(value, state.sensitiveValues)
    if (safeUrl) return safeUrl
    return sanitizeText(value, state.sensitiveValues, [...path, key])
  }

  if (value instanceof URL) return sanitizeUrl(value.toString(), state.sensitiveValues)
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString()
  if (value instanceof Error) {
    return {
      name: sanitizeText(value.name, state.sensitiveValues, [...path, key, 'name']),
      message: sanitizeText(value.message, state.sensitiveValues, [...path, key, 'message']),
    }
  }

  if (typeof value !== 'object' || state.seen.has(value)) return undefined
  state.seen.add(value)

  if (Array.isArray(value)) {
    return value
      .slice(0, state.maxEntries)
      .map((item) => sanitizeContextValue(item, key, path, depth + 1, state))
      .filter((item) => item !== undefined)
  }

  const sanitized: Record<string, unknown> = {}
  for (const [childKey, childValue] of Object.entries(value).slice(0, state.maxEntries)) {
    const safeValue = sanitizeContextValue(childValue, childKey, [...path, key], depth + 1, state)
    if (safeValue !== undefined) sanitized[childKey] = safeValue
  }
  return sanitized
}

function sanitizeContext(context?: Record<string, unknown>): {
  context?: Record<string, unknown>
  sensitiveValues: Set<string>
} {
  const sensitiveValues = new Set<string>()
  if (!context) return { sensitiveValues }
  collectSensitiveValues(context, sensitiveValues)

  const sanitized: Record<string, unknown> = {}
  const state: SanitizeState = {
    nodes: 0,
    seen: new WeakSet(),
    sensitiveValues,
    maxDepth: MAX_CONTEXT_DEPTH,
    maxEntries: MAX_CONTEXT_ENTRIES,
    maxNodes: MAX_CONTEXT_NODES,
  }
  for (const [key, value] of Object.entries(context).slice(0, MAX_CONTEXT_ENTRIES)) {
    const safeValue = sanitizeContextValue(value, key, [], 0, state)
    if (safeValue !== undefined) sanitized[key] = safeValue
  }
  return { context: sanitized, sensitiveValues }
}

function sanitizeSdkPayload<T>(payload: T): T {
  const sensitiveValues = new Set<string>()
  const limits = {
    maxDepth: MAX_SDK_DEPTH,
    maxEntries: MAX_SDK_ENTRIES,
    maxNodes: MAX_SDK_NODES,
  }
  collectSensitiveValues(payload, sensitiveValues, [], 0, {
    nodes: 0,
    seen: new WeakSet(),
    ...limits,
  })
  return sanitizeContextValue(payload, 'event', [], 0, {
    nodes: 0,
    seen: new WeakSet(),
    sensitiveValues,
    ...limits,
  }) as T
}

function sanitizeException(error: Error | unknown, sensitiveValues: Set<string>): Error {
  const source = error instanceof Error ? error : new Error(String(error))
  const sanitized = new Error(sanitizeText(source.message, sensitiveValues))
  sanitized.name = sanitizeText(source.name, sensitiveValues)
  if (source.stack) sanitized.stack = sanitizeText(source.stack, sensitiveValues)
  return sanitized
}

export function initSentry() {
  if (Sentry.isInitialized() || !SENTRY_DSN) {
    return
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    // Release tracking - links errors to specific versions
    release: SENTRY_RELEASE ? `adhx@${SENTRY_RELEASE}` : undefined,
    // Performance monitoring sample rate (20% provides good visibility without quota issues)
    tracesSampleRate: 0.2,
    // Only send errors in production
    enabled: process.env.NODE_ENV === 'production',
    // Preserve crash capture and error enrichment defaults, but exclude the
    // installed SDK's composite `Http` integration. It wraps
    // http.Server.emit, which recurses when duplicated across Next chunks.
    integrations: (defaultIntegrations) =>
      defaultIntegrations.filter((integration) => integration.name !== 'Http'),
    sendDefaultPii: false,
    beforeSend: (event) => sanitizeSdkPayload(event),
    beforeBreadcrumb: (breadcrumb) => sanitizeSdkPayload(breadcrumb),
    beforeSendTransaction: (event) => sanitizeSdkPayload(event),
    beforeSendSpan: (span) => sanitizeSdkPayload(span),
  })
}

/**
 * Get the current Sentry release identifier
 */
export function getSentryRelease(): string | undefined {
  return SENTRY_RELEASE ? `adhx@${SENTRY_RELEASE}` : undefined
}

export function captureException(error: Error | unknown, context?: Record<string, unknown>) {
  if (!SENTRY_DSN) {
    console.error('[Sentry disabled] Error:', error)
    return
  }

  initSentry()
  const sanitized = sanitizeContext(context)
  const safeError = sanitizeException(error, sanitized.sensitiveValues)

  if (sanitized.context) {
    Sentry.withScope((scope) => {
      Object.entries(sanitized.context ?? {}).forEach(([key, value]) => {
        scope.setExtra(key, value)
      })
      Sentry.captureException(safeError)
    })
  } else {
    Sentry.captureException(safeError)
  }
}

export function captureMessage(
  message: string,
  level: 'info' | 'warning' | 'error' = 'info',
  context?: Record<string, unknown>,
) {
  if (!SENTRY_DSN) {
    console.warn(`[Sentry disabled] ${level}: ${message}`)
    return
  }

  initSentry()
  const sanitized = sanitizeContext(context)
  const safeMessage = sanitizeText(message, sanitized.sensitiveValues)

  if (sanitized.context) {
    Sentry.withScope((scope) => {
      Object.entries(sanitized.context ?? {}).forEach(([key, value]) => {
        scope.setExtra(key, value)
      })
      Sentry.captureMessage(safeMessage, level)
    })
  } else {
    Sentry.captureMessage(safeMessage, level)
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
export function metricCount(name: string, value: number = 1, attributes?: MetricAttributes) {
  if (!SENTRY_DSN) return
  initSentry()
  Sentry.metrics.count(name, value, attributes ? { attributes } : undefined)
}

/**
 * Track a gauge metric (value that goes up and down)
 * Use for: queue depth, active users, items in cart
 */
export function metricGauge(name: string, value: number, attributes?: MetricAttributes) {
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
  attributes?: MetricAttributes,
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
  authFailed: (reason: string) => metricCount('auth.oauth_failed', 1, { reason }),

  // Sync operations
  syncStarted: (syncType: 'full' | 'incremental') =>
    metricCount('sync.started', 1, { sync_type: syncType }),
  syncCompleted: (bookmarksCount: number, pagesCount: number, durationMs: number) => {
    metricCount('sync.completed')
    metricCount('sync.bookmarks_synced', bookmarksCount)
    metricCount('sync.pages_fetched', pagesCount)
    metricDistribution('sync.duration', durationMs, 'millisecond')
  },
  syncFailed: (reason: string) => metricCount('sync.failed', 1, { reason }),

  // Bookmark interactions
  bookmarkViewed: () => metricCount('bookmark.viewed'),
  bookmarkReadToggled: (isArchived: boolean) =>
    metricCount('bookmark.read_toggled', 1, { new_state: isArchived ? 'read' : 'unread' }),
  bookmarkTagged: (tagCount: number) => metricCount('bookmark.tagged', 1, { tag_count: tagCount }),
  bookmarkAdded: (source: 'manual' | 'url_prefix' | 'pwa_share') =>
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
  feedFiltered: (filterType: string) => metricCount('feed.filtered', 1, { filter: filterType }),

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

  // Media proxy: FxTwitter reports the underlying tweet as gone (deleted/
  // private/suspended) — an expected outcome, not an error, so it's a
  // metric rather than a captureException.
  mediaUnavailable: (endpoint: string, upstreamStatus: number) =>
    metricCount('media.unavailable', 1, { endpoint, upstream_status: upstreamStatus }),

  // Theater (theater-first home/shared/collection surfaces)
  theaterOpened: (surface: 'home' | 'shared' | 'collection') =>
    metricCount('theater.opened', 1, { surface }),
  theaterAdvanced: (direction: 'next' | 'prev', input: 'key' | 'swipe' | 'click') =>
    metricCount('theater.advanced', 1, { direction, input }),
  theaterSoundEnabled: () => metricCount('theater.sound_enabled'),
  theaterCaughtUpReached: () => metricCount('theater.caught_up_reached'),
  theaterPreviewPulse: (platform: string) => metricCount('theater.preview_pulse', 1, { platform }),

  // Daily active users (hashed for privacy - no raw PII sent to third parties)
  trackUser: (userId: string) => {
    metricCount('users.daily_active', 1, { user_hash: stableUserHash(userId) })
  },
}

export { Sentry }
