import { permanentRedirect } from 'next/navigation'

/**
 * /discover → /trending (308 permanent).
 *
 * The discovery feed now lives entirely at /trending; the per-lens views are
 * tidy paths under it (e.g. /trending/videos, /trending/latest). We keep
 * /discover as a permanent redirect so any existing links + bookmarks land on
 * the canonical hub and pass their link equity on.
 */
export default function DiscoverPage(): never {
  permanentRedirect('/trending')
}
