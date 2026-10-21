import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { publicReadRateLimit } from '@/lib/rate-limit'
import { getMomentNeighbours } from '@/lib/moments/engine'

/** GET /api/moments/{slug}/near — posts close to a moment but not in it (Tune in's "Wander"). */
export const dynamic = 'force-dynamic'

const SLUG = /^[a-z0-9-]{1,64}$/

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const limited = publicReadRateLimit(request)
  if (limited) return limited
  const { slug } = await params
  if (!SLUG.test(slug)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const items = await getMomentNeighbours(slug, 20)
  if (!items) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ items }, { headers: { 'Cache-Control': 'no-store' } })
}
