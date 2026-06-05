'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { X, ChevronLeft, ChevronRight, Check, EyeOff, Trash2, Share2, ExternalLink, Loader2 } from 'lucide-react'
import type { FeedItem, TagItem } from './types'
import { MediaCard } from './MediaCard'
import { TagInput, type TagInputHandle } from './TagInput'

interface CardViewerProps {
  item: FeedItem
  index: number
  total: number
  onClose: () => void
  onPrev: () => void
  onNext: () => void
  onMarkRead: () => void
  markingRead?: boolean
  onTagAdd: (tag: string) => Promise<void> | void
  onTagRemove: (tag: string) => Promise<void> | void
  /** Called after the bookmark is deleted server-side, to update the feed. */
  onRemoveItem: () => void
  availableTags: TagItem[]
}

const SWIPE_THRESHOLD = 80

/** Single-item gallery viewer — the unified card view (replaces the Lightbox). */
export function CardViewer({
  item,
  index,
  total,
  onClose,
  onPrev,
  onNext,
  onMarkRead,
  markingRead,
  onTagAdd,
  onTagRemove,
  onRemoveItem,
  availableTags,
}: CardViewerProps) {
  const [deleting, setDeleting] = useState(false)
  const [shared, setShared] = useState(false)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const tagRef = useRef<TagInputHandle>(null)

  const shareUrl = useCallback(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    if (item.platform === 'instagram') return `${origin}/reels/${item.id}`
    if (item.platform === 'tiktok') return `${origin}/@${item.author}/video/${item.id}`
    return `${origin}/${item.author}/status/${item.id}`
  }, [item.platform, item.author, item.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === 'Escape') (e.target as HTMLElement).blur()
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      switch (e.key) {
        case 'Escape':
          onClose(); break
        case 'ArrowLeft':
          onPrev(); break
        case 'ArrowRight':
          onNext(); break
        case 'r':
        case 'R':
          onMarkRead(); break
        case 't':
        case 'T':
          e.preventDefault(); tagRef.current?.focus(); break
        case 'x':
        case 'X':
          window.open(item.tweetUrl, '_blank', 'noopener'); break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onPrev, onNext, onMarkRead, item.tweetUrl])

  const handleDelete = async () => {
    if (deleting) return
    setDeleting(true)
    try {
      await fetch(`/api/bookmarks/${item.id}`, { method: 'DELETE' })
    } catch {
      /* ignore — feed will reconcile on next load */
    }
    onRemoveItem()
  }

  const handleShare = async () => {
    const url = shareUrl()
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ url })
      } else {
        await navigator.clipboard.writeText(url)
      }
      setShared(true)
      setTimeout(() => setShared(false), 1500)
    } catch {
      /* user cancelled */
    }
  }

  const onTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return
    const dx = e.changedTouches[0].clientX - touchStart.current.x
    const dy = e.changedTouches[0].clientY - touchStart.current.y
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > SWIPE_THRESHOLD) {
      dx > 0 ? onPrev() : onNext()
    }
    touchStart.current = null
  }

  return (
    <div className="fixed inset-0 z-50 bg-gray-950/85 backdrop-blur-sm flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 text-white flex-shrink-0">
        <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-full" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
        <span className="text-sm text-white/70">{index + 1} / {total}</span>
      </div>

      {/* Body: prev | card | next */}
      <div
        className="flex-1 flex items-center justify-center gap-2 px-2 lg:px-4 pb-2 overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <button
          onClick={onPrev}
          className="hidden lg:flex items-center justify-center w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex-shrink-0"
          aria-label="Previous"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>

        <div className="flex-1 min-w-0 max-w-5xl flex items-center justify-center">
          <MediaCard item={item} videoMode="full" />
        </div>

        <button
          onClick={onNext}
          className="hidden lg:flex items-center justify-center w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex-shrink-0"
          aria-label="Next"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>

      {/* Tag editor + actions */}
      <div className="px-4 pb-5 pt-1 flex flex-col items-center gap-3 flex-shrink-0">
        <div className="w-full max-w-md">
          <TagInput
            ref={tagRef}
            tags={item.tags}
            availableTags={availableTags}
            onAddTag={async (t) => {
              await onTagAdd(t)
            }}
            onRemoveTag={async (t) => {
              await onTagRemove(t)
            }}
          />
        </div>

        <div className="flex items-center gap-5 text-white">
          <ActionBtn onClick={onMarkRead} disabled={markingRead} label={item.isRead ? 'Unread' : 'Read'}>
            {item.isRead ? <EyeOff className="w-5 h-5" /> : <Check className="w-5 h-5" />}
          </ActionBtn>
          <ActionBtn onClick={handleShare} label={shared ? 'Copied' : 'Share'}>
            {shared ? <Check className="w-5 h-5 text-green-400" /> : <Share2 className="w-5 h-5" />}
          </ActionBtn>
          <a
            href={item.tweetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center gap-1 text-xs text-white/70 hover:text-white"
          >
            <span className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center">
              <ExternalLink className="w-5 h-5" />
            </span>
            Open
          </a>
          <ActionBtn onClick={handleDelete} disabled={deleting} label="Delete" danger>
            {deleting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
          </ActionBtn>
        </div>
      </div>
    </div>
  )
}

function ActionBtn({
  onClick,
  label,
  disabled,
  danger,
  children,
}: {
  onClick: () => void
  label: string
  disabled?: boolean
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex flex-col items-center gap-1 text-xs text-white/70 hover:text-white disabled:opacity-50"
    >
      <span
        className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
          danger ? 'bg-white/10 hover:bg-red-500/80' : 'bg-white/10 hover:bg-white/20'
        }`}
      >
        {children}
      </span>
      {label}
    </button>
  )
}
