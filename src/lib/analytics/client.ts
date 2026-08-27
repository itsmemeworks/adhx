/**
 * Browser fire-and-forget ping for UI actions the server cannot see
 * (copy link, open original, file send, shortcut install). Identifiers
 * only — the server resolves type and ignores anything else.
 */

import {
  isClientAnalyticEventName,
  isAnalyticPlatform,
  isAnalyticSource,
  isAnalyticSurface,
  type ClientAnalyticEventName,
} from './events'

const ID_MAX = 80

export function pingAnalytic(
  name: ClientAnalyticEventName,
  opts?: {
    platform?: string
    id?: string
    surface?: string
    source?: string
    tag?: string
  },
): void {
  if (typeof window === 'undefined' || !isClientAnalyticEventName(name)) return
  const platform = opts?.platform
  const id = opts?.id?.trim()
  const isPostEvent = name.startsWith('post.')
  if (isPostEvent && (!isAnalyticPlatform(platform) || !id || id.length > ID_MAX)) return
  if (opts?.source && !isAnalyticSource(opts.source)) return
  if (opts?.surface && !isAnalyticSurface(opts.surface)) return

  void fetch('/api/analytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      platform: isPostEvent ? platform : undefined,
      id: isPostEvent ? id : undefined,
      surface: opts?.surface,
      source: opts?.source,
      tag: isPostEvent ? opts?.tag : undefined,
    }),
    keepalive: true,
  }).catch(() => {
    /* analytics must never break the UI */
  })
}
