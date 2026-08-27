import { headers } from 'next/headers'
import { isLikelyBot } from '@/lib/activity/bot'
import { recordActivity, type ActivityInput } from '@/lib/activity/record'
import { metrics } from '@/lib/sentry'
import { recordAnalytic } from '@/lib/analytics/record'
import { readPostModeration } from '@/lib/admin/moderation'

/**
 * Pulse a preview when a human opened it. Shared by Reels / TikTok / Shorts
 * (the tweet page has extra unavailable/tombstone branches).
 */
export async function recordHumanPreview(
  available: boolean,
  event: Omit<ActivityInput, 'action'>,
): Promise<void> {
  if (!available) return
  const moderation = readPostModeration(event.platform, event.bookmarkId)
  if (!moderation.ok || moderation.value) return
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
