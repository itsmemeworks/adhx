import { permanentRedirect } from 'next/navigation'

/**
 * `/collection` used to be the Saved theater. It moved to `/saved`. This stub
 * keeps old links working (bookmarks, in-app copies, leftover `?open=`).
 */
export default async function CollectionSavedRedirect({
  searchParams,
}: {
  searchParams: Promise<{ open?: string; platform?: string }>
}) {
  const { open, platform } = await searchParams
  const params = new URLSearchParams()
  if (open) params.set('open', open)
  if (platform) params.set('platform', platform)
  const q = params.toString()
  permanentRedirect(q ? `/saved?${q}` : '/saved')
}
