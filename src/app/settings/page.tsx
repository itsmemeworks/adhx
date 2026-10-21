import { redirect } from 'next/navigation'
import { getCurrentUserId } from '@/lib/auth/session'
import { startHref } from '@/lib/next-ui/routes'
import { SettingsClient } from './SettingsClient'

export const metadata = { title: 'Settings · adhx', robots: { index: false } }

export default async function SettingsPage() {
  // Signed out: sign in, then come back here.
  if (!(await getCurrentUserId())) redirect(startHref('/settings'))
  return <SettingsClient />
}
