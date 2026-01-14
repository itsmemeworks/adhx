import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { fetchTweetData } from '@/lib/media/fxembed'

export const runtime = 'nodejs'

// Truncate text with ellipsis
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 1).trim() + '…'
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

  // Load the logo image
  const logoPath = join(process.cwd(), 'public', 'logo.png')
  const logoData = await readFile(logoPath)
  const logoBase64 = `data:image/png;base64,${logoData.toString('base64')}`

  // Fetch tweet data from FxTwitter
  const data = await fetchTweetData(username, tweetId)
  const tweet = data?.tweet

  // If we couldn't fetch the tweet, show a generic branded image
  if (!tweet) {
    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#030712',
            backgroundImage: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, transparent 50%)',
          }}
        >
          <img
            src={logoBase64}
            alt="ADHX Logo"
            width={120}
            height={120}
            style={{ marginBottom: 24, objectFit: 'contain' }}
          />
          <div style={{ fontSize: 48, fontWeight: 700, color: 'white', marginBottom: 12 }}>
            ADHX
          </div>
          <div style={{ fontSize: 24, color: '#8B5CF6' }}>
            Save @{username}&apos;s tweet
          </div>
        </div>
      ),
      { width: 1200, height: 630 }
    )
  }

  // Rich branded image with tweet preview
  const tweetText = truncate(tweet.text || '', 200)
  const authorName = tweet.author.name
  const authorHandle = `@${tweet.author.screen_name}`

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#030712',
          backgroundImage: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, transparent 60%)',
          padding: 60,
        }}
      >
        {/* Header: Logo + ADHX */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 40 }}>
          <img
            src={logoBase64}
            alt="ADHX Logo"
            width={48}
            height={48}
            style={{ objectFit: 'contain' }}
          />
          <span style={{ fontSize: 28, fontWeight: 700, color: 'white', marginLeft: 12 }}>
            ADHX
          </span>
          <span style={{ fontSize: 18, color: '#6B7280', marginLeft: 16 }}>
            Save now. Read never. Find always.
          </span>
        </div>

        {/* Tweet Card */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            borderRadius: 24,
            padding: 32,
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          {/* Author info */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
            {tweet.author.avatar_url && (
              <img
                src={tweet.author.avatar_url}
                alt={authorName}
                width={56}
                height={56}
                style={{ borderRadius: 28 }}
              />
            )}
            <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 16 }}>
              <span style={{ fontSize: 24, fontWeight: 600, color: 'white' }}>
                {authorName}
              </span>
              <span style={{ fontSize: 18, color: '#9CA3AF' }}>
                {authorHandle}
              </span>
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
              backgroundColor: '#8B5CF6',
              color: 'white',
              fontSize: 20,
              fontWeight: 600,
              padding: '12px 32px',
              borderRadius: 999,
            }}
          >
            Save this tweet to ADHX →
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
