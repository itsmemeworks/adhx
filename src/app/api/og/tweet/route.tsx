import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { fetchTweetData } from '@/lib/media/fxembed'
import { fetchWithAllowlistedRedirects, readResponseBodyWithLimit } from '@/lib/media/proxy'

export const runtime = 'nodejs'

const MAX_AVATAR_BYTES = 2 * 1024 * 1024

// Truncate text with ellipsis
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 1).trim() + '…'
}

async function loadAvatarDataUrl(url: string | undefined): Promise<string | null> {
  if (!url) return null
  try {
    const response = await fetchWithAllowlistedRedirects(url, {
      hosts: ['pbs.twimg.com', 'abs.twimg.com'],
      timeoutMs: 8_000,
      init: { headers: { Accept: 'image/png,image/jpeg,image/webp,*/*' } },
    })
    if (!response.ok) {
      await response.body?.cancel()
      return null
    }
    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim()
    if (!contentType?.startsWith('image/')) {
      await response.body?.cancel()
      return null
    }
    const bytes = await readResponseBodyWithLimit(response, MAX_AVATAR_BYTES)
    if (bytes.byteLength === 0) return null
    return `data:${contentType};base64,${Buffer.from(bytes).toString('base64')}`
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const username = searchParams.get('u')
  const tweetId = searchParams.get('t')

  // Validate params
  if (!username || !tweetId) {
    return new Response('Missing required parameters: u (username) and t (tweetId)', {
      status: 400,
    })
  }

  // Load the supplied dark-surface GOB + ADHX lockup.
  const logoPath = join(process.cwd(), 'public', 'logo-dark.png')
  const logoData = await readFile(logoPath)
  const logoBase64 = `data:image/png;base64,${logoData.toString('base64')}`

  // Fetch tweet data from FxTwitter
  const data = await fetchTweetData(username, tweetId)
  const tweet = data?.tweet

  // If we couldn't fetch the tweet, show a generic branded image
  if (!tweet) {
    return new ImageResponse(
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#08070a',
        }}
      >
        <img
          src={logoBase64}
          alt="ADHX Logo"
          width={274}
          height={96}
          style={{ marginBottom: 24, objectFit: 'contain' }}
        />
        <div style={{ fontSize: 24, color: '#FFD426' }}>Save @{username}&apos;s tweet</div>
      </div>,
      { width: 1200, height: 630 },
    )
  }

  // Rich branded image with tweet preview
  const tweetText = truncate(tweet.text || '', 200)
  const authorName = tweet.author.name
  const authorHandle = `@${tweet.author.screen_name}`
  const avatarDataUrl = await loadAvatarDataUrl(tweet.author.avatar_url)

  return new ImageResponse(
    <div
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#08070a',
        padding: 60,
      }}
    >
      {/* Header: Logo + ADHX */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 40 }}>
        <img
          src={logoBase64}
          alt="ADHX Logo"
          width={91}
          height={32}
          style={{ objectFit: 'contain' }}
        />
        <span style={{ fontSize: 18, color: '#6B7280', marginLeft: 16 }}>
          Save it. Lose it. Find it.
        </span>
      </div>

      {/* Tweet Card */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          backgroundColor: '#322b23',
          borderRadius: 24,
          padding: 32,
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        {/* Author info */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
          {avatarDataUrl && (
            <img
              src={avatarDataUrl}
              alt={authorName}
              width={56}
              height={56}
              style={{ borderRadius: 28 }}
            />
          )}
          <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 16 }}>
            <span style={{ fontSize: 24, fontWeight: 600, color: 'white' }}>{authorName}</span>
            <span style={{ fontSize: 18, color: '#9CA3AF' }}>{authorHandle}</span>
          </div>
        </div>

        {/* Tweet text */}
        <div
          style={{
            fontSize: 28,
            color: '#E5E7EB',
            lineHeight: 1.4,
            flex: 1,
          }}
        >
          {tweetText}
        </div>
      </div>

      {/* Footer CTA */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 32,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: '#FFD426',
            color: '#141414',
            fontSize: 20,
            fontWeight: 600,
            padding: '12px 32px',
            borderRadius: 999,
          }}
        >
          Save this tweet to ADHX →
        </div>
      </div>
    </div>,
    { width: 1200, height: 630 },
  )
}
