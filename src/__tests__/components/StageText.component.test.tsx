/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StageText } from '@/components/theater/StageText'
import type { TheaterItem } from '@/components/theater/types'

function textItem(overrides: Partial<TheaterItem> = {}): TheaterItem {
  return {
    action: 'save',
    platform: 'twitter',
    bookmarkId: '20',
    author: 'jack',
    authorName: 'jack',
    authorAvatarUrl: 'https://example.com/jack.jpg',
    text: 'just setting up my twttr',
    thumbnailUrl: null,
    url: '/jack/status/20',
    createdAt: '2006-03-21T00:00:00Z',
    saveCount: 1,
    trendCount: 1,
    contentType: 'text',
    ...overrides,
  } as TheaterItem
}

describe('StageText author row', () => {
  it('links the avatar and username to the author profile', () => {
    render(<StageText item={textItem()} />)
    const profile = screen.getByTitle('View @jack on X')
    expect(profile).toHaveAttribute('href', 'https://x.com/jack')
    expect(profile).toHaveAttribute('target', '_blank')
    expect(profile).toHaveTextContent('jack')
    expect(profile).toHaveTextContent('@jack')
    expect(screen.getByRole('img', { name: 'jack' })).toBeInTheDocument()
  })

  it('renders a plain row when there is no handle', () => {
    render(<StageText item={textItem({ author: '', authorName: undefined })} />)
    expect(screen.queryByTitle(/^View @/)).not.toBeInTheDocument()
    expect(screen.getByText('Saved post')).toBeInTheDocument()
  })
})
