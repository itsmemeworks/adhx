import { redirect } from 'next/navigation'
import { getCurrentUserId } from '@/lib/auth/session'
import { SettingsClient } from './SettingsClient'

export default async function SettingsPage() {
  const userId = await getCurrentUserId()

  // Redirect unauthenticated users to the landing page
  if (!userId) {
    redirect('/')
  }

  return <SettingsClient />
}
