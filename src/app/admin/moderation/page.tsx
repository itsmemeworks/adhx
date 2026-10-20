import { moderationBoard } from '@/lib/admin/boards/moderation'
import { adminPageActor } from '@/lib/admin/page-gate'
import { ModerationView } from '@/components/next/admin/ModerationView'

export const dynamic = 'force-dynamic'

/** /admin/moderation (board 10.8). */
export default async function AdminModerationPage() {
  await adminPageActor()
  return <ModerationView data={moderationBoard()} />
}
