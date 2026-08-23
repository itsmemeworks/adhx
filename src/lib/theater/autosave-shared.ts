/**
 * When a signed-in viewer lands on a shared preview, save that lead post
 * automatically — but only for a *new open* (URL prefix, paste, /share),
 * never because they refreshed a theater-rewritten address bar or clicked
 * through from /trending.
 *
 * The decision is a pure function so the matrix lives in unit tests. The
 * shell only supplies what the browser already knows (navigation type,
 * document path vs current path, a one-shot paste/share intent).
 */

import type { TheaterMode } from '@/components/theater/types'

export const PREVIEW_OPEN_INTENT_KEY = 'adhx-preview-open-intent'

export type PreviewOpenIntent = 'paste' | 'share'
export type NavigationType = 'navigate' | 'reload' | 'back_forward' | 'prerender' | 'unknown'
export type SharedAutoSaveReason = 'save-intent' | 'document-open' | 'paste' | 'share'

export interface SharedAutoSaveInput {
  mode: TheaterMode
  hasSharedItem: boolean
  sharedUnavailable: boolean
  authenticated: boolean
  /** Landing with `?save=1` after a sign-in round-trip — explicit, even on reload. */
  saveIntentOnLoad: boolean
  navigationType: NavigationType
  /** Path of the document that was actually loaded (PerformanceNavigationTiming.name). */
  documentPath: string
  /** Path the shell is mounted on now (`window.location.pathname`). */
  currentPath: string
  openIntent: PreviewOpenIntent | null
}

const PREVIEW_PATHS = [
  /^\/[A-Za-z0-9_]{1,15}\/status\/\d+\/?$/,
  /^\/reels?\/[A-Za-z0-9_-]+\/?$/,
  /^\/@[A-Za-z0-9._]{1,30}\/video\/\d{6,25}\/?$/,
  /^\/shorts\/[A-Za-z0-9_-]{1,16}\/?$/,
]

/** On-ADHX preview routes — the only places a shared-lead autosave can fire. */
export function isPreviewPath(path: string): boolean {
  const pathname = path.split('?')[0] ?? ''
  return PREVIEW_PATHS.some((re) => re.test(pathname))
}

export function isSharePath(path: string): boolean {
  const pathname = (path.split('?')[0] ?? '').replace(/\/$/, '') || '/'
  return pathname === '/share'
}

export function sharedAutoSaveReason(input: SharedAutoSaveInput): SharedAutoSaveReason | null {
  if (input.mode !== 'shared') return null
  if (!input.hasSharedItem) return null
  if (input.sharedUnavailable) return null
  if (!input.authenticated) return null

  // Explicit post-save after sign-in. Must win over the reload skip — the
  // OAuth bounce often lands as a fresh document on the same preview URL.
  if (input.saveIntentOnLoad) return 'save-intent'

  if (input.navigationType === 'reload' || input.navigationType === 'back_forward') return null

  if (input.openIntent === 'paste') return 'paste'
  if (input.openIntent === 'share') return 'share'

  // /share client-replaces to the preview: the document was loaded at
  // /share, so navigation.type stays `navigate` but the paths diverge.
  if (isSharePath(input.documentPath) && isPreviewPath(input.currentPath)) return 'share'

  // Prefix / bookmarklet / typed URL / hard paste (`location.assign`):
  // this document *is* the preview.
  const documentIsThisPreview =
    normalizePath(input.documentPath) === normalizePath(input.currentPath) &&
    isPreviewPath(input.currentPath)
  if (documentIsThisPreview && input.navigationType !== 'prerender') return 'document-open'

  return null
}

function normalizePath(path: string): string {
  const pathname = path.split('?')[0] ?? ''
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1)
  return pathname
}

export function markPreviewOpenIntent(kind: PreviewOpenIntent): void {
  try {
    sessionStorage.setItem(PREVIEW_OPEN_INTENT_KEY, kind)
  } catch {
    // private mode / disabled storage — the hard-nav cases still save
    // via document-open; client hops without the flag simply won't.
  }
}

export function peekPreviewOpenIntent(): PreviewOpenIntent | null {
  try {
    const value = sessionStorage.getItem(PREVIEW_OPEN_INTENT_KEY)
    return value === 'paste' || value === 'share' ? value : null
  } catch {
    return null
  }
}

export function consumePreviewOpenIntent(): PreviewOpenIntent | null {
  const value = peekPreviewOpenIntent()
  try {
    sessionStorage.removeItem(PREVIEW_OPEN_INTENT_KEY)
  } catch {
    // ignore
  }
  return value
}

export function readNavigationType(): NavigationType {
  if (typeof performance === 'undefined') return 'unknown'
  const entries = performance.getEntriesByType('navigation')
  const nav = entries[0] as PerformanceNavigationTiming | undefined
  if (
    nav?.type === 'navigate' ||
    nav?.type === 'reload' ||
    nav?.type === 'back_forward' ||
    nav?.type === 'prerender'
  ) {
    return nav.type
  }
  const legacy = (performance as Performance & { navigation?: { type?: number } }).navigation
  if (legacy?.type === 1) return 'reload'
  if (legacy?.type === 2) return 'back_forward'
  if (legacy?.type === 0) return 'navigate'
  return 'unknown'
}

export function readDocumentPath(): string {
  if (typeof performance === 'undefined') return ''
  const entries = performance.getEntriesByType('navigation')
  const nav = entries[0] as PerformanceNavigationTiming | undefined
  if (nav?.name) {
    try {
      return new URL(nav.name).pathname
    } catch {
      // nav.name is sometimes already a path in tests
      return nav.name.split('?')[0] ?? ''
    }
  }
  return ''
}

export function readSharedOpenContext(): {
  navigationType: NavigationType
  documentPath: string
  currentPath: string
  openIntent: PreviewOpenIntent | null
} {
  return {
    navigationType: readNavigationType(),
    documentPath: readDocumentPath(),
    currentPath: typeof window !== 'undefined' ? window.location.pathname : '',
    openIntent: peekPreviewOpenIntent(),
  }
}

/** In-session dedupe so React Strict Mode doesn't POST twice. */
const attemptedKeys = new Set<string>()

export function claimSharedAutoSave(key: string): boolean {
  if (attemptedKeys.has(key)) return false
  attemptedKeys.add(key)
  return true
}

/** Test-only: drop the in-session dedupe so cases can share a post id. */
export function resetSharedAutoSaveAttempts(): void {
  attemptedKeys.clear()
}
