import { NextRequest, NextResponse } from 'next/server'

/**
 * Instagram Reel video — NO LONGER AVAILABLE.
 *
 * The InstaFix-style mirrors that resolved a streamable MP4 are dead (see
 * `src/lib/media/instafix.ts`), and Instagram does not expose `og:video` to
 * bots. Instagram is degraded to poster + caption + link-out, so there is no
 * inline video to stream. Kept as a stable 410 so any cached client URLs fail
 * cleanly instead of hanging on a dead upstream.
 *
 * GET /api/media/instagram/video?id={reelId}
 */
export async function GET(_request: NextRequest) {
  return NextResponse.json(
    { error: 'Instagram video playback is no longer available. View the Reel on Instagram.' },
    { status: 410 },
  )
}
