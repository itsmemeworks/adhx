import { NextRequest, NextResponse } from 'next/server'

/**
 * Instagram Reel download — NO LONGER AVAILABLE.
 *
 * The mirrors that resolved a downloadable MP4 are dead and Instagram does not
 * expose `og:video` to bots, so there is nothing to download. Instagram is
 * degraded to poster + caption + link-out. Kept as a stable 410.
 *
 * GET /api/media/instagram/video/download?id={reelId}
 */
export async function GET(_request: NextRequest) {
  return NextResponse.json(
    { error: 'Instagram download is no longer available. View the Reel on Instagram.' },
    { status: 410 },
  )
}
