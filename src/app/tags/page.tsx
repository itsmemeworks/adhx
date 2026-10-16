import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getCurrentUserId } from '@/lib/auth/session'
import { TagsClient } from './TagsClient'
import { isNextUiEnabled } from '@/lib/next-ui/server'
import { TAGS_TO_CHANNELS } from '@/lib/next-ui/routes'

// Authed-only utility page — nothing here is meant to be indexed.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function TagsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const userId = await getCurrentUserId()

  // Redirect unauthenticated users to the landing page
  if (!userId) {
    redirect('/')
  }
  // Redesign (default since phase 7): tags are channels now.
  if (await isNextUiEnabled(await searchParams)) redirect(TAGS_TO_CHANNELS)

  return <TagsClient />
}
