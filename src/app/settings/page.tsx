import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { SettingsClient } from './SettingsClient'

export default async function SettingsPage() {
  const session = await getSession()

  // Redirect unauthenticated users to the landing page
  if (!session) {
    redirect('/')
  }

  return <SettingsClient />
}
