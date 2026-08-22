import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { POST, PREVIEW_IG, PREVIEW_TT, PREVIEW_YT } from './constants'

function tweetPayload(author: string, id: string) {
  const known = Object.values(POST).find((p) => p.id === id)
  const text = known?.text ?? `E2E tweet ${id}`
  const name = known?.authorName ?? author
  return {
    code: 200,
    message: 'OK',
    tweet: {
      id,
      url: `https://x.com/${author}/status/${id}`,
      text,
      author: {
        id: '1',
        name,
        screen_name: author,
        avatar_url:
          'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png',
      },
      created_at: '2026-08-22T12:00:00.000Z',
      replies: 0,
      retweets: 0,
      likes: 0,
    },
  }
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

function html(res: ServerResponse, body: string) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(body)
}

function instagramOg(id: string): string {
  const known = id === PREVIEW_IG.id ? PREVIEW_IG : { text: `E2E reel ${id}`, author: 'e2eig' }
  return `<!doctype html><html><head>
<meta property="og:title" content="${known.text}" />
<meta name="twitter:title" content="E2E Ig (@${known.author})" />
<meta property="og:description" content="${known.text}" />
</head><body></body></html>`
}

function tiktokOg(username: string, id: string): string {
  const text = id === PREVIEW_TT.id ? PREVIEW_TT.text : `E2E tiktok ${id}`
  const handle = username.replace(/^@/, '')
  return `<!doctype html><html><head>
<meta property="og:video" content="https://tnktok.com/generate/video/${id}.mp4" />
<meta property="og:title" content="E2E Tik (@${handle})" />
<meta property="og:description" content="${text}" />
<meta name="twitter:creator" content="@${handle}" />
</head><body></body></html>`
}

function youtubeOembed(videoId: string) {
  const title = videoId === PREVIEW_YT.id ? PREVIEW_YT.text : `E2E short ${videoId}`
  return {
    title,
    author_name: PREVIEW_YT.authorName,
    author_url: `https://www.youtube.com/@${PREVIEW_YT.author}`,
  }
}

/** FxTwitter + IG OG + TikTok OG + YouTube oEmbed stand-in for isolated e2e. */
export function startFxMock(port: number, host = '127.0.0.1'): Server {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://${host}`)
    const pathOnly = url.pathname

    if (pathOnly === '/oembed') {
      const watch = url.searchParams.get('url') ?? ''
      const id = new URL(watch).searchParams.get('v') ?? ''
      json(res, 200, youtubeOembed(id))
      return
    }

    const ig = pathOnly.match(/^\/(?:reel|p)\/([^/]+)\/?$/)
    if (ig) {
      html(res, instagramOg(ig[1] ?? ''))
      return
    }

    const tt = pathOnly.match(/^\/@([^/]+)\/video\/(\d+)\/?$/)
    if (tt) {
      html(res, tiktokOg(tt[1] ?? '', tt[2] ?? ''))
      return
    }

    const tweet = pathOnly.match(/^\/([^/]+)\/status\/(\d+)\/?$/)
    if (tweet) {
      const author = decodeURIComponent(tweet[1] ?? '')
      const id = tweet[2] ?? ''
      json(res, 200, tweetPayload(author, id))
      return
    }

    json(res, 404, { code: 404, message: 'not found' })
  })
  server.listen(port, host)
  return server
}
