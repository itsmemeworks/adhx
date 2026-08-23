/**
 * @vitest-environment jsdom
 *
 * Shared Save pill: a just-now save (autosave event or tap) pops "Saved"
 * then hands off to Tag. Already-owned posts skip the celebration.
 * Live-tab Save collapses out once `savedKeys` has the post.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import {
  SavePostButton,
  PersonalLiveSaveButton,
  SAVE_TO_TAG_MS,
  resetSavePostOwnershipCache,
} from '@/components/theater/SavePostButton'
import { theaterItemKey } from '@/components/theater/types'
import type { TheaterItem, TheaterPersonalChrome } from '@/components/theater/types'

function item(id = '123'): TheaterItem {
  return {
    action: 'save',
    platform: 'twitter',
    bookmarkId: id,
    author: 'naval',
    url: `/naval/status/${id}`,
    createdAt: '2026-08-18T00:00:00Z',
    contentType: 'text',
    text: 'post',
    trendCount: 0,
  } as TheaterItem
}

const CLASS =
  'inline-flex h-11 items-center justify-center gap-1.5 rounded-full border border-clay bg-white/[0.14] px-5 text-white'

describe('SavePostButton — save to tag', () => {
  beforeEach(() => {
    resetSavePostOwnershipCache()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    global.fetch = vi.fn(async (url: string | URL | Request) => {
      const href = String(url)
      if (href.includes('/api/feed')) {
        return { ok: true, json: async () => ({ items: [] }) }
      }
      return { ok: true, json: async () => ({}) }
    }) as never
  })

  afterEach(() => {
    vi.useRealTimers()
    resetSavePostOwnershipCache()
  })

  it('autosave event shows Saved, then Tag', async () => {
    const onTag = vi.fn()
    const current = item()
    render(<SavePostButton current={current} className={CLASS} onTag={onTag} />)
    expect(screen.getByText('Save')).toBeInTheDocument()

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('theater-post-saved', { detail: { key: theaterItemKey(current) } }),
      )
    })
    expect(screen.getByText('Saved')).toBeInTheDocument()
    expect(screen.getByText('Saved to your collection')).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(SAVE_TO_TAG_MS)
    })
    expect(screen.getByText('Tag')).toBeInTheDocument()
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Tag this post' }))
    expect(onTag).toHaveBeenCalledTimes(1)
  })

  it('already-owned posts land on Tag without a Saved beat', async () => {
    const current = item('owned')
    global.fetch = vi.fn(async (url: string | URL | Request) => {
      const href = String(url)
      if (href.includes('/api/feed')) {
        return {
          ok: true,
          json: async () => ({ items: [{ id: 'owned', platform: 'twitter' }] }),
        }
      }
      return { ok: true, json: async () => ({}) }
    }) as never

    render(<SavePostButton current={current} className={CLASS} onTag={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Tag')).toBeInTheDocument())
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
    expect(screen.queryByText('Save')).not.toBeInTheDocument()
  })

  it('stays on Saved when there is no onTag (no handoff)', async () => {
    const current = item()
    render(<SavePostButton current={current} className={CLASS} />)
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('theater-post-saved', { detail: { key: theaterItemKey(current) } }),
      )
    })
    expect(screen.getByText('Saved')).toBeInTheDocument()
    await act(async () => {
      vi.advanceTimersByTime(SAVE_TO_TAG_MS + 50)
    })
    expect(screen.getByText('Saved')).toBeInTheDocument()
    expect(screen.queryByText('Tag')).not.toBeInTheDocument()
  })
})

describe('PersonalLiveSaveButton — save slot collapses', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function chrome(saved: boolean): TheaterPersonalChrome {
    return {
      tab: 'live',
      onTabChange: vi.fn(),
      onDone: vi.fn(),
      onTag: vi.fn(),
      onSave: vi.fn(),
      savedKeys: saved ? new Set([theaterItemKey(item())]) : new Set(),
      remaining: 0,
      onClose: vi.fn(),
    }
  }

  it('is visible while unsaved, then animates out once saved', async () => {
    const current = item()
    const { rerender } = render(
      <PersonalLiveSaveButton current={current} collection={chrome(false)} className={CLASS} />,
    )
    expect(screen.getByText('Save')).toBeInTheDocument()

    rerender(
      <PersonalLiveSaveButton current={current} collection={chrome(true)} className={CLASS} />,
    )
    const btn = screen.getByText('Save').closest('button')!
    expect(btn.className).toContain('animate-save-slot-out')

    await act(async () => {
      vi.advanceTimersByTime(280)
    })
    expect(screen.queryByText('Save')).not.toBeInTheDocument()
  })
})
