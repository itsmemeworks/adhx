'use client'

import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import type { AdminPostLookup } from '@/lib/admin/boards/posts'
import { useAdminAction } from './actions'
import { BTN_SM, FIELD, FIELD_INPUT, FaceStack, Thumb, plural } from './parts'

function summary(p: AdminPostLookup): string {
  const parts = [plural(p.sharedSaves + p.privateSaves, 'save')]
  if (p.privateSaves) parts.push(`${p.privateSaves} Just for me`)
  if (p.notes) parts.push(plural(p.notes, 'note'))
  parts.push(p.hidden ? 'hidden' : p.kept ? 'kept' : p.keepState ? 'on its way' : 'not kept')
  return parts.join(' · ')
}

/**
 * Paste a link → who saved it (shared saves), counts, its state, and Hide or
 * Show. A post saved only Just for me shows counts and nothing else.
 */
export function PostLookup({
  placeholder = 'Paste a link to inspect or hide',
  initial = '',
  hint,
}: {
  placeholder?: string
  initial?: string
  hint?: string
}) {
  const [value, setValue] = useState(initial)
  const [post, setPost] = useState<AdminPostLookup | null>(null)
  const [loading, setLoading] = useState(false)
  const [notFound, setNotFound] = useState<string | null>(null)
  const { run, busy, error } = useAdminAction()

  async function look(q: string) {
    if (!q.trim()) return
    setLoading(true)
    setNotFound(null)
    try {
      const res = await fetch(`/api/admin/posts?url=${encodeURIComponent(q.trim())}`, {
        cache: 'no-store',
      })
      if (!res.ok) {
        setPost(null)
        setNotFound('That doesn’t look like a post link ADHX knows.')
        return
      }
      setPost((await res.json()) as AdminPostLookup)
    } finally {
      setLoading(false)
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    await look(value)
  }

  async function toggleHidden() {
    if (!post) return
    const done = await run('hide', '/api/admin/posts', {
      body: { platform: post.platform, id: post.bookmarkId, hidden: !post.hidden },
    })
    if (done) await look(value)
  }

  const title = post?.card?.title ?? (post?.listable ? post?.text : null)
  return (
    <div className="flex flex-col gap-2.5">
      <form onSubmit={(e) => void submit(e)} className={FIELD}>
        <label className="contents">
          <span className="sr-only">Post link</span>
          <input
            type="url"
            inputMode="url"
            value={value}
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
            className={FIELD_INPUT}
          />
        </label>
        <button type="submit" className="sr-only">
          Look up
        </button>
      </form>
      {loading && <span className="text-xs text-[#a39b8b]">Looking…</span>}
      {notFound && <span className="text-xs text-[#ffb59a]">{notFound}</span>}
      {post && (
        <div className="flex items-center gap-3 rounded-2xl bg-[#262320] p-2.5">
          <Thumb
            src={post.listable ? (post.card?.thumbnail ?? post.thumbnailUrl) : null}
            size={52}
          />
          <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
            {post.listable ? (
              <Link
                href={post.previewPath}
                className="truncate text-sm font-extrabold text-[#f4f1ea] hover:underline"
              >
                {title?.split('\n')[0] || `A post on ${post.platform}`}
              </Link>
            ) : (
              <span className="text-sm font-extrabold">Only kept Just for me</span>
            )}
            <span className="flex min-w-0 items-center gap-2 text-xs text-[#c9bfab]">
              <FaceStack faces={post.savers.slice(0, 3)} size={20} />
              <span className="truncate">{summary(post)}</span>
            </span>
            {error && <span className="text-xs text-[#ff8a7a]">{error}</span>}
          </span>
          <button
            type="button"
            className={BTN_SM}
            disabled={!!busy}
            onClick={() => void toggleHidden()}
          >
            {post.hidden ? 'Show' : 'Hide'}
          </button>
        </div>
      )}
      {hint && !post && <span className="text-xs text-[#a39b8b]">{hint}</span>}
    </div>
  )
}
