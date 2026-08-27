'use client'

/**
 * Article stage: cover splash → in-stage reader (spec §3/§6). The splash
 * (cover + headline) renders immediately from data already on `item`, then
 * fills either value from the article response when a sparse seed omitted it.
 * The full body comes from the public tweet JSON API
 * (`/api/share/tweet/{author}/{id}`, 5-min cache), whose `article.content` is
 * already `articleBlocksToMarkdown` output
 * (see `src/app/api/share/tweet/[username]/[id]/route.ts`). A reading-progress
 * bar (bound to the reader's scroll position) replaces the video time bar.
 *
 * Markdown rendering is a small pure parser (`@/lib/theater/article-markdown`)
 * — no new dependency, no `dangerouslySetInnerHTML`. Anything outside the
 * known subset (headings/paragraphs/quotes/list-items/images/dividers/links)
 * is carried as plain text and rendered as a React text node, so it's inert
 * by construction.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { toBionicText } from '@/components/feed/text-rendering'
import { usePreferences } from '@/lib/preferences-context'
import { previewPath } from '@/lib/activity/preview-path'
import { fetchArticleDetails, type ArticleDetails } from '@/lib/theater/article-body'
import {
  inlinePlainText,
  parseArticleMarkdown,
  type ArticleMdBlock,
  type InlineNode,
} from '@/lib/theater/article-markdown'
import { STAGE_TEXT_SCROLL_PAD, StageAuthorRow, StageCTA } from './stage-primitives'
import type { TheaterItem } from './types'

export interface StageArticleProps {
  item: TheaterItem
}

function renderInline(
  nodes: InlineNode[],
  keyPrefix: string,
  bionic: boolean,
  styled = false,
): ReactNode[] {
  return nodes.map((node, i) => {
    const key = `${keyPrefix}-${i}`
    switch (node.type) {
      case 'text':
        // Always wrap — a bare text sibling of <strong>/<a> breaks page
        // translation (docs/specs/translation-safety.md). Skip bionic on
        // already-styled runs so we don't nest <strong> inside <strong>.
        return <span key={key}>{bionic && !styled ? toBionicText(node.text) : node.text}</span>
      case 'bold':
        return <strong key={key}>{renderInline(node.children, key, bionic, true)}</strong>
      case 'italic':
        return <em key={key}>{renderInline(node.children, key, bionic, true)}</em>
      case 'boldItalic':
        return (
          <strong key={key}>
            <em>{renderInline(node.children, key, bionic, true)}</em>
          </strong>
        )
      case 'link':
        return (
          <a
            key={key}
            href={node.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-clay underline decoration-clay/40 underline-offset-2 hover:decoration-clay"
          >
            {renderInline(node.children, key, bionic, true)}
          </a>
        )
      default:
        return null
    }
  })
}

function renderBlocks(blocks: ArticleMdBlock[], bionic: boolean): ReactNode[] {
  return blocks.map((block, i) => {
    const key = `b-${i}`
    switch (block.type) {
      case 'heading': {
        const Tag = block.level === 1 ? 'h2' : block.level === 2 ? 'h3' : 'h4'
        const sizeClass =
          block.level === 1
            ? 'text-2xl sm:text-3xl'
            : block.level === 2
              ? 'text-xl sm:text-2xl'
              : 'text-lg sm:text-xl'
        return (
          <Tag
            key={key}
            className={cn('mb-3 mt-8 font-serif font-semibold text-white', sizeClass)}
            aria-label={bionic ? inlinePlainText(block.inline) : undefined}
          >
            {renderInline(block.inline, key, bionic)}
          </Tag>
        )
      }
      case 'divider':
        return <hr key={key} className="my-8 border-white/15" />
      case 'image':
        return (
          <img
            key={key}
            src={block.src}
            alt={block.alt}
            referrerPolicy="no-referrer"
            className="my-6 w-full rounded-xl object-cover"
          />
        )
      case 'quote':
        return (
          <blockquote
            key={key}
            className="my-6 border-l-2 border-clay/60 pl-4 italic text-white/75"
            aria-label={bionic ? inlinePlainText(block.inline) : undefined}
          >
            {renderInline(block.inline, key, bionic)}
          </blockquote>
        )
      case 'list-item':
        return (
          <p
            key={key}
            className="my-2 pl-5 text-white/85"
            aria-label={bionic ? inlinePlainText(block.inline) : undefined}
          >
            <span className="mr-2 text-white/40" aria-hidden>
              {block.ordered ? '•' : '—'}
            </span>
            {renderInline(block.inline, key, bionic)}
          </p>
        )
      case 'paragraph':
      default:
        return (
          <p
            key={key}
            className="my-4 leading-relaxed text-white/85"
            aria-label={bionic ? inlinePlainText(block.inline) : undefined}
          >
            {renderInline(block.inline, key, bionic)}
          </p>
        )
    }
  })
}

export function StageArticle({ item }: StageArticleProps) {
  const { preferences } = usePreferences()
  const bionic = preferences.bionicReading
  const [blocks, setBlocks] = useState<ArticleMdBlock[] | null>(null)
  const [details, setDetails] = useState<ArticleDetails | null>(null)
  const [failed, setFailed] = useState(false)
  const [progress, setProgress] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    setBlocks(null)
    setDetails(null)
    setFailed(false)
    setProgress(0)
    if (scrollRef.current) scrollRef.current.scrollTop = 0

    // Article content only exists for X Articles — nothing to fetch otherwise.
    if (item.platform !== 'twitter' || !item.author || !item.bookmarkId) {
      setFailed(true)
      return
    }

    fetchArticleDetails(item.author, item.bookmarkId)
      .then((article) => {
        if (cancelled) return
        if (!article) {
          setFailed(true)
          return
        }
        setDetails(article)
        if (!article.content) {
          setFailed(true)
          return
        }
        setBlocks(parseArticleMarkdown(article.content))
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
    }
  }, [item.platform, item.author, item.bookmarkId])

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const max = el.scrollHeight - el.clientHeight
    setProgress(max > 0 ? el.scrollTop / max : 0)
  }

  const headline = (details?.title || item.text || 'Saved article').trim()
  const coverImageUrl = item.thumbnailUrl || details?.coverImageUrl || null
  const href = previewPath(item.platform, item.author, item.bookmarkId || '')
  const hasReader = !!blocks && blocks.length > 0

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#08070a]">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={cn('h-full w-full overflow-y-auto', STAGE_TEXT_SCROLL_PAD)}
        data-theater-scroll
      >
        {/* Splash: cover + headline. Paint from `item` immediately, then use
            the shared article fetch as a fallback for sparse feed seeds. */}
        <div className="relative flex min-h-[46vh] w-full flex-col justify-end overflow-hidden sm:min-h-[52vh]">
          {coverImageUrl ? (
            <img
              src={coverImageUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="absolute inset-0 h-full w-full object-cover opacity-45"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-clay/25 via-transparent to-transparent" />
          )}
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(180deg, rgba(8,7,10,.15) 20%, rgba(8,7,10,.95))',
            }}
            aria-hidden
          />
          <div className="relative px-6 pb-8 pt-16 sm:px-10 sm:pb-10">
            <StageAuthorRow item={item} />
            <h1
              className="font-serif text-3xl leading-tight text-white sm:text-4xl"
              aria-label={bionic ? headline : undefined}
            >
              {bionic ? toBionicText(headline) : headline}
            </h1>
          </div>
        </div>

        {hasReader && (
          <div className="mx-auto max-w-prose px-6 pt-2 sm:px-10">
            {renderBlocks(blocks!, bionic)}
          </div>
        )}

        {/* Fetch failure or no article content — stay on the splash, never a
            dead stage. */}
        {failed && !hasReader && (
          <div className="flex flex-col items-center gap-4 px-6 pt-6 text-center">
            <p className="text-sm text-white/50">Couldn&apos;t load the full article here.</p>
            <StageCTA href={href} />
          </div>
        )}
      </div>

      {hasReader && (
        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/15">
          <div
            className="h-full bg-clay transition-[width] duration-150 ease-linear"
            style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
          />
        </div>
      )}
    </div>
  )
}
