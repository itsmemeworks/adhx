import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getCurrentUserId } from '@/lib/auth/session'
import { TagsClient } from './TagsClient'

// Authed-only utility page — nothing here is meant to be indexed.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function TagsPage() {
  const userId = await getCurrentUserId()

  // Redirect unauthenticated users to the landing page
  if (!userId) {
    redirect('/')
  }

  return <TagsClient />
}
