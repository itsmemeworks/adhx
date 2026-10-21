import { notFound } from 'next/navigation'
import { personBoard } from '@/lib/admin/boards/people'
import { adminPageActor } from '@/lib/admin/page-gate'
import { PersonView } from '@/components/next/admin/PersonView'

export const dynamic = 'force-dynamic'

/** /admin/people/{username}: one person (board 10.10). */
export default async function AdminPersonPage({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const actor = await adminPageActor()
  const { username } = await params
  const data = personBoard(actor.userId, decodeURIComponent(username))
  if (!data) notFound()
  return <PersonView data={data} />
}
