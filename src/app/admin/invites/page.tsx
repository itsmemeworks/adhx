import { invitesBoard } from '@/lib/admin/boards/moderation'
import { adminPageActor } from '@/lib/admin/page-gate'
import { InvitesView } from '@/components/next/admin/InvitesView'

export const dynamic = 'force-dynamic'

/** /admin/invites (board 10.9). */
export default async function AdminInvitesPage() {
  await adminPageActor()
  return <InvitesView data={invitesBoard()} />
}
