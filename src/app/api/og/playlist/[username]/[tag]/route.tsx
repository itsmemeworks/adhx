import { ImageResponse } from 'next/og'
import type { NextRequest } from 'next/server'
import { getPublicTagCollection, type TagCollection, type TagItem } from '@/lib/tags/query'
import { PUBLIC_BASE_URL } from '@/lib/routes/base-url'
import { fetchWithAllowlistedRedirects, readResponseBodyWithLimit } from '@/lib/media/proxy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const WIDTH = 1200
const HEIGHT = 630
const MOSAIC_HEIGHT = 520
const BAR_HEIGHT = 104
const GROUT = 6
const MAX_THUMBNAILS = 5
const MAX_IMAGE_BYTES = 4 * 1024 * 1024
const MAX_FONT_BYTES = 256 * 1024
const INDIE_FLOWER_TTF =
  'https://raw.githubusercontent.com/google/fonts/ade3d1533e06b2b1462ffcde8e08b129627ca360/ofl/indieflower/IndieFlower-Regular.ttf'
const PLAY_TRIANGLE_COLUMNS = [27, 24, 21, 18, 15, 12, 9, 6, 3]
const SAME_ORIGIN_THUMBNAIL_PATHS = new Set([
  '/api/media/image',
  '/api/media/instagram/thumbnail',
  '/api/media/tiktok/thumbnail',
])
const PUBLIC_BASE_HOST = new URL(PUBLIC_BASE_URL).hostname
const IMAGE_HOSTS = [
  PUBLIC_BASE_HOST,
  'd.fixupx.com',
  'd.fxtwitter.com',
  'pbs.twimg.com',
  '.twimg.com',
  'i.ytimg.com',
  '.ytimg.com',
  '.cdninstagram.com',
  '.tiktokcdn.com',
  '.tiktokcdn-us.com',
  '.tiktokcdn-eu.com',
]

let indieFlowerFontPromise: Promise<ArrayBuffer> | null = null

function loadIndieFlowerFont(): Promise<ArrayBuffer> {
  if (!indieFlowerFontPromise) {
    indieFlowerFontPromise = fetchWithAllowlistedRedirects(INDIE_FLOWER_TTF, {
      hosts: ['raw.githubusercontent.com'],
      timeoutMs: 10_000,
      maxRedirects: 1,
    }).then(async (response) => {
      if (!response.ok) throw new Error(`Indie Flower request failed: ${response.status}`)
      const bytes = await readResponseBodyWithLimit(response, MAX_FONT_BYTES)
      return bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer
    })
  }
  return indieFlowerFontPromise
}

function imageOptions(fontData: ArrayBuffer | null) {
  return {
    width: WIDTH,
    height: HEIGHT,
    headers: {
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
    ...(fontData
      ? {
          fonts: [
            {
              name: 'Indie Flower',
              data: fontData,
              style: 'normal' as const,
              weight: 400 as const,
            },
          ],
        }
      : {}),
  }
}

function truncateTag(tag: string): string {
  return tag.length > 18 ? `${tag.slice(0, 17)}…` : tag
}

function initials(item: TagItem): string {
  const source = (item.authorName || item.author).trim()
  const words = source.split(/\s+/).filter(Boolean)
  if (words.length > 1) return `${words[0]![0]}${words[1]![0]}`.toUpperCase()
  return source.slice(0, 2).toUpperCase() || '—'
}

function platformChip(item: TagItem): string {
  if (item.contentType === 'article') return 'ARTICLE'
  if (item.platform === 'instagram') return 'IG'
  if (item.platform === 'tiktok') return 'TT'
  if (item.platform === 'youtube') return 'YT'
  return 'X'
}

function GobMark({ size, surface }: { size: number; surface: '#08070a' | '#e4dac8' }) {
  const paper = surface === '#e4dac8'
  const features = paper ? '#141414' : surface
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" aria-hidden="true">
      <g transform="rotate(-4 48 48)">
        <rect
          x="10"
          y="14"
          width="76"
          height="72"
          rx="28"
          fill="#FFD426"
          stroke={paper ? '#141414' : undefined}
          strokeWidth={paper ? 6 : undefined}
        />
        <circle cx="36" cy="46" r="7" fill={features} />
        <circle cx="63" cy="42" r="11" fill={features} />
        <circle cx="66" cy="39" r="3.5" fill="#FFD426" />
        <rect
          x="42"
          y="65.5"
          width="14"
          height="7"
          rx="3.5"
          fill={features}
          transform="rotate(-7 49 69)"
        />
      </g>
    </svg>
  )
}

function response(element: React.ReactElement, fontData: ArrayBuffer | null): ImageResponse {
  return new ImageResponse(element, imageOptions(fontData))
}

function privateCard(fontData: ArrayBuffer | null): ImageResponse {
  return response(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#08070a',
        color: '#F4F1EA',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
        <GobMark size={118} surface="#08070a" />
        <div
          style={{
            display: 'flex',
            color: '#FFD426',
            fontFamily: 'Indie Flower',
            fontWeight: 700,
            fontSize: 92,
            lineHeight: 1,
          }}
        >
          ADHX
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          marginTop: 32,
          fontFamily: 'Indie Flower',
          fontSize: 38,
          color: '#F4F1EA',
        }}
      >
        Save it. Lose it. Find it.
      </div>
      <div
        style={{
          display: 'flex',
          marginTop: 18,
          fontFamily: 'ui-monospace, monospace',
          fontSize: 22,
          color: '#b3a893',
        }}
      >
        adhx.com
      </div>
    </div>,
    fontData,
  )
}

function identifiedFallback(data: TagCollection, fontData: ArrayBuffer | null): ImageResponse {
  return response(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#e4dac8',
        color: '#141414',
        padding: '74px 84px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 42 }}>
        <GobMark size={170} surface="#e4dac8" />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              fontFamily: 'Indie Flower',
              fontWeight: 700,
              fontSize: 76,
              lineHeight: 1,
            }}
          >
            #{truncateTag(data.tag)}
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: 22,
              fontFamily: 'ui-monospace, monospace',
              fontSize: 23,
              color: '#322b23',
            }}
          >
            curated by @{data.username} · {data.tweetCount}{' '}
            {data.tweetCount === 1 ? 'post' : 'posts'}
          </div>
        </div>
      </div>
    </div>,
    fontData,
  )
}

async function thumbnailDataUrl(rawUrl: string): Promise<string | null> {
  const absoluteUrl = rawUrl.startsWith('/') ? new URL(rawUrl, PUBLIC_BASE_URL).toString() : rawUrl

  try {
    const parsed = new URL(absoluteUrl)
    if (parsed.hostname === PUBLIC_BASE_HOST && !SAME_ORIGIN_THUMBNAIL_PATHS.has(parsed.pathname)) {
      return null
    }
    const upstream = await fetchWithAllowlistedRedirects(absoluteUrl, {
      hosts: IMAGE_HOSTS,
      timeoutMs: 8_000,
      init: {
        headers: {
          Accept: 'image/avif,image/webp,image/png,image/jpeg,*/*',
          'User-Agent': 'ADHX-Playlist-Card/1.0',
        },
      },
    })
    if (!upstream.ok) {
      await upstream.body?.cancel()
      return null
    }
    const contentType = upstream.headers.get('content-type')?.split(';')[0]?.trim()
    if (!contentType?.startsWith('image/')) {
      await upstream.body?.cancel()
      return null
    }
    const bytes = await readResponseBodyWithLimit(upstream, MAX_IMAGE_BYTES)
    if (bytes.byteLength === 0) return null
    return `data:${contentType};base64,${Buffer.from(bytes).toString('base64')}`
  } catch {
    return null
  }
}

interface LoadedThumbnail {
  item: TagItem
  src: string
}

async function loadThumbnails(items: TagItem[]): Promise<LoadedThumbnail[]> {
  const candidates = items.filter((item) => item.thumbnailUrl).slice(0, 10)
  const loaded = await Promise.all(
    candidates.map(async (item) => {
      const src = await thumbnailDataUrl(item.thumbnailUrl!)
      return src ? { item, src } : null
    }),
  )
  return loaded.filter((entry): entry is LoadedThumbnail => entry !== null).slice(0, MAX_THUMBNAILS)
}

function PlayBadge() {
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: 66,
        height: 66,
        borderRadius: 999,
        transform: 'translate(-50%, -50%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(8,7,10,.78)',
        border: '2px solid rgba(244,241,234,.8)',
      }}
    >
      <div
        style={{
          width: 25,
          height: 27,
          marginLeft: 5,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {PLAY_TRIANGLE_COLUMNS.map((height, index) => (
          <div
            key={`${height}:${index}`}
            style={{ display: 'flex', width: 3, height, backgroundColor: '#F4F1EA' }}
          />
        ))}
      </div>
    </div>
  )
}

function MoreChip({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <div
      style={{
        position: 'absolute',
        right: 18,
        bottom: 18,
        display: 'flex',
        padding: '9px 15px',
        borderRadius: 999,
        backgroundColor: 'rgba(8,7,10,.82)',
        border: '1px solid rgba(244,241,234,.45)',
        color: '#F4F1EA',
        fontFamily: 'ui-monospace, monospace',
        fontSize: 18,
      }}
    >
      +{count} more
    </div>
  )
}

function ThumbnailTile({
  thumbnail,
  more,
  style,
}: {
  thumbnail: LoadedThumbnail
  more?: number
  style?: React.CSSProperties
}) {
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        overflow: 'hidden',
        backgroundColor: '#322b23',
        ...style,
      }}
    >
      <img
        src={thumbnail.src}
        alt=""
        width="100%"
        height="100%"
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
      {thumbnail.item.contentType === 'video' ? <PlayBadge /> : null}
      {more ? <MoreChip count={more} /> : null}
    </div>
  )
}

function Mosaic({ thumbnails, total }: { thumbnails: LoadedThumbnail[]; total: number }) {
  const count = thumbnails.length
  const more = Math.max(0, total - count)
  const lastMore = (index: number) => (index === count - 1 ? more : 0)

  if (count === 1) {
    return (
      <ThumbnailTile
        thumbnail={thumbnails[0]!}
        more={lastMore(0)}
        style={{ width: WIDTH, height: MOSAIC_HEIGHT }}
      />
    )
  }

  if (count === 2) {
    return (
      <div style={{ width: WIDTH, height: MOSAIC_HEIGHT, display: 'flex', gap: GROUT }}>
        <ThumbnailTile thumbnail={thumbnails[0]!} style={{ width: 740, height: MOSAIC_HEIGHT }} />
        <ThumbnailTile
          thumbnail={thumbnails[1]!}
          more={lastMore(1)}
          style={{ width: 454, height: MOSAIC_HEIGHT }}
        />
      </div>
    )
  }

  if (count === 3) {
    return (
      <div style={{ width: WIDTH, height: MOSAIC_HEIGHT, display: 'flex', gap: GROUT }}>
        <ThumbnailTile thumbnail={thumbnails[0]!} style={{ width: 740, height: MOSAIC_HEIGHT }} />
        <div
          style={{
            width: 454,
            height: MOSAIC_HEIGHT,
            display: 'flex',
            flexDirection: 'column',
            gap: GROUT,
          }}
        >
          <ThumbnailTile thumbnail={thumbnails[1]!} style={{ width: 454, height: 257 }} />
          <ThumbnailTile
            thumbnail={thumbnails[2]!}
            more={lastMore(2)}
            style={{ width: 454, height: 257 }}
          />
        </div>
      </div>
    )
  }

  if (count === 4) {
    return (
      <div
        style={{
          width: WIDTH,
          height: MOSAIC_HEIGHT,
          display: 'flex',
          flexDirection: 'column',
          gap: GROUT,
        }}
      >
        <div style={{ width: WIDTH, height: 310, display: 'flex', gap: GROUT }}>
          <ThumbnailTile thumbnail={thumbnails[0]!} style={{ width: 720, height: 310 }} />
          <ThumbnailTile thumbnail={thumbnails[1]!} style={{ width: 474, height: 310 }} />
        </div>
        <div style={{ width: WIDTH, height: 204, display: 'flex', gap: GROUT }}>
          <ThumbnailTile thumbnail={thumbnails[2]!} style={{ width: 474, height: 204 }} />
          <ThumbnailTile
            thumbnail={thumbnails[3]!}
            more={lastMore(3)}
            style={{ width: 720, height: 204 }}
          />
        </div>
      </div>
    )
  }

  return (
    <div style={{ width: WIDTH, height: MOSAIC_HEIGHT, display: 'flex', gap: GROUT }}>
      <ThumbnailTile thumbnail={thumbnails[0]!} style={{ width: 594, height: MOSAIC_HEIGHT }} />
      <div
        style={{
          width: 600,
          height: MOSAIC_HEIGHT,
          display: 'flex',
          flexWrap: 'wrap',
          gap: GROUT,
        }}
      >
        {thumbnails.slice(1, 5).map((thumbnail, index) => (
          <ThumbnailTile
            key={`${thumbnail.item.platform}:${thumbnail.item.bookmarkId}`}
            thumbnail={thumbnail}
            more={index === 3 ? lastMore(4) : 0}
            style={{ width: 297, height: 257 }}
          />
        ))}
      </div>
    </div>
  )
}

function TextTile({
  item,
  index,
  width,
  height,
}: {
  item: TagItem
  index: number
  width: number
  height: number
}) {
  const paper = index % 2 === 0
  return (
    <div
      style={{
        width,
        height,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        padding: '28px 30px',
        backgroundColor: paper ? '#e4dac8' : '#322b23',
        color: paper ? '#141414' : '#F4F1EA',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: paper ? '#141414' : '#e4dac8',
              color: paper ? '#F4F1EA' : '#141414',
              fontFamily: 'ui-monospace, monospace',
              fontSize: 15,
              fontWeight: 700,
            }}
          >
            {initials(item)}
          </div>
          <div
            style={{
              display: 'flex',
              fontFamily: 'ui-monospace, monospace',
              fontSize: 15,
              opacity: 0.72,
            }}
          >
            @{item.author}
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            borderRadius: 999,
            padding: '6px 10px',
            backgroundColor: paper ? '#FFD426' : '#08070a',
            color: paper ? '#141414' : '#FFD426',
            fontFamily: 'ui-monospace, monospace',
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {platformChip(item)}
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          marginTop: 20,
          maxHeight: height - 104,
          overflow: 'hidden',
          fontSize: width > 500 ? 34 : 26,
          lineHeight: 1.22,
        }}
      >
        {item.text}
      </div>
    </div>
  )
}

function TextMosaic({ items }: { items: TagItem[] }) {
  const textItems = items.filter((item) => item.text?.trim()).slice(0, 6)
  const count = textItems.length
  const columns = count <= 1 ? 1 : count <= 3 ? count : count === 4 ? 2 : 3
  const rows = Math.ceil(count / columns)
  const width = (WIDTH - GROUT * (columns - 1)) / columns
  const height = (MOSAIC_HEIGHT - GROUT * (rows - 1)) / rows

  return (
    <div
      style={{
        width: WIDTH,
        height: MOSAIC_HEIGHT,
        display: 'flex',
        flexWrap: 'wrap',
        gap: GROUT,
        backgroundColor: '#08070a',
      }}
    >
      {textItems.map((item, index) => (
        <TextTile
          key={`${item.platform}:${item.bookmarkId}`}
          item={item}
          index={index}
          width={width}
          height={height}
        />
      ))}
    </div>
  )
}

function BrandBar({ data }: { data: TagCollection }) {
  return (
    <div
      style={{
        width: WIDTH,
        height: BAR_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '0 28px',
        backgroundColor: '#08070a',
        color: '#F4F1EA',
      }}
    >
      <GobMark size={42} surface="#08070a" />
      <div
        style={{
          display: 'flex',
          fontFamily: 'Indie Flower',
          fontWeight: 700,
          fontSize: 28,
          color: '#F4F1EA',
        }}
      >
        ADHX
      </div>
      <div
        style={{
          display: 'flex',
          marginLeft: 12,
          fontFamily: 'Indie Flower',
          fontWeight: 700,
          fontSize: 46,
          color: '#FFD426',
          whiteSpace: 'nowrap',
        }}
      >
        #{truncateTag(data.tag)}
      </div>
      <div
        style={{
          display: 'flex',
          marginLeft: 8,
          color: '#b3a893',
          fontFamily: 'ui-monospace, monospace',
          fontSize: 16,
          whiteSpace: 'nowrap',
        }}
      >
        curated by @{data.username} · {data.tweetCount} {data.tweetCount === 1 ? 'post' : 'posts'}
      </div>
      <div
        style={{
          display: 'flex',
          marginLeft: 'auto',
          flexShrink: 0,
          borderRadius: 999,
          padding: '13px 20px',
          backgroundColor: '#FFD426',
          color: '#141414',
          fontFamily: 'ui-monospace, monospace',
          fontSize: 16,
          fontWeight: 700,
          whiteSpace: 'nowrap',
          gap: 9,
          alignItems: 'center',
        }}
      >
        <span>Watch playlist</span>
        <svg width="19" height="12" viewBox="0 0 19 12" aria-hidden="true">
          <path d="M1 6h16M12 1l5 5-5 5" fill="none" stroke="#141414" strokeWidth="2" />
        </svg>
      </div>
    </div>
  )
}

function playlistCard(
  data: TagCollection,
  thumbnails: LoadedThumbnail[],
  fontData: ArrayBuffer | null,
): ImageResponse {
  const textItems = data.items.filter((item) => item.text?.trim())
  if (thumbnails.length === 0 && textItems.length === 0) {
    return identifiedFallback(data, fontData)
  }

  return response(
    <div
      style={{
        width: WIDTH,
        height: HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#08070a',
      }}
    >
      {thumbnails.length > 0 ? (
        <Mosaic thumbnails={thumbnails} total={data.tweetCount} />
      ) : (
        <TextMosaic items={textItems} />
      )}
      <div style={{ display: 'flex', width: WIDTH, height: GROUT, backgroundColor: '#08070a' }} />
      <BrandBar data={data} />
    </div>,
    fontData,
  )
}

function decodeParam(value: string): string | null {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string; tag: string }> },
) {
  const fontData = await loadIndieFlowerFont().catch(() => {
    indieFlowerFontPromise = null
    return null
  })
  if (request.nextUrl.searchParams.get('generic') === '1') return privateCard(fontData)

  const raw = await params
  const username = decodeParam(raw.username)
  const tag = decodeParam(raw.tag)
  if (!username || !tag) return privateCard(fontData)

  let result: Awaited<ReturnType<typeof getPublicTagCollection>>
  try {
    result = await getPublicTagCollection(username, tag)
  } catch {
    return privateCard(fontData)
  }
  if (result.status !== 'ok') return privateCard(fontData)

  const { data } = result
  if (data.items.length === 0) return identifiedFallback(data, fontData)

  try {
    const thumbnails = await loadThumbnails(data.items)
    return playlistCard(data, thumbnails, fontData)
  } catch {
    return identifiedFallback(data, fontData)
  }
}
