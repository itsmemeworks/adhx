import { ALL_PLATFORMS } from '@/lib/platform/networks'

/**
 * Allowlisted analytics event names and dimensions.
 *
 * The write path (`recordAnalytic` / POST /api/analytics) only accepts these
 * values — never free-form strings from the client — so the log cannot be
 * used as a stored-XSS or spam channel the way a public pulse caption could.
 */

export const ANALYTIC_EVENTS = [
  'post.view',
  'post.save',
  'post.share',
  'post.send',
  'post.play',
  'post.copy',
  'post.open',
  'post.tag',
  'post.untag',
  'post.archive',
  'post.unarchive',
  'post.delete',
  'playlist.view',
  'playlist.clone',
  'playlist.publish',
  'playlist.unpublish',
  'auth.start',
  'auth.complete',
  'auth.fail',
  'sync.complete',
  'sync.auto',
  'theater.open',
  'shortcut.install',
  'welcome.complete',
  // Admin analytics (counts only). `app.open`: someone came back after half an
  // hour away (source = web | ios | android | phone). `search.found` /
  // `search.none`: a finished search, with its mode as the source (meaning |
  // words), never its words. `post.finish`: a video played to its end.
  // `channel.play` / `channel.keep`: a shared channel's queue was played or
  // kept (surface = group | channel; the channel's key, `slug` or
  // `username/tag`, goes in bookmark_id).
  'app.open',
  'search.found',
  'search.none',
  'post.finish',
  'channel.play',
  'channel.keep',
] as const

export type AnalyticEventName = (typeof ANALYTIC_EVENTS)[number]

/** Events a browser is allowed to POST. Server mutations write themselves. */
export const CLIENT_ANALYTIC_EVENTS = [
  'post.send',
  'post.play',
  'post.finish',
  'post.copy',
  'post.open',
  'shortcut.install',
] as const satisfies readonly AnalyticEventName[]

export type ClientAnalyticEventName = (typeof CLIENT_ANALYTIC_EVENTS)[number]

export const ANALYTIC_PLATFORMS = ALL_PLATFORMS
export type AnalyticPlatform = (typeof ANALYTIC_PLATFORMS)[number]

export const ANALYTIC_CONTENT_TYPES = ['video', 'photo', 'text', 'article'] as const
export type AnalyticContentType = (typeof ANALYTIC_CONTENT_TYPES)[number]

export const ANALYTIC_SURFACES = [
  'live',
  'collection',
  'playlist',
  'shared',
  'library',
  'trending',
  'preview',
  'welcome',
  'settings',
  'group',
  'channel',
] as const
export type AnalyticSurface = (typeof ANALYTIC_SURFACES)[number]

export const ANALYTIC_SOURCES = [
  'manual',
  'url_prefix',
  'pwa_share',
  'sync',
  'clone',
  'shortcut',
  'oauth',
  'email',
  'invite',
  'share',
  'download',
  'web',
  'ios',
  'android',
  'phone',
  'meaning',
  'words',
] as const
export type AnalyticSource = (typeof ANALYTIC_SOURCES)[number]

export function isAnalyticEventName(value: unknown): value is AnalyticEventName {
  return typeof value === 'string' && (ANALYTIC_EVENTS as readonly string[]).includes(value)
}

export function isClientAnalyticEventName(value: unknown): value is ClientAnalyticEventName {
  return typeof value === 'string' && (CLIENT_ANALYTIC_EVENTS as readonly string[]).includes(value)
}

export function isAnalyticPlatform(value: unknown): value is AnalyticPlatform {
  return typeof value === 'string' && (ANALYTIC_PLATFORMS as readonly string[]).includes(value)
}

export function isAnalyticContentType(value: unknown): value is AnalyticContentType {
  return typeof value === 'string' && (ANALYTIC_CONTENT_TYPES as readonly string[]).includes(value)
}

export function isAnalyticSurface(value: unknown): value is AnalyticSurface {
  return typeof value === 'string' && (ANALYTIC_SURFACES as readonly string[]).includes(value)
}

export function isAnalyticSource(value: unknown): value is AnalyticSource {
  return typeof value === 'string' && (ANALYTIC_SOURCES as readonly string[]).includes(value)
}
