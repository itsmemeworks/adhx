import { permanentRedirect } from 'next/navigation'

/**
 * `/collections` used to be the Discovery leaderboard's home. It moved to
 * `/leaderboard` (see that route's header comment) because `/collections`
 * collides with the unrelated `/api/collections` custom-collections API —
 * this stub exists only because the old URL is on staging and already
 * shipped in sitemaps, so it can't just disappear. No metadata/JSON-LD here:
 * this path is never meant to be indexed going forward, `/leaderboard` is.
 */
export default function CollectionsRedirect() {
  permanentRedirect('/leaderboard')
}
