'use client'

import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react'
import { ArrowRight, X } from 'lucide-react'
import type { FeedItem } from '@/components/feed/types'
import { toBionicText } from '@/components/feed/text-rendering'
import { fetchArticleMarkdown } from '@/lib/theater/article-body'
import {
  inlinePlainText,
  parseArticleMarkdown,
  type ArticleMdBlock,
  type InlineNode,
} from '@/lib/theater/article-markdown'
import { articleHeadline, articleLede, postAuthor, postCoverSrc } from '../post'
import { NxAvatar, NxImage } from '../primitives'
import { cn } from '@/lib/utils'
import { useReadingSettings } from './index'

/**
 * The whole article, read in the theater: headline, author, cover and the
 * full body (headings, paragraphs, quotes, lists, images, links), in the
 * viewer's reading font, with Bionic Reading when it's on. The body comes
 * from the same public tweet JSON the preview pages use
 * (`fetchArticleMarkdown`); without it the reader shows the summary and a
 * link to the original.
 */

function inline(nodes: InlineNode[], key: string, bionic: boolean, styled = false): ReactNode[] {
  return nodes.map((node, i) => {
    const k = `${key}-${i}`
    switch (node.type) {
      case 'text':
        return <span key={k}>{bionic && !styled ? toBionicText(node.text) : node.text}</span>
      case 'bold':
        return <strong key={k}>{inline(node.children, k, bionic, true)}</strong>
      case 'italic':
        return <em key={k}>{inline(node.children, k, bionic, true)}</em>
      case 'boldItalic':
        return (
          <strong key={k}>
            <em>{inline(node.children, k, bionic, true)}</em>
          </strong>
        )
      case 'link':
        return (
          <a
            key={k}
            href={node.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-nx-accent underline decoration-nx-accent/40 underline-offset-2"
          >
            {inline(node.children, k, bionic, true)}
          </a>
        )
      default:
        return null
    }
  })
}

/** An article's body blocks, as the reader draws them (also the original-post sheet). */
export function articleBlocks(list: ArticleMdBlock[], bionic: boolean): ReactNode[] {
  return list.map((block, i) => {
    const key = `b-${i}`
    const label = bionic && 'inline' in block ? inlinePlainText(block.inline) : undefined
    switch (block.type) {
      case 'heading': {
        const Tag = block.level === 1 ? 'h2' : block.level === 2 ? 'h3' : 'h4'
        return (
          <Tag
            key={key}
            aria-label={label}
            className="mb-3 mt-10 font-nx-serif font-normal leading-[1.1] text-nx-cream"
            style={{ fontSize: block.level === 1 ? 34 : block.level === 2 ? 28 : 23 }}
          >
            {inline(block.inline, key, bionic)}
          </Tag>
        )
      }
      case 'divider':
        return <hr key={key} className="my-10 border-nx-hairline" />
      case 'image':
        return (
          <img
            key={key}
            src={block.src}
            alt={block.alt}
            referrerPolicy="no-referrer"
            className="my-7 w-full rounded-2xl object-cover"
          />
        )
      case 'quote':
        return (
          <blockquote
            key={key}
            aria-label={label}
            className="my-7 border-l-2 border-nx-accent/70 pl-5 font-nx-serif text-[22px] italic leading-[1.35] text-nx-cream"
          >
            {inline(block.inline, key, bionic)}
          </blockquote>
        )
      case 'list-item':
        return (
          <p key={key} aria-label={label} className="my-2 flex gap-3 pl-1">
            <span aria-hidden className="text-nx-accent">
              •
            </span>
            <span>{inline(block.inline, key, bionic)}</span>
          </p>
        )
      case 'paragraph':
      default:
        return (
          <p key={key} aria-label={label} className="my-5">
            {inline(block.inline, key, bionic)}
          </p>
        )
    }
  })
}

export function ArticleReader({
  item,
  onClose,
  onNext,
  inline = false,
  onProgress,
  seekRef,
}: {
  item: FeedItem
  /** Overlay mode only: closes the reader (also on Escape). */
  onClose?: () => void
  /** "Next" at the end of the article. */
  onNext?: () => void
  /** Fill the parent (the theater's stage) instead of covering the screen. */
  inline?: boolean
  /** How far through the article the reader is (0–1), as they scroll. */
  onProgress?: (progress: number) => void
  /** Filled with a function that scrolls to a point (0–1), for an outside progress bar. */
  seekRef?: MutableRefObject<((progress: number) => void) | null>
}) {
  const reading = useReadingSettings()
  const [markdown, setMarkdown] = useState<string | null | undefined>(undefined)
  const [progress, setProgress] = useState(0)
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!seekRef) return
    seekRef.current = (p) => {
      const el = scroller.current
      if (el) el.scrollTop = p * Math.max(0, el.scrollHeight - el.clientHeight)
    }
    return () => {
      seekRef.current = null
    }
  }, [seekRef])
  const author = postAuthor(item)
  const cover = postCoverSrc(item)
  const original = item.articlePreview?.url || item.tweetUrl

  useEffect(() => {
    let alive = true
    setMarkdown(undefined)
    fetchArticleMarkdown(item.author, item.id).then((md) => {
      if (alive) setMarkdown(md)
    })
    return () => {
      alive = false
    }
  }, [item.author, item.id])

  useEffect(() => {
    if (!onClose) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const parsed = markdown ? parseArticleMarkdown(markdown) : []
  // The body often opens with the headline or the cover again; skip those.
  const headline = articleHeadline(item)
  const body = parsed.filter(
    (b, i) =>
      !(i < 2 && b.type === 'heading' && inlinePlainText(b.inline).trim() === headline.trim()) &&
      !(i < 3 && b.type === 'image' && cover && b.src === cover),
  )

  return (
    <div
      role={inline ? 'region' : 'dialog'}
      aria-modal={inline ? undefined : true}
      aria-label={`Reading: ${headline}`}
      className={cn(
        'flex flex-col bg-nx-bg font-nx-sans text-nx-ink-soft',
        inline ? 'relative h-full w-full' : 'absolute inset-0 z-40',
      )}
    >
      {!inline && (
        <div aria-hidden className="h-1 shrink-0 bg-white/10">
          <div
            className="h-1 bg-nx-accent transition-[width]"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      )}
      {onClose && (
        <button
          type="button"
          aria-label="Close the article"
          onClick={onClose}
          className="nx-plate absolute right-4 top-[max(16px,env(safe-area-inset-top))] z-10 flex h-11 w-11 items-center justify-center rounded-full text-nx-ink"
        >
          <X aria-hidden className="h-5 w-5" />
        </button>
      )}
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget
          const max = el.scrollHeight - el.clientHeight
          const p = max > 0 ? Math.min(1, el.scrollTop / max) : 1
          setProgress(p)
          onProgress?.(p)
        }}
        className={cn(
          'min-h-0 flex-1 overflow-y-auto',
          // In the theater the bottom bar shows progress; no second scrollbar.
          inline && '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        )}
      >
        <article
          className={cn(
            'mx-auto w-full max-w-[720px] px-5 text-[18px] leading-[1.7]',
            inline ? 'pb-10 pt-8' : 'pb-28 pt-14 md:pt-20',
          )}
          style={reading.font ? { fontFamily: reading.font } : undefined}
        >
          <span className="text-xs font-extrabold uppercase tracking-[1.4px] text-nx-accent">
            Article
          </span>
          <h1 className="m-0 mt-3 font-nx-serif text-[clamp(34px,5vw,56px)] font-normal leading-[1.02] text-nx-cream">
            {headline}
          </h1>
          <div className="mt-5 flex items-center gap-3 font-nx-sans text-[15px]">
            <NxAvatar author={author} size={36} />
            <span className="flex flex-col leading-tight">
              <span className="font-bold text-nx-cream">{author.name}</span>
              <span className="text-nx-ink-faint">{author.handle}</span>
            </span>
          </div>
          {cover && (
            <span className="relative mt-7 block aspect-[16/9] overflow-hidden rounded-2xl bg-nx-surface">
              <NxImage src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
            </span>
          )}
          {markdown === undefined ? (
            <div aria-label="Loading the article" className="mt-8 flex flex-col gap-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className="nx-shimmer animate-nx-shimmer block h-4 rounded"
                  style={{ width: `${90 - i * 7}%` }}
                />
              ))}
            </div>
          ) : body.length ? (
            <div className="mt-4">{articleBlocks(body, reading.bionic)}</div>
          ) : (
            <>
              <p className="mt-8">
                {reading.bionic ? toBionicText(articleLede(item)) : articleLede(item)}
              </p>
              <p className="mt-6 font-nx-sans text-[15px] text-nx-ink-faint">
                The full article didn’t load here.{' '}
                <a
                  href={original}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-nx-accent underline"
                >
                  Read it on X
                </a>
              </p>
            </>
          )}
          {markdown !== undefined && (
            <div className="mt-12 flex flex-wrap gap-3 border-t border-nx-hairline pt-8 font-nx-sans">
              {onNext && (
                <button
                  type="button"
                  onClick={onNext}
                  className="flex h-12 items-center gap-2 rounded-full bg-nx-accent px-6 text-[15px] font-extrabold text-black"
                >
                  <span>Next</span>
                  <ArrowRight aria-hidden className="h-4 w-4" />
                </button>
              )}
              <a
                href={original}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-12 items-center rounded-full border border-nx-cream/30 px-6 text-[15px] font-semibold text-nx-cream"
              >
                Open the original
              </a>
            </div>
          )}
        </article>
      </div>
    </div>
  )
}
