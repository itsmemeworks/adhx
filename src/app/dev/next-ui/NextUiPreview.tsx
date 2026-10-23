'use client'

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import type { FeedItem } from '@/components/feed/types'
import {
  AdhxFace,
  AdhxLoader,
  ArticleStage,
  ArticleTile,
  GifTile,
  NextTile,
  PasteToast,
  PhotoTile,
  PostStage,
  PostTile,
  Shimmer,
  StageSkeleton,
  TallVideoStage,
  VideoTile,
  WideMediaStage,
  isTallMedia,
  nextPostKind,
  postAuthor,
  postCoverSrc,
  type NextPostKind,
} from '@/components/next'
import { SAMPLE_ITEMS } from './samples'

type LoadState =
  { status: 'loading' } | { status: 'ready'; items: FeedItem[]; source: 'feed' | 'samples' }

const FILTERS = ['videos', 'photos', 'text', 'articles'] as const

async function loadSavedPosts(): Promise<FeedItem[] | null> {
  const responses = await Promise.all(
    FILTERS.map((filter) =>
      fetch(`/api/feed?filter=${filter}&limit=40`, { credentials: 'same-origin' }),
    ),
  )
  if (responses.some((r) => r.status === 401)) return null
  const pages = await Promise.all(
    responses.map(async (r) => (r.ok ? ((await r.json()) as { items: FeedItem[] }).items : [])),
  )
  const seen = new Set<string>()
  return pages.flat().filter((item) => !seen.has(item.id) && seen.add(item.id))
}

function byKind(items: FeedItem[]): Record<NextPostKind, FeedItem[]> {
  const out: Record<NextPostKind, FeedItem[]> = {
    video: [],
    gif: [],
    photo: [],
    post: [],
    article: [],
  }
  for (const item of items) out[nextPostKind(item)].push(item)
  return out
}

function Section({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="m-0 font-nx-serif text-[30px] font-normal leading-tight sm:text-[38px]">
          {title}
        </h2>
        <span className="text-[14px] text-nx-ink-faint">{note}</span>
      </div>
      {children}
    </section>
  )
}

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <figure className="m-0 flex min-w-0 flex-col gap-2">
      {children}
      <figcaption className="text-[12px] text-nx-ink-faint">{label}</figcaption>
    </figure>
  )
}

function Row({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={style}
      className="scrollbar-hide -mx-4 flex items-start gap-4 overflow-x-auto px-4 pb-2 sm:-mx-8 sm:px-8 [&>*]:shrink-0"
    >
      {children}
    </div>
  )
}

function Missing({ what }: { what: string }) {
  return (
    <p className="m-0 rounded-xl border border-dashed border-nx-hairline px-4 py-3 text-[13px] text-nx-ink-faint">
      {`No saved ${what} to show yet.`}
    </p>
  )
}

/** Shimmer placeholders that resolve into real tiles after a beat, on a loop. */
function ShimmerThenPop({ items }: { items: FeedItem[] }) {
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    const id = window.setInterval(() => setLoaded((v) => !v), 2600)
    return () => window.clearInterval(id)
  }, [])
  const widths = [150, 150, 190, 150, 150]
  return (
    <div className="scrollbar-hide -mx-4 flex h-[200px] gap-2.5 overflow-x-auto px-4 sm:-mx-8 sm:px-8">
      {widths.map((w, i) => {
        const item = items[i]
        const src = item ? postCoverSrc(item) : null
        return loaded && src ? (
          <span
            key={`img-${i}`}
            className="relative block h-full shrink-0 animate-nx-pop overflow-hidden rounded-[12px] bg-nx-surface"
            style={{ width: w }}
          >
            <img
              src={src}
              alt=""
              referrerPolicy="no-referrer"
              className="absolute inset-0 h-full w-full object-cover"
            />
          </span>
        ) : (
          <Shimmer
            key={`sh-${i}`}
            delayMs={i * 100}
            style={{ width: w }}
            className="h-full shrink-0"
          />
        )
      })}
    </div>
  )
}

export function NextUiPreview() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    loadSavedPosts()
      .then((items) => {
        if (cancelled) return
        if (items && items.length > 0) setState({ status: 'ready', items, source: 'feed' })
        else setState({ status: 'ready', items: SAMPLE_ITEMS, source: 'samples' })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'ready', items: SAMPLE_ITEMS, source: 'samples' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const items = state.status === 'ready' ? state.items : []
  const kinds = byKind(items)
  const tallVideo = kinds.video.find(isTallMedia) ?? kinds.video[0]
  const wideVideo = kinds.video.find((v) => !isTallMedia(v))
  const album = kinds.photo.find((p) => (p.media?.length ?? 0) > 1) ?? kinds.photo[0]
  const singlePhoto = kinds.photo.find((p) => (p.media?.length ?? 0) === 1)
  const post = kinds.post[0]
  const longPost = [...kinds.post].sort((a, b) => b.text.length - a.text.length)[0]
  const article = kinds.article.find((a) => postCoverSrc(a)) ?? kinds.article[0]
  const wideMedia = wideVideo ?? singlePhoto ?? album
  const savedItem = tallVideo ?? album ?? kinds.gif[0]

  return (
    <main className="min-h-screen bg-nx-bg font-nx-sans text-nx-cream">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-10 px-4 py-8 sm:px-8 sm:py-10">
        <header className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <AdhxFace size={40} />
            <h1 className="m-0 font-nx-serif text-[40px] font-normal leading-none sm:text-[52px]">
              The new look
            </h1>
          </div>
          <p className="m-0 max-w-[720px] text-[15px] leading-relaxed text-nx-ink-soft">
            Every card, stage and loading state for the redesign, drawn with your saved posts.
            Nothing here is live yet — pages switch over behind the next_ui flag.
          </p>
          {state.status === 'ready' && state.source === 'samples' && (
            <p className="m-0 rounded-xl bg-nx-accent px-4 py-3 text-[14px] font-semibold text-black">
              Showing sample posts — sign in to see your own saves here.
            </p>
          )}
        </header>

        {state.status === 'loading' ? (
          <div className="flex h-[420px] items-center justify-center rounded-[22px] bg-nx-stage">
            <AdhxLoader />
          </div>
        ) : (
          <>
            <Section title="In a row" note="Same height, shape follows the post">
              <Row>
                {tallVideo && (
                  <Labelled label="Tall video">
                    <VideoTile item={tallVideo} />
                  </Labelled>
                )}
                {tallVideo && (
                  <Labelled label="…playing now">
                    <VideoTile item={tallVideo} playing />
                  </Labelled>
                )}
                {wideVideo && (
                  <Labelled label="Wide video">
                    <VideoTile item={wideVideo} />
                  </Labelled>
                )}
                {album && (
                  <Labelled label="Photo album">
                    <PhotoTile item={album} />
                  </Labelled>
                )}
                {post && (
                  <Labelled label="Post">
                    <PostTile item={post} />
                  </Labelled>
                )}
                {article && (
                  <Labelled label="Article">
                    <ArticleTile item={article} />
                  </Labelled>
                )}
                {kinds.gif[0] && (
                  <Labelled label="GIF">
                    <GifTile item={kinds.gif[0]} />
                  </Labelled>
                )}
              </Row>
              {!kinds.gif[0] && <Missing what="GIFs" />}
              {!wideVideo && <Missing what="wide videos" />}
            </Section>

            {(['video', 'photo', 'post', 'article', 'gif'] as const).map((kind) => (
              <Section
                key={kind}
                title={
                  {
                    video: 'Videos',
                    photo: 'Photos',
                    post: 'Posts',
                    article: 'Articles',
                    gif: 'GIFs',
                  }[kind]
                }
                note={`${kinds[kind].length} saved · first 8 shown`}
              >
                {kinds[kind].length ? (
                  <Row style={{ '--nx-tile-h': '300px' } as CSSProperties}>
                    {kinds[kind].slice(0, 8).map((item) => (
                      <NextTile key={item.id} item={item} onClick={() => undefined} />
                    ))}
                  </Row>
                ) : (
                  <Missing what={kind === 'gif' ? 'GIFs' : `${kind}s`} />
                )}
              </Section>
            ))}

            <Section title="On the stage" note="Every type gets its own stage, never a black box">
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,390px)_minmax(0,1fr)]">
                {tallVideo && (
                  <Labelled label="Tall video — full-bleed cover">
                    <div className="h-[700px] overflow-hidden rounded-nx-stage">
                      <TallVideoStage item={tallVideo} progress={0.38} />
                    </div>
                  </Labelled>
                )}
                <div className="flex min-w-0 flex-col gap-5">
                  {wideMedia && (
                    <Labelled label="Wide media — its own blurred colours fill the sides">
                      <div className="h-[420px] overflow-hidden rounded-nx-stage">
                        <WideMediaStage item={wideMedia} progress={0.6} />
                      </div>
                    </Labelled>
                  )}
                  {post && (
                    <Labelled label="Post — big type, a dwell timer">
                      <div className="h-[420px] overflow-hidden rounded-nx-stage">
                        <PostStage item={post} progress={0.62} />
                      </div>
                    </Labelled>
                  )}
                </div>
              </div>
              {longPost && longPost !== post && (
                <Labelled label="Post — a long one">
                  <div className="h-[520px] overflow-hidden rounded-nx-stage">
                    <PostStage item={longPost} />
                  </div>
                </Labelled>
              )}
              {article && (
                <Labelled label="Article — waits for you instead of auto-skipping">
                  <div className="h-[640px] overflow-hidden rounded-nx-stage sm:h-[420px]">
                    <ArticleStage item={article} onSkip={() => undefined} />
                  </div>
                </Labelled>
              )}
            </Section>

            <Section title="Loading" note="The face bounces, looks around, blinks">
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_236px_minmax(0,1fr)]">
                <Labelled label="First fetch of a post">
                  <div className="flex h-[420px] items-center justify-center rounded-[22px] bg-nx-stage">
                    <AdhxLoader />
                  </div>
                </Labelled>
                <Labelled label="On the stage — a skeleton holds the layout">
                  <div className="mx-auto h-[420px] w-[236px] overflow-hidden rounded-[22px]">
                    <StageSkeleton />
                  </div>
                </Labelled>
                <Labelled label="Paste toasts">
                  <div className="flex flex-col gap-3.5 rounded-[22px] bg-nx-stage p-[18px] lg:min-h-[420px]">
                    <PasteToast
                      state="grabbing"
                      url={savedItem?.tweetUrl ?? 'https://x.com/someone/status/2105233786'}
                    />
                    <PasteToast
                      state="saved"
                      thumbSrc={savedItem ? postCoverSrc(savedItem) : null}
                      savedDetail={
                        savedItem ? `${postAuthor(savedItem).handle} · playing now` : 'playing now'
                      }
                    />
                    <PasteToast
                      state="saved"
                      thumbSrc={savedItem ? postCoverSrc(savedItem) : null}
                      savedDetail="playing now"
                      action={{ label: 'Add to channel', onClick: () => undefined }}
                    />
                    <PasteToast state="failed" />
                  </div>
                </Labelled>
              </div>
              <Labelled label="Rows and grids — shimmer while thumbnails load, then each pops in">
                <ShimmerThenPop items={[...kinds.video, ...kinds.photo, ...kinds.gif]} />
              </Labelled>
            </Section>
          </>
        )}
      </div>
    </main>
  )
}
