import { postsBoard } from '@/lib/admin/boards/posts'
import { parseAdminRange } from '@/lib/admin/shared'
import { adminPageActor, rangeParam, type AdminSearchParams } from '@/lib/admin/page-gate'
import { PostsView } from '@/components/next/admin/PostsView'

export const dynamic = 'force-dynamic'

/** /admin/posts (board 10.3). */
export default async function AdminPostsPage({
  searchParams,
}: {
  searchParams?: AdminSearchParams
}) {
  await adminPageActor()
  const range = parseAdminRange(await rangeParam(searchParams), 'all')
  return <PostsView data={postsBoard(range)} />
}
