import { notFound, redirect } from 'next/navigation'
import { getCurrentUserId } from '@/lib/auth/session'
import { startHref } from '@/lib/next-ui/routes'
import { listMembers } from '@/lib/people/members'
import { FriendChannelPage } from '@/components/next/channels/FriendChannelPage'

/**
 * `/channels/friend/{username}` — one friend's channel: everything they
 * saved that members may see (never their private saves). Members only;
 * your own username goes to My saves.
 */
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Channels', robots: { index: false, follow: false } }

const USERNAME = /^[A-Za-z0-9_]{1,40}$/

export default async function FriendChannelRoute({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username: raw } = await params
  let username: string
  try {
    username = decodeURIComponent(raw)
  } catch {
    notFound()
  }
  const viewer = await getCurrentUserId()
  if (!viewer) redirect(startHref(`/channels/friend/${encodeURIComponent(username)}`))
  if (!USERNAME.test(username)) notFound()
  const member = listMembers(viewer).find(
    (m) => m.username.toLowerCase() === username.toLowerCase(),
  )
  if (!member) notFound()
  if (member.isYou) redirect('/play?recent=1')
  return (
    <FriendChannelPage
      username={member.username}
      name={member.name}
      avatarUrl={member.avatarUrl}
      size={member.saves}
    />
  )
}
