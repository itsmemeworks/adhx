'use client'

import { networkLabel } from '@/lib/platform/networks'
import { detectPlatformPost } from '@/lib/platform/url'

import Link from 'next/link'
import { Suspense, use, useEffect, useMemo, useRef } from 'react'
import { useAuthMe } from '@/components/auth'
import { theaterItemToFeedItem } from '@/components/theater/collection-item'
import type { TheaterItem } from '@/components/theater/types'
import { sourceUrl } from '@/lib/activity/preview-path'
import {
  claimSharedAutoSave,
  consumePreviewOpenIntent,
  readSharedOpenContext,
  sharedAutoSaveReason,
} from '@/lib/theater/autosave-shared'
import type { SharedResolveResult } from '@/lib/theater/shared-resolve'
import { NxHeader } from '../channels/ChannelParts'
import { DEFAULT_STATE, resultKey, type SearchResultItem } from '../search/model'
import type { PlaySource } from './queue'
import { NX_POST_SAVED, TheaterV2 } from './TheaterV2'

/**
 * A shared post's own page (`/{user}/status/{id}`, `/reels/{id}`, `/p/{id}`,
 * `/@{user}/video/{id}`) in the new theater: the post plays first (looping
 * until you move on), then posts like it from everyone's saves. The page
 * never waits on the source: the theater's loading screen shows while
 * `resolve` settles.
 */

const { view: _view, ...search } = DEFAULT_STATE
const SHARED_SOURCE: PlaySource = {
  search: { ...search, scope: 'everyone' },
  group: null,
  channel: null,
  auto: null,
  recent: false,
  moment: null,
  start: null,
  shared: true,
}

export function PreviewTheater({
  resolve,
  unavailable = false,
  originalUrl,
}: {
  /** The source fetch (FxTwitter, a scrape, oEmbed), started by the page. */
  resolve?: Promise<SharedResolveResult>
  /** Removed by ADHX (moderation): never resolved, never shown. */
  unavailable?: boolean
  /** The post on its own site, offered when it can't be shown here. */
  originalUrl?: string
}) {
  if (unavailable || !resolve) return <Unavailable removed={unavailable} />
  return (
    <Suspense fallback={<TheaterV2 source={SHARED_SOURCE} />}>
      <Resolved resolve={resolve} originalUrl={originalUrl} />
    </Suspense>
  )
}

function Resolved({
  resolve,
  originalUrl,
}: {
  resolve: Promise<SharedResolveResult>
  originalUrl?: string
}) {
  const result = use(resolve)
  const item = result.ok ? result.item : null
  const lead = useMemo<SearchResultItem | null>(
    () =>
      item ? { post: theaterItemToFeedItem(item), saved: false, matched: [], stage: item } : null,
    [item],
  )
  useSaveOnOpen(item, lead)
  if (!lead) return <Unavailable originalUrl={originalUrl} />
  return <TheaterV2 source={SHARED_SOURCE} lead={lead} />
}

/**
 * Signed in, a new open of a shared post saves it (a pasted link, the
 * address-bar prefix, /share), and so does coming back from sign-in with
 * `?save=1`. Refreshes, back/forward and in-app hops don't. Same rules as the
 * old preview pages (`autosave-shared.ts`).
 */
function useSaveOnOpen(item: TheaterItem | null, lead: SearchResultItem | null) {
  const { me, loading } = useAuthMe()
  const done = useRef(false)
  useEffect(() => {
    if (!item || !lead || loading || done.current) return
    const params = new URLSearchParams(window.location.search)
    const saveIntentOnLoad = params.get('save') === '1'
    const authenticated = !!me?.authenticated
    const ctx = readSharedOpenContext()
    const reason = sharedAutoSaveReason({
      mode: 'shared',
      hasSharedItem: true,
      sharedUnavailable: false,
      authenticated,
      saveIntentOnLoad,
      ...ctx,
    })
    if (!reason && saveIntentOnLoad && !authenticated) return // wait for sign-in
    done.current = true
    consumePreviewOpenIntent()
    if (saveIntentOnLoad) {
      params.delete('save')
      const qs = params.toString()
      window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`)
    }
    if (!reason) return
    const key = resultKey(lead)
    if (!claimSharedAutoSave(key)) return
    const url = sourceUrl(item.platform, item.author, item.bookmarkId ?? '', item.contentType)
    if (!url) return
    const body = reason === 'save-intent' ? { url } : { url, source: 'url_prefix' as const }
    void fetch('/api/bookmarks/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then((res) => {
        if (res.ok) window.dispatchEvent(new CustomEvent(NX_POST_SAVED, { detail: { key } }))
      })
      .catch(() => {})
  }, [item, lead, loading, me])
}

function siteName(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    if (host === 'x.com' || host === 'twitter.com') return 'X'
    const detected = detectPlatformPost(url)
    return detected ? networkLabel(detected.platform) : host
  } catch {
    return 'its site'
  }
}

function Unavailable({
  removed = false,
  originalUrl,
}: {
  removed?: boolean
  originalUrl?: string
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-nx-stage font-nx-sans text-nx-cream">
      <NxHeader current={null} />
      <main className="flex flex-1 flex-col items-center justify-center gap-5 px-6 pb-24 text-center">
        <h1 className="m-0 font-nx-serif text-[34px] font-normal leading-tight">
          {removed ? 'This post was removed' : 'This post isn’t available'}
        </h1>
        <p className="m-0 max-w-[440px] text-[15px] text-white/70">
          {removed
            ? 'It was taken down from ADHX.'
            : 'It may have been deleted, or the account is private.'}
        </p>
        <span className="flex flex-wrap justify-center gap-2.5">
          {!removed && originalUrl && (
            // It may still be there for people signed in on its own site.
            <a
              href={originalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-nx-accent px-5 py-3 text-sm font-bold text-nx-ink"
            >
              {`Open on ${siteName(originalUrl)}`}
            </a>
          )}
          <Link
            href="/now"
            className={
              !removed && originalUrl
                ? 'rounded-full border border-white/30 px-5 py-3 text-sm font-bold'
                : 'rounded-full bg-nx-accent px-5 py-3 text-sm font-bold text-nx-ink'
            }
          >
            See what’s live
          </Link>
        </span>
      </main>
    </div>
  )
}
