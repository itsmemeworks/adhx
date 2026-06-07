import type { Metadata } from 'next'
import { DiscoverFeed } from '@/components/discover/DiscoverFeed'

export const metadata: Metadata = {
  title: "Discover what's trending",
  description:
    'A live, anonymous feed of trending tweets, TikToks, Reels and Shorts people are saving on ADHX right now. Preview any post and save it to your collection.',
}

/**
 * /discover — the real-time anonymous discovery feed (Matter direction).
 *
 * No auth gate: anyone can browse what the community is saving. The client feed
 * polls the public /api/activity endpoint; the "+ Save" action navigates to the
 * on-ADHX preview page (item.url), which handles save + auth gating itself.
 */
export default function DiscoverPage() {
  return <DiscoverFeed />
}
