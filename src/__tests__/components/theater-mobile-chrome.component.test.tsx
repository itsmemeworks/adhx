/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TheaterMobileChrome } from '@/components/theater/TheaterMobileChrome'
import type { TheaterItem, TheaterTriageChrome } from '@/components/theater/types'

/**
 * Save-is-always-primary / Download-is-secondary on the mobile bottom scrim —
 * the mobile counterpart of the desktop chrome's button-hierarchy tests. Save
 * drives account signups, so it must always carry the clay-grad primary
 * treatment; Download is a power-user affordance and stays on the glass
 * secondary style, matching Share/Open. See TASK 1 of the
 * save-primary-image-download PR.
 */

const mockUseSendFile = vi.fn((..._args: unknown[]) => ({
  supported: false,
  ready: false,
  sending: false,
  mode: 'download' as const,
  send: vi.fn(),
}))

vi.mock('@/components/theater/useSendFile', () => ({
  useSendFile: (...args: unknown[]) => mockUseSendFile(...args),
}))

function videoItem(overrides: Partial<TheaterItem> = {}): TheaterItem {
  return {
    action: 'save',
    platform: 'twitter',
    bookmarkId: '1',
    author: 'alice',
    authorName: 'Alice',
    text: 'a caption for the video',
    thumbnailUrl: 'https://example.com/thumb.jpg',
    authorAvatarUrl: null,
    url: '/alice/status/1',
    createdAt: '2026-08-18T00:00:00Z',
    saveCount: 1,
    trendCount: 1,
    contentType: 'video',
    ...overrides,
  } as TheaterItem
}

function textItem(overrides: Partial<TheaterItem> = {}): TheaterItem {
  return {
    action: 'save',
    platform: 'twitter',
    bookmarkId: '2',
    author: 'bob',
    authorName: 'Bob',
    text: 'a text-only post with no media',
    thumbnailUrl: null,
    authorAvatarUrl: null,
    url: '/bob/status/2',
    createdAt: '2026-08-18T00:00:00Z',
    saveCount: 1,
    trendCount: 1,
    ...overrides,
  } as TheaterItem
}

const base = {
  mode: 'home' as const,
  items: [] as TheaterItem[],
  currentKey: null as string | null,
  isSeen: () => false,
  seenReady: true,
  freshKeys: new Set<string>(),
  newCount: 0,
  onSelect: vi.fn(),
  onPrev: vi.fn(),
  onNext: vi.fn(),
  canPrev: true,
  canNext: true,
  muted: true,
  onToggleMute: vi.fn(),
}

beforeEach(() => {
  mockUseSendFile.mockReturnValue({
    supported: false,
    ready: false,
    sending: false,
    mode: 'download' as const,
    send: vi.fn(),
  })
})

describe('TheaterMobileChrome: Save/Download button hierarchy', () => {
  it('sign-in prompt Save is primary (bg-clay-grad)', () => {
    render(<TheaterMobileChrome {...base} current={videoItem()} />)
    const saveBtn = screen.getByText('Save').closest('button')!
    expect(saveBtn.className).toContain('bg-clay-grad')
  })

  it('Download is secondary (glass), never bg-clay-grad', () => {
    mockUseSendFile.mockReturnValue({
      supported: true,
      ready: true,
      sending: false,
      mode: 'download' as const,
      send: vi.fn(),
    })
    render(<TheaterMobileChrome {...base} current={videoItem()} />)
    const downloadBtn = screen.getByText('Download').closest('button')!
    expect(downloadBtn.className).not.toContain('bg-clay-grad')
    expect(downloadBtn.className).toContain('border-white/25')

    const saveBtn = screen.getByText('Save').closest('button')!
    expect(saveBtn.className).toContain('bg-clay-grad')
  })

  it('triage live-tab Save is primary, Download (when present) stays secondary', () => {
    mockUseSendFile.mockReturnValue({
      supported: true,
      ready: true,
      sending: false,
      mode: 'download' as const,
      send: vi.fn(),
    })
    const triage: TheaterTriageChrome = {
      tab: 'live',
      onTabChange: vi.fn(),
      onDone: vi.fn(),
      onLater: vi.fn(),
      onDelete: vi.fn(),
      onTag: vi.fn(),
      onSave: vi.fn(),
      onLiveTag: vi.fn(),
      savedKeys: new Set<string>(),
      remaining: 0,
      streak: { current: 0, longest: 0 },
      onClose: vi.fn(),
    }
    render(<TheaterMobileChrome {...base} current={videoItem()} triage={triage} />)

    const saveBtn = screen.getByText('Save').closest('button')!
    expect(saveBtn.className).toContain('bg-clay-grad')

    const downloadBtn = screen.getByText('Download').closest('button')!
    expect(downloadBtn.className).not.toContain('bg-clay-grad')
  })

  it('renders Live before My Collection, not the bare "Collection" label', () => {
    const triage: TheaterTriageChrome = {
      tab: 'live',
      onTabChange: vi.fn(),
      onDone: vi.fn(),
      onLater: vi.fn(),
      onDelete: vi.fn(),
      onTag: vi.fn(),
      onSave: vi.fn(),
      onLiveTag: vi.fn(),
      savedKeys: new Set<string>(),
      remaining: 0,
      streak: { current: 0, longest: 0 },
      onClose: vi.fn(),
    }
    render(<TheaterMobileChrome {...base} current={videoItem()} triage={triage} />)

    expect(screen.queryByText('Collection')).not.toBeInTheDocument()
    const liveTab = screen.getByText('Live', { selector: 'button' })
    const collectionTab = screen.getByText('My Collection')
    expect(
      liveTab.compareDocumentPosition(collectionTab) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
})

describe('TheaterMobileChrome: text posts', () => {
  it('text posts never show Download (nothing sendable)', () => {
    render(<TheaterMobileChrome {...base} current={textItem()} />)
    expect(screen.queryByText('Download')).not.toBeInTheDocument()
  })
})

// De-cluttering EXPANDS the stage (owner review: the previous icon was
// backwards) — entering it reads outward (Maximize2); exiting reads inward
// (Minimize2).
describe('TheaterMobileChrome: de-clutter icon', () => {
  it('shows the outward (Maximize2) icon before de-cluttering, then swaps to Minimize2', () => {
    render(<TheaterMobileChrome {...base} current={videoItem()} />)
    const toggle = screen.getByLabelText('Hide controls')
    expect(toggle.querySelector('.lucide-maximize-2')).toBeInTheDocument()
    expect(toggle.querySelector('.lucide-minimize-2')).not.toBeInTheDocument()

    fireEvent.click(toggle)
    const restored = screen.getByLabelText('Show controls')
    expect(restored.querySelector('.lucide-minimize-2')).toBeInTheDocument()
    expect(restored.querySelector('.lucide-maximize-2')).not.toBeInTheDocument()
  })
})

describe('TheaterMobileChrome: collection mode "Make your own"', () => {
  it('non-owner: the brand link opens the sign-in modal in place instead of navigating', () => {
    const onRequestMakeYourOwn = vi.fn()
    render(
      <TheaterMobileChrome
        {...base}
        current={videoItem()}
        collection={{ tag: 'claude-code', curator: 'weedauwl', count: 12 }}
        isCollectionOwner={false}
        onRequestMakeYourOwn={onRequestMakeYourOwn}
      />,
    )
    const trigger = screen.getByLabelText('Make your own collection')
    expect(trigger.tagName).toBe('BUTTON')
    fireEvent.click(trigger)
    expect(onRequestMakeYourOwn).toHaveBeenCalledTimes(1)
  })

  it('owner: the brand link is a plain home link, not the make-your-own trigger', () => {
    render(
      <TheaterMobileChrome
        {...base}
        current={videoItem()}
        collection={{ tag: 'claude-code', curator: 'weedauwl', count: 12 }}
        isCollectionOwner
      />,
    )
    expect(screen.queryByLabelText('Make your own collection')).not.toBeInTheDocument()
    expect(screen.getByLabelText('ADHX home')).toHaveAttribute('href', '/')
  })
})
