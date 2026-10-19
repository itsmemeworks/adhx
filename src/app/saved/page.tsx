import { redirect } from 'next/navigation'
import { getCurrentUserId } from '@/lib/auth/session'
import { savedToPlay } from '@/lib/next-ui/routes'

/** `/saved` (old Saved theater links, `?open=`) → the theater on your newest saves. */
export const dynamic = 'force-dynamic'

export default async function SavedPage({
  searchParams,
}: {
  searchParams: Promise<{ open?: string; platform?: string }>
}) {
  if (!(await getCurrentUserId())) redirect('/')
  const { open, platform } = await searchParams
  redirect(savedToPlay(open, platform))
}
