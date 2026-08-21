import { notFound, permanentRedirect } from 'next/navigation'
import { slugToWindow, windowToPath } from '@/lib/discovery/rank'

/**
 * `/collections/[window]` — old-URL redirect stub, sibling of
 * `src/app/collections/page.tsx` (read that file's header comment for why
 * this moved to `/leaderboard/[window]`). Unknown slugs still 404 rather than
 * redirecting to an invalid destination; `week` is folded into the bare
 * `/leaderboard` by `windowToPath` itself, so `/collections/week` lands on
 * `/leaderboard`, not `/leaderboard/week`. No metadata/JSON-LD — redirect
 * stubs aren't meant to be indexed.
 */
interface Props {
  params: Promise<{ window: string }>
}

export default async function CollectionsWindowRedirect({ params }: Props) {
  const { window: slug } = await params
  const window = slugToWindow(slug)
  if (!window) notFound()
  permanentRedirect(windowToPath(window))
}
