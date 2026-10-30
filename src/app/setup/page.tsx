import { redirect } from 'next/navigation'
import { hasAdmin } from '@/lib/auth/allowlist'
import { SetupScreen } from '@/components/next/onboarding/SetupScreen'

/**
 * `/setup`: a fresh ADHX's first screen (`?code=` fills in the setup code from
 * the link in the server log). Once it has an owner, it's the home page.
 */
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Set up', robots: { index: false } }

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  if (hasAdmin()) redirect('/')
  const { code } = await searchParams
  return (
    <SetupScreen
      initialCode={typeof code === 'string' ? code.slice(0, 64) : ''}
      logHint="It’s in your host’s dashboard as SETUP_CODE, or in the server log: docker logs adhx | grep setup"
    />
  )
}
