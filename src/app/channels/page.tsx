import { redirect } from 'next/navigation'
import { getCurrentUserId } from '@/lib/auth/session'
import { startHref } from '@/lib/next-ui/routes'
import { ChannelsScreen } from '@/components/next/channels/ChannelsScreen'

/** `/channels` — your channels, "Made for you" channels and Top channels. */
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Channels · adhx', robots: { index: false } }

export default async function ChannelsPage() {
  if (!(await getCurrentUserId())) redirect(startHref('/channels'))
  return <ChannelsScreen />
}
