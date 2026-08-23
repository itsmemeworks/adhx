import { headers } from 'next/headers'
import type { Metadata } from 'next'
import { SharedPostStatic, type SharedPostStaticProps } from '@/components/theater/SharedPostStatic'
import { TheaterShell } from '@/components/theater/TheaterShell'
import { jsonLdScriptContent } from '@/lib/utils/structured-data'
import { isLikelyBot } from '@/lib/activity/bot'
import { recordActivity, type ActivityInput } from '@/lib/activity/record'
import { metrics } from '@/lib/sentry'
import { recordAnalytic } from '@/lib/analytics/record'
import { buildSharedSeed } from './shared-seed'
import type { TheaterFeedSeed, TheaterItem } from '@/components/theater/types'
import { isPostModerated } from '@/lib/admin/moderation'

export const MODERATED_PAGE_METADATA: Metadata = {
  title: 'Post removed - ADHX',
  description: 'This post was removed from ADHX.',
  robots: { index: false },
}

/**
 * Pulse a preview when a human opened it. Shared by Reels / TikTok / Shorts
 * (the tweet page has extra unavailable/tombstone branches).
 */
export async function recordHumanPreview(
  available: boolean,
  event: Omit<ActivityInput, 'action'>,
): Promise<void> {
  if (!available) return
  if (isPostModerated(event.platform, event.bookmarkId)) return
  if (isLikelyBot((await headers()).get('user-agent'))) return
  recordActivity({ action: 'preview', ...event })
  metrics.theaterOpened('shared')
  recordAnalytic({
    name: 'theater.open',
    userId: event.userId,
    platform: event.platform,
    bookmarkId: event.bookmarkId,
    surface: 'shared',
  })
}

export async function sharedPreviewSeed(sharedItem: TheaterItem): Promise<TheaterFeedSeed> {
  const { seed } = await buildSharedSeed(sharedItem)
  return seed
}

/** Crawlable article + theater — the three single-format preview pages share this tail. */
export function SharedPreviewPage({
  jsonLd,
  staticPost,
  seed,
  sharedItem,
  authed,
  unavailable,
}: {
  jsonLd: unknown
  staticPost: SharedPostStaticProps
  seed: TheaterFeedSeed
  sharedItem: TheaterItem
  authed: boolean
  unavailable?: boolean
}) {
  if (unavailable) {
    return (
      <TheaterShell
        seed={seed}
        mode="shared"
        sharedItem={sharedItem}
        sharedUnavailable
        sharedUnavailableReason="hidden"
        authed={authed}
      />
    )
  }
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScriptContent(jsonLd) }}
      />
      <SharedPostStatic {...staticPost} />
      <TheaterShell seed={seed} mode="shared" sharedItem={sharedItem} authed={authed} />
    </>
  )
}
