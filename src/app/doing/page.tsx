import { redirect } from 'next/navigation'
import { getCurrentUserId } from '@/lib/auth/session'
import { startHref } from '@/lib/next-ui/routes'
import { DoingScreen } from '@/components/next/doing/DoingScreen'

export const metadata = { title: 'What your ADHX is doing · adhx', robots: { index: false } }

/** /doing: every post on its way, step by step (members only). */
export default async function DoingPage() {
  if (!(await getCurrentUserId())) redirect(startHref('/doing'))
  return <DoingScreen />
}
