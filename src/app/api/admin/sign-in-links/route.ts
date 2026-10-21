import { NextRequest, NextResponse } from 'next/server'
import { withAdmin } from '@/lib/admin/guard'
import {
  discardAdminSignInLink,
  pendingAdminSignInLinks,
  signInDelivery,
} from '@/lib/email/magic-link'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

/**
 * GET /api/admin/sign-in-links — sign-in links waiting to be handed over
 * (EMAIL_LINKS_TO_ADMIN), and how this server delivers links.
 */
export const GET = withAdmin(async () => {
  const delivery = signInDelivery()
  return NextResponse.json(
    { delivery, links: delivery === 'admin' ? pendingAdminSignInLinks() : [] },
    { headers: NO_STORE },
  )
})

/** DELETE /api/admin/sign-in-links { tokenHash } — take a link off the list. */
export const DELETE = withAdmin(async (request: NextRequest) => {
  const body = (await request.json().catch(() => ({}))) as { tokenHash?: unknown }
  const tokenHash = typeof body.tokenHash === 'string' ? body.tokenHash : ''
  if (!/^[0-9a-f]{64}$/.test(tokenHash)) {
    return NextResponse.json({ error: 'tokenHash is required' }, { status: 400 })
  }
  return NextResponse.json({ removed: discardAdminSignInLink(tokenHash) }, { headers: NO_STORE })
})
