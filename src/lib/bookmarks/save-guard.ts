import { NextResponse } from 'next/server'

/** Recheck a queued save inside its write transaction after external I/O. */
export type SaveGuard = () => boolean

export function cancelledSave(): NextResponse {
  return NextResponse.json({ error: 'This queued share was cancelled.' }, { status: 409 })
}
