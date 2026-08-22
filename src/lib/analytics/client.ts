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
  const id = opts?.id
  if (platform && !isAnalyticPlatform(platform)) return
  if (opts?.source && !isAnalyticSource(opts.source)) return
  if (opts?.surface && !isAnalyticSurface(opts.surface)) return

  void fetch('/api/analytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      platform: platform ?? undefined,
      id: id || undefined,
      surface: opts?.surface,
      source: opts?.source,
      tag: opts?.tag,
    }),
    keepalive: true,
  }).catch(() => {
    /* analytics must never break the UI */
  })
}
