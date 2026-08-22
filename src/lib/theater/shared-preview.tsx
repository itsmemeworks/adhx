import { headers } from 'next/headers'
import { SharedPostStatic, type SharedPostStaticProps } from '@/components/theater/SharedPostStatic'
import { TheaterShell } from '@/components/theater/TheaterShell'
import { jsonLdScriptContent } from '@/lib/utils/structured-data'
import { isLikelyBot } from '@/lib/activity/bot'
import { recordActivity, type ActivityInput } from '@/lib/activity/record'
import { metrics } from '@/lib/sentry'
import { buildSharedSeed } from './shared-seed'
import type { TheaterFeedSeed, TheaterItem } from '@/components/theater/types'

/**
 * Pulse a preview when a human opened it. Shared by Reels / TikTok / Shorts
 * (the tweet page has extra unavailable/tombstone branches).
 */
export async function recordHumanPreview(
  available: boolean,
  event: Omit<ActivityInput, 'action'>,
): Promise<void> {
  if (!available) return
  if (isLikelyBot((await headers()).get('user-agent'))) return
  recordActivity({ action: 'preview', ...event })
  metrics.theaterOpened('shared')
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
}: {
  jsonLd: unknown
  staticPost: SharedPostStaticProps
  seed: TheaterFeedSeed
  sharedItem: TheaterItem
  authed: boolean
}) {
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
