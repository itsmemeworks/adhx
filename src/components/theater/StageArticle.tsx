'use client'

/**
 * Article stage: cover splash → in-stage reader (spec §3/§6). The splash
 * (cover + headline) renders immediately from data already on `item` — it
 * looks complete even if the body never loads. The full body comes from the
 * public tweet JSON API (`/api/share/tweet/{author}/{id}`, 5-min cache),
 * whose `article.content` field is already `articleBlocksToMarkdown` output
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
import { FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { previewPath } from '@/lib/activity/preview-path'
import { fetchArticleMarkdown } from '@/lib/theater/article-body'
import {
  parseArticleMarkdown,
  type ArticleMdBlock,
  type InlineNode,
} from '@/lib/theater/article-markdown'
import { StageCTA } from './stage-primitives'
import type { TheaterItem } from './types'

export interface StageArticleProps {
  item: TheaterItem
}

function renderInline(nodes: InlineNode[], keyPrefix: string): ReactNode[] {
  return nodes.map((node, i) => {
    const key = `${keyPrefix}-${i}`
    switch (node.type) {
      case 'text':
        return node.text
      case 'bold':
        return <strong key={key}>{renderInline(node.children, key)}</strong>
      case 'italic':
        return <em key={key}>{renderInline(node.children, key)}</em>
      case 'boldItalic':
        return (
          <strong key={key}>
            <em>{renderInline(node.children, key)}</em>
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
            {renderInline(node.children, key)}
          </a>
        )
      default:
        return null
    }
  })
}

function renderBlocks(blocks: ArticleMdBlock[]): ReactNode[] {
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
          <Tag key={key} className={cn('mb-3 mt-8 font-serif font-semibold text-white', sizeClass)}>
            {renderInline(block.inline, key)}
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
          >
            {renderInline(block.inline, key)}
          </blockquote>
        )
      case 'list-item':
        return (
          <p key={key} className="my-2 pl-5 text-white/85">
            <span className="mr-2 text-white/40" aria-hidden>
              {block.ordered ? '•' : '—'}
            </span>
            {renderInline(block.inline, key)}
          </p>
        )
      case 'paragraph':
      default:
        return (
          <p key={key} className="my-4 leading-relaxed text-white/85">
            {renderInline(block.inline, key)}
          </p>
        )
    }
  })
}

export function StageArticle({ item }: StageArticleProps) {
  const [blocks, setBlocks] = useState<ArticleMdBlock[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [progress, setProgress] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    setBlocks(null)
    setFailed(false)
    setProgress(0)
    if (scrollRef.current) scrollRef.current.scrollTop = 0

    // Article content only exists for X Articles — nothing to fetch otherwise.
    if (item.platform !== 'twitter' || !item.author || !item.bookmarkId) {
      setFailed(true)
      return
    }

    fetchArticleMarkdown(item.author, item.bookmarkId)
      .then((markdown) => {
        if (cancelled) return
        if (!markdown) {
          setFailed(true)
          return
        }
        setBlocks(parseArticleMarkdown(markdown))
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

  const headline = (item.text || 'Saved article').trim()
  const href = previewPath(item.platform, item.author, item.bookmarkId || '')
  const hasReader = !!blocks && blocks.length > 0

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#08070a]">
      <div ref={scrollRef} onScroll={handleScroll} className="h-full w-full overflow-y-auto">
        {/* Splash: cover + headline. Renders from `item` alone — looks
            complete even if the body fetch below never resolves. */}
        <div className="relative flex min-h-[46vh] w-full flex-col justify-end overflow-hidden sm:min-h-[52vh]">
          {item.thumbnailUrl ? (
            <img
              src={item.thumbnailUrl}
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
            <div className="mb-3 flex items-center gap-2 text-white/50">
              <FileText size={14} />
              <span className="text-xs font-semibold uppercase tracking-wide">Article</span>
            </div>
            <h1 className="font-serif text-3xl leading-tight text-white sm:text-4xl">{headline}</h1>
            {item.authorName && <p className="mt-3 text-sm text-white/60">{item.authorName}</p>}
          </div>
        </div>

        {hasReader && (
          <div className="mx-auto max-w-prose px-6 pb-16 pt-2 sm:px-10">
            {renderBlocks(blocks!)}
          </div>
        )}

        {/* Fetch failure or no article content — stay on the splash, never a
            dead stage. */}
        {failed && !hasReader && (
          <div className="flex flex-col items-center gap-4 px-6 pb-16 pt-6 text-center">
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
