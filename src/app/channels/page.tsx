import { redirect } from 'next/navigation'
import { getCurrentUserId } from '@/lib/auth/session'
import { isNextUiEnabled } from '@/lib/next-ui/server'
import { ChannelsScreen } from '@/components/next/channels/ChannelsScreen'

/**
 * `/channels` — your channels, "Made for you" channels and Top channels
 * (redesign phase 5, behind `next_ui`; flag off → the current Tags page).
 */
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Channels · adhx', robots: { index: false } }

export default async function ChannelsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  if (!(await isNextUiEnabled(await searchParams))) redirect('/tags')
  if (!(await getCurrentUserId())) redirect('/start?returnTo=%2Fchannels')
  return <ChannelsScreen />
}
