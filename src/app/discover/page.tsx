import { permanentRedirect } from 'next/navigation'

/**
 * /discover → /trending (308 permanent).
 *
 * The discovery feed now lives at the SEO-canonical /trending hub, which
 * server-renders crawlable HTML for each item (the old /discover was a
 * client-only skeleton). We keep /discover as a permanent redirect so existing
 * links + bookmarks land on the new canonical URL and pass their link equity on.
 */
export default function DiscoverPage(): never {
  permanentRedirect('/trending')
}
