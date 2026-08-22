/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UpNextList } from '@/components/theater/UpNextList'
import type { TheaterItem } from '@/components/theater/types'

function item(overrides: Partial<TheaterItem> = {}): TheaterItem {
  return {
    action: 'save',
    platform: 'twitter',
    bookmarkId: '1',
    author: 'alice',
    authorName: 'Alice',
    text: 'a caption for the post',
    thumbnailUrl: null,
    authorAvatarUrl: null,
    url: '/alice/status/1',
    createdAt: '2026-08-18T00:00:00Z',
    saveCount: 1,
    trendCount: 1,
    contentType: 'text',
    ...overrides,
  } as TheaterItem
}

const base = {
  currentKey: null as string | null,
  isSeen: () => false,
  seenReady: true,
  freshKeys: new Set<string>(),
  newCount: 0,
  onSelect: vi.fn(),
}

/**
 * Owner report: the collection theater rendered "56y" for a saved TikTok
 * whose `createdAt` fell back to an epoch sentinel. The row renders
 * `addedAt` (when the post was first saved to ADHX — never the source
 * platform's own publish date) gated by `hasKnownTimestamp` — a
 * missing/unknown `addedAt` hides the relative-time span but the platform
 * glyph must still render either way.
 */
describe('UpNextList row: hides the time text for an unknown addedAt', () => {
  it('omits the relative-time span but keeps the platform glyph when addedAt is null', () => {
    render(<UpNextList {...base} items={[item({ addedAt: null })]} />)
    const row = screen.getByText('a caption for the post').closest('button')!
    expect(row.querySelector('svg')).toBeInTheDocument()
    expect(row.querySelector('span.font-mono')).not.toBeInTheDocument()
  })

  it('omits the relative-time span when addedAt is the epoch sentinel', () => {
    render(<UpNextList {...base} items={[item({ addedAt: new Date(0).toISOString() })]} />)
    const row = screen.getByText('a caption for the post').closest('button')!
    expect(row.querySelector('span.font-mono')).not.toBeInTheDocument()
  })

  it('shows the relative-time span for a real addedAt', () => {
    render(<UpNextList {...base} items={[item({ addedAt: '2026-08-18T00:00:00Z' })]} />)
    const row = screen.getByText('a caption for the post').closest('button')!
    expect(row.querySelector('span.font-mono')).toBeInTheDocument()
  })
})
