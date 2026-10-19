import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { publicReadRateLimit } from '@/lib/rate-limit'
import { getMomentDetail } from '@/lib/moments/engine'

/** GET /api/moments/{slug} — one moment's posts, newest first, and its last 30 minutes. */
export const dynamic = 'force-dynamic'

const SLUG = /^[a-z0-9-]{1,64}$/

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const limited = publicReadRateLimit(request)
  if (limited) return limited
  const { slug } = await params
  if (!SLUG.test(slug)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const raw = Number.parseInt(request.nextUrl.searchParams.get('limit') ?? '', 10)
  const limit = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 120) : 60
  const detail = await getMomentDetail(slug, limit)
  if (!detail) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(detail, { headers: { 'Cache-Control': 'no-store' } })
}
