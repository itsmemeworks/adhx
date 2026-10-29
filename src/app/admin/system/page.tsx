import { systemBoard } from '@/lib/admin/boards/system'
import { serverInfo } from '@/lib/admin/boards/overview'
import { adminPageActor } from '@/lib/admin/page-gate'
import { SystemView } from '@/components/next/admin/SystemView'

export const dynamic = 'force-dynamic'

/** /admin/system: is this ADHX working, and how is it set up? */
export default async function AdminSystemPage() {
  await adminPageActor()
  return <SystemView data={await systemBoard()} server={serverInfo().name} />
}
