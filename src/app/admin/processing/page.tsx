import { processingBoard } from '@/lib/admin/boards/processing'
import { serverInfo } from '@/lib/admin/boards/overview'
import { adminPageActor } from '@/lib/admin/page-gate'
import { ProcessingView } from '@/components/next/admin/ProcessingView'

export const dynamic = 'force-dynamic'

/** /admin/processing (board 10.7). */
export default async function AdminProcessingPage() {
  const actor = await adminPageActor()
  return <ProcessingView data={await processingBoard(actor.userId)} server={serverInfo().name} />
}
