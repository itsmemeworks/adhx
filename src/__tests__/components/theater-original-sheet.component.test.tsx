// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { FeedItem } from '@/components/feed/types'

const article = vi.hoisted(() => ({ markdown: null as string | null }))
vi.mock('@/lib/theater/article-body', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/theater/article-body')>()),
  fetchArticleMarkdown: vi.fn(async () => article.markdown),
}))

import {
  OriginalSheet,
  originalHandle,
  originalLine,
  originalWho,
  postedDay,
} from '@/components/next/theater/OriginalSheet'

/**
 * The rail's network button opens the original post (as on the phones): who
 * posted it, everything they wrote, Open on {network} and Copy link. The
 * network's mark shows once: in the line when their picture leads, else as
 * the picture.
 */

function post(partial: Partial<FeedItem> & { platform?: string } = {}): FeedItem {
  return {
    id: '1',
    platform: 'twitter',
    author: 'rick',
    authorName: 'Rick Astley',
    authorProfileImageUrl: null,
    text: 'Never gonna give you up',
    tweetUrl: 'https://x.com/rick/status/1',
    processedAt: '2026-10-19T09:00:00.000Z',
    createdAt: '2026-10-18T12:00:00.000Z',
    isArchived: false,
    media: null,
    links: null,
    tags: [],
    ...partial,
  } as FeedItem
}

/** The network marks drawn in the sheet's header (lucide icons are the Close button). */
function headerMarks(dialog: HTMLElement): number {
  return dialog.querySelector('header')!.querySelectorAll('svg:not(.lucide)').length
}

afterEach(() => {
  article.markdown = null
})

describe('who posted it', () => {
  it('uses their name, else their handle, else the network', () => {
    expect(originalWho(post())).toBe('Rick Astley')
    expect(originalWho(post({ authorName: null }))).toBe('rick')
    // A one-letter name or the network's own name counts as none.
    expect(originalWho(post({ authorName: 'R' }))).toBe('rick')
    expect(originalWho(post({ authorName: 'X' }))).toBe('rick')
    expect(
      originalWho(post({ platform: 'youtube' as never, authorName: 'YouTube', author: 'youtube' })),
    ).toBeNull()
    expect(originalWho(post({ authorName: '', author: 'r' }))).toBeNull()
  })

  it('says the handle once, and the day it was posted', () => {
    expect(originalHandle(post())).toBe('@rick')
    // The handle is already the name shown: not again.
    expect(originalHandle(post({ authorName: null }))).toBeNull()
    expect(originalHandle(post({ author: 'Rick Astley Official', authorName: null }))).toBeNull()
    expect(postedDay('2026-10-18T12:00:00.000Z')).toBe('18 Oct 2026')
    expect(postedDay('soon')).toBeNull()
    expect(originalLine(post())).toBe('@rick · Posted 18 Oct 2026')
    // No date: the network's name instead.
    expect(originalLine(post({ createdAt: null }))).toBe('@rick · X')
  })
})

describe('the original post sheet', () => {
  it('leads with their picture and shows the mark once, in the line', () => {
    render(
      <OriginalSheet
        post={post({ authorProfileImageUrl: 'https://pbs.twimg.com/profile_images/1/a.jpg' })}
        kind="video"
        url="https://x.com/rick/status/1"
        onCopy={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    const dialog = screen.getByRole('dialog', { name: 'The original post on X' })
    expect(dialog.querySelector('header img')).toHaveAttribute(
      'src',
      'https://pbs.twimg.com/profile_images/1/a.jpg',
    )
    expect(headerMarks(dialog)).toBe(1)
    expect(within(dialog).getByText('Rick Astley')).toBeInTheDocument()
    expect(within(dialog).getByText('@rick · Posted 18 Oct 2026')).toBeInTheDocument()
  })

  it('without a picture, the mark is the picture and not in the line', () => {
    render(
      <OriginalSheet
        post={post({ platform: 'soundcloud' as never, author: 'forss', authorName: null })}
        kind="video"
        url="https://soundcloud.com/forss/flickermood"
        onCopy={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    const dialog = screen.getByRole('dialog', { name: 'The original post on SoundCloud' })
    expect(dialog.querySelector('header img')).toBeNull()
    expect(headerMarks(dialog)).toBe(1)
    expect(within(dialog).getByText('forss')).toBeInTheDocument()
    expect(within(dialog).getByText('Posted 18 Oct 2026')).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: 'Open on SoundCloud' })).toHaveAttribute(
      'href',
      'https://soundcloud.com/forss/flickermood',
    )
  })

  it('a broken picture falls back to the mark, still only once', () => {
    render(
      <OriginalSheet
        post={post({ authorProfileImageUrl: 'https://pbs.twimg.com/profile_images/1/a.jpg' })}
        kind="video"
        url="https://x.com/rick/status/1"
        onCopy={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    const dialog = screen.getByRole('dialog')
    fireEvent.error(dialog.querySelector('header img')!)
    expect(dialog.querySelector('header img')).toBeNull()
    expect(headerMarks(dialog)).toBe(1)
  })

  it('says when there are no words, and copies the link', () => {
    const onCopy = vi.fn()
    render(
      <OriginalSheet
        post={post({ text: '' })}
        kind="photo"
        url="https://x.com/rick/status/1"
        onCopy={onCopy}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText('No words with this one, just the picture.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    expect(onCopy).toHaveBeenCalledWith('https://x.com/rick/status/1')
  })

  it('has no buttons without a way to the original', () => {
    render(
      <OriginalSheet post={post()} kind="post" url={null} onCopy={vi.fn()} onClose={vi.fn()} />,
    )
    expect(screen.queryByRole('link', { name: /Open on/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull()
  })

  it('shows a kept X article in full', async () => {
    article.markdown = '## Chapter one\n\nIt starts with a [link](https://example.com/a).'
    render(
      <OriginalSheet
        post={post({
          category: 'article',
          articlePreview: { title: 'The essay', url: 'https://x.com/rick/article/1' },
        } as Partial<FeedItem>)}
        kind="article"
        url="https://x.com/rick/status/1"
        onCopy={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(await screen.findByRole('heading', { name: 'Chapter one' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'link' })).toHaveAttribute(
      'href',
      'https://example.com/a',
    )
  })

  it('keeps focus inside and closes on Escape', async () => {
    const onClose = vi.fn()
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const { unmount } = render(
      <OriginalSheet
        post={post()}
        kind="video"
        url="https://x.com/rick/status/1"
        onCopy={vi.fn()}
        onClose={onClose}
      />,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    await waitFor(() => expect(document.activeElement).toBe(dialog))
    const copy = within(dialog).getByRole('button', { name: 'Copy link' })
    const close = within(dialog).getAllByRole('button', { name: 'Close' })[0]
    // From the last control, Tab goes back to the first; Shift+Tab the other way.
    copy.focus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(document.activeElement).toBe(close)
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(copy)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
    unmount()
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })
})
