import { NextRequest, NextResponse } from 'next/server'
import { isValidTweetAuthor, isValidTweetId } from '@/lib/media/proxy'
import { mediaRateLimit } from '@/lib/rate-limit'

// GET /api/media/image?author=xxx&tweetId=xxx&index=1
// Proxies images through the server to avoid CORS issues when downloading/sharing
// Uses FxTwitter's image CDN which provides reliable access to Twitter media
export async function GET(request: NextRequest) {
  const rateLimited = mediaRateLimit(request)
  if (rateLimited) return rateLimited

  const searchParams = request.nextUrl.searchParams
  const author = searchParams.get('author')
  const tweetId = searchParams.get('tweetId')
  const index = searchParams.get('index') || '1'

  if (!author || !tweetId) {
    return NextResponse.json({ error: 'Missing author or tweetId' }, { status: 400 })
  }

  // Sanitise the user-provided params before interpolating them into the
  // FxTwitter image CDN URL (prevents request-forgery via a crafted author/tweetId).
  if (!isValidTweetAuthor(author) || !isValidTweetId(tweetId)) {
    return NextResponse.json({ error: 'Invalid author or tweetId' }, { status: 400 })
  }

  // Validate index is a number
  const photoIndex = parseInt(index, 10)
  if (isNaN(photoIndex) || photoIndex < 1) {
    return NextResponse.json({ error: 'Invalid index' }, { status: 400 })
  }

  try {
    // Use FxTwitter's image CDN for reliable access
    const imageUrl = `https://d.fixupx.com/${author}/status/${tweetId}/photo/${photoIndex}`

    const imageResponse = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'ADHX/1.0',
      },
      // author/tweetId are validated above, so the only variable in this URL
      // is a trusted, fixed FxTwitter host — but external fetches must always
      // have a timeout per CLAUDE.md's Resilience Patterns.
      signal: AbortSignal.timeout(10_000),
    })

    if (!imageResponse.ok) {
      throw new Error(`Image fetch failed with status ${imageResponse.status}`)
    }

    const contentType = imageResponse.headers.get('content-type') || 'image/jpeg'
    const contentLength = imageResponse.headers.get('content-length')

    const responseHeaders: Record<string, string> = {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
    }

    if (contentLength) {
      responseHeaders['Content-Length'] = contentLength
    }

    return new Response(imageResponse.body, {
      status: 200,
      headers: responseHeaders,
    })
  } catch (error) {
    console.error('Error fetching image:', error)
    return NextResponse.json({ error: 'Failed to fetch image' }, { status: 500 })
  }
}
