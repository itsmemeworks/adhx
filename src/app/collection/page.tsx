import { permanentRedirect } from 'next/navigation'
import { savedToPlay } from '@/lib/next-ui/routes'

/**
 * `/collection` used to be the Saved theater. This stub keeps old links
 * working (bookmarks, in-app copies, leftover `?open=`).
 */
export default async function CollectionSavedRedirect({
  searchParams,
}: {
  searchParams: Promise<{ open?: string; platform?: string }>
}) {
  const { open, platform } = await searchParams
  permanentRedirect(savedToPlay(open, platform))
}
