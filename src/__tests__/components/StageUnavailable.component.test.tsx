/**
 * @vitest-environment jsdom
 *
 * TASK 3 (owner screenshot report): a shared-mode preview page whose source
 * tweet couldn't be resolved (FxTwitter 401/404 — deleted/private/suspended)
 * renders this graceful lead instead of the legacy off-brand
 * `QuickAddLanding` "Connect with X to save" dead end. Deliberately no
 * retry, no save CTA, no X-connect CTA — there is nothing behind the item to
 * act on.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StageUnavailable } from '@/components/theater/StageUnavailable'
import type { TheaterItem } from '@/components/theater/types'

function makeItem(overrides: Partial<TheaterItem> = {}): TheaterItem {
  return {
    action: 'preview',
    platform: 'twitter',
    bookmarkId: '2090044905120751760',
    author: 'HazBrown1',
    url: '/HazBrown1/status/2090044905120751760',
    createdAt: '2026-08-21T00:00:00Z',
    contentType: 'text',
    ...overrides,
  } as TheaterItem
}

describe('StageUnavailable', () => {
  it('shows the "no longer available" headline and the author handle', () => {
    render(<StageUnavailable item={makeItem()} />)
    expect(screen.getByText('This post is no longer available on X')).toBeInTheDocument()
    expect(screen.getByText('@HazBrown1')).toBeInTheDocument()
  })

  it('renders no retry, save, or X-connect affordance — nothing behind this item to act on', () => {
    render(<StageUnavailable item={makeItem()} />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByText(/connect/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/save/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/try again/i)).not.toBeInTheDocument()
  })

  it('omits the author line when the item has no author', () => {
    render(<StageUnavailable item={makeItem({ author: '' })} />)
    expect(screen.queryByText(/^@/)).not.toBeInTheDocument()
  })
})
