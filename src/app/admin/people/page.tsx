import { peopleBoard } from '@/lib/admin/boards/people'
import { serverInfo } from '@/lib/admin/boards/overview'
import { adminPageActor } from '@/lib/admin/page-gate'
import { PeopleView } from '@/components/next/admin/PeopleView'

export const dynamic = 'force-dynamic'

/** /admin/people (board 10.2). */
export default async function AdminPeoplePage() {
  const actor = await adminPageActor()
  return <PeopleView data={peopleBoard(actor.userId)} server={serverInfo().name} />
}
