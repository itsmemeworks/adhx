/**
 * @vitest-environment jsdom
 *
 * Shared-lead autosave: only a new open (prefix / paste / /share) or
 * `?save=1` saves. Refresh, back/forward, and in-app hops do not.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  sharedAutoSaveReason,
  isPreviewPath,
  isSharePath,
  markPreviewOpenIntent,
  peekPreviewOpenIntent,
  consumePreviewOpenIntent,
  readNavigationType,
  readDocumentPath,
  readSharedOpenContext,
  claimSharedAutoSave,
  resetSharedAutoSaveAttempts,
  PREVIEW_OPEN_INTENT_KEY,
  type SharedAutoSaveInput,
} from '@/lib/theater/autosave-shared'

function base(overrides: Partial<SharedAutoSaveInput> = {}): SharedAutoSaveInput {
  return {
    mode: 'shared',
    hasSharedItem: true,
    sharedUnavailable: false,
    authenticated: true,
    saveIntentOnLoad: false,
    navigationType: 'navigate',
    documentPath: '/naval/status/123',
    currentPath: '/naval/status/123',
    openIntent: null,
    ...overrides,
  }
}

describe('isPreviewPath', () => {
  it('accepts the four preview routes', () => {
    expect(isPreviewPath('/naval/status/123')).toBe(true)
    expect(isPreviewPath('/reels/DaigXfxAkrE')).toBe(true)
    expect(isPreviewPath('/reel/DaigXfxAkrE')).toBe(true)
    expect(isPreviewPath('/@sophieraiin/video/7619017281691045134')).toBe(true)
    expect(isPreviewPath('/shorts/Y9aytLYBajw')).toBe(true)
  })

  it('rejects app chrome, playlists, share, and the resolver', () => {
    expect(isPreviewPath('/')).toBe(false)
    expect(isPreviewPath('/trending')).toBe(false)
    expect(isPreviewPath('/library')).toBe(false)
    expect(isPreviewPath('/saved')).toBe(false)
    expect(isPreviewPath('/share')).toBe(false)
    expect(isPreviewPath('/t/naval/best-of')).toBe(false)
    expect(isPreviewPath('/settings')).toBe(false)
    expect(isPreviewPath('/api/tiktok/resolve')).toBe(false)
    expect(isPreviewPath('/naval/status/abc')).toBe(false)
  })
})

describe('isSharePath', () => {
  it('matches /share with or without a trailing slash or query', () => {
    expect(isSharePath('/share')).toBe(true)
    expect(isSharePath('/share/')).toBe(true)
    expect(isSharePath('/share?url=https://x.com/a/status/1')).toBe(true)
    expect(isSharePath('/shared')).toBe(false)
    expect(isSharePath('/library')).toBe(false)
  })
})

describe('sharedAutoSaveReason', () => {
  it('saves a full-document landing on this preview (prefix / typed URL)', () => {
    expect(sharedAutoSaveReason(base())).toBe('document-open')
    expect(
      sharedAutoSaveReason(
        base({
          documentPath: '/reels/abc',
          currentPath: '/reels/abc',
        }),
      ),
    ).toBe('document-open')
    expect(
      sharedAutoSaveReason(
        base({
          documentPath: '/@user/video/7619017281691045134',
          currentPath: '/@user/video/7619017281691045134',
        }),
      ),
    ).toBe('document-open')
    expect(
      sharedAutoSaveReason(
        base({
          documentPath: '/shorts/Y9aytLYBajw',
          currentPath: '/shorts/Y9aytLYBajw',
        }),
      ),
    ).toBe('document-open')
  })

  it('skips a refresh of a theater-rewritten preview URL', () => {
    expect(sharedAutoSaveReason(base({ navigationType: 'reload' }))).toBeNull()
  })

  it('skips back/forward onto a preview', () => {
    expect(sharedAutoSaveReason(base({ navigationType: 'back_forward' }))).toBeNull()
  })

  it('skips an in-app hop from /trending (client nav, no paste/share intent)', () => {
    expect(
      sharedAutoSaveReason(
        base({
          documentPath: '/trending',
          currentPath: '/naval/status/123',
        }),
      ),
    ).toBeNull()
  })

  it('skips an in-app hop from live home', () => {
    expect(
      sharedAutoSaveReason(
        base({
          documentPath: '/',
          currentPath: '/naval/status/123',
        }),
      ),
    ).toBeNull()
  })

  it('saves a paste intent even when the document was loaded elsewhere', () => {
    expect(
      sharedAutoSaveReason(
        base({
          documentPath: '/library',
          currentPath: '/naval/status/123',
          openIntent: 'paste',
        }),
      ),
    ).toBe('paste')
  })

  it('does not let paste intent override a reload', () => {
    expect(
      sharedAutoSaveReason(
        base({
          navigationType: 'reload',
          openIntent: 'paste',
        }),
      ),
    ).toBeNull()
  })

  it('saves a /share client-replace (document is /share, current is the preview)', () => {
    expect(
      sharedAutoSaveReason(
        base({
          documentPath: '/share',
          currentPath: '/naval/status/123',
        }),
      ),
    ).toBe('share')
    expect(
      sharedAutoSaveReason(
        base({
          documentPath: '/',
          currentPath: '/naval/status/123',
          openIntent: 'share',
        }),
      ),
    ).toBe('share')
  })

  it('lets ?save=1 win even on reload (sign-in return)', () => {
    expect(
      sharedAutoSaveReason(
        base({
          saveIntentOnLoad: true,
          navigationType: 'reload',
        }),
      ),
    ).toBe('save-intent')
  })

  it('does not save when signed out', () => {
    expect(sharedAutoSaveReason(base({ authenticated: false }))).toBeNull()
    expect(sharedAutoSaveReason(base({ authenticated: false, saveIntentOnLoad: true }))).toBeNull()
  })

  it('does not save home, personal, or playlist mode — even on a preview-looking path', () => {
    expect(sharedAutoSaveReason(base({ mode: 'home' }))).toBeNull()
    expect(sharedAutoSaveReason(base({ mode: 'personal' }))).toBeNull()
    expect(sharedAutoSaveReason(base({ mode: 'playlist' }))).toBeNull()
  })

  it('does not save an unavailable / hidden lead', () => {
    expect(sharedAutoSaveReason(base({ sharedUnavailable: true }))).toBeNull()
    expect(
      sharedAutoSaveReason(base({ sharedUnavailable: true, saveIntentOnLoad: true })),
    ).toBeNull()
  })

  it('does not save without a shared lead item', () => {
    expect(sharedAutoSaveReason(base({ hasSharedItem: false }))).toBeNull()
  })

  it('does not treat a matching non-preview path as a document-open', () => {
    expect(
      sharedAutoSaveReason(
        base({
          documentPath: '/library',
          currentPath: '/library',
        }),
      ),
    ).toBeNull()
  })
})

describe('preview open intent (sessionStorage)', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('marks, peeks, and consumes once', () => {
    expect(peekPreviewOpenIntent()).toBeNull()
    markPreviewOpenIntent('paste')
    expect(sessionStorage.getItem(PREVIEW_OPEN_INTENT_KEY)).toBe('paste')
    expect(peekPreviewOpenIntent()).toBe('paste')
    expect(consumePreviewOpenIntent()).toBe('paste')
    expect(peekPreviewOpenIntent()).toBeNull()
    expect(consumePreviewOpenIntent()).toBeNull()
  })

  it('ignores junk values', () => {
    sessionStorage.setItem(PREVIEW_OPEN_INTENT_KEY, 'trending')
    expect(peekPreviewOpenIntent()).toBeNull()
  })
})

describe('readNavigationType / readDocumentPath', () => {
  const original = performance.getEntriesByType

  afterEach(() => {
    performance.getEntriesByType = original
  })

  it('reads PerformanceNavigationTiming type and path', () => {
    performance.getEntriesByType = ((type: string) => {
      if (type !== 'navigation') return []
      return [{ type: 'reload', name: 'http://localhost:3000/naval/status/123' }]
    }) as unknown as typeof performance.getEntriesByType

    expect(readNavigationType()).toBe('reload')
    expect(readDocumentPath()).toBe('/naval/status/123')
  })

  it('returns unknown / empty when the timing entry is missing', () => {
    performance.getEntriesByType = (() => []) as unknown as typeof performance.getEntriesByType
    expect(readNavigationType()).toBe('unknown')
    expect(readDocumentPath()).toBe('')
  })
})

describe('readSharedOpenContext', () => {
  const original = performance.getEntriesByType

  beforeEach(() => {
    sessionStorage.clear()
    window.history.replaceState(null, '', '/reels/abc')
    performance.getEntriesByType = ((type: string) => {
      if (type !== 'navigation') return []
      return [{ type: 'navigate', name: 'http://localhost:3000/share' }]
    }) as unknown as typeof performance.getEntriesByType
    markPreviewOpenIntent('share')
  })

  afterEach(() => {
    performance.getEntriesByType = original
    sessionStorage.clear()
  })

  it('bundles navigation, paths, and peeked intent without consuming', () => {
    const ctx = readSharedOpenContext()
    expect(ctx).toEqual({
      navigationType: 'navigate',
      documentPath: '/share',
      currentPath: '/reels/abc',
      openIntent: 'share',
    })
    expect(peekPreviewOpenIntent()).toBe('share')
  })
})

describe('claimSharedAutoSave', () => {
  beforeEach(() => {
    resetSharedAutoSaveAttempts()
  })

  it('allows the first claim per key and rejects the rest', () => {
    expect(claimSharedAutoSave('twitter:1')).toBe(true)
    expect(claimSharedAutoSave('twitter:1')).toBe(false)
    expect(claimSharedAutoSave('twitter:2')).toBe(true)
  })
})
