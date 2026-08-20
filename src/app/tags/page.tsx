import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { TagsClient } from './TagsClient'

export default async function TagsPage() {
  const session = await getSession()

  // Redirect unauthenticated users to the landing page
  if (!session) {
    redirect('/')
  }

  return <TagsClient />
}
