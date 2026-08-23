/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { StageText } from '@/components/theater/StageText'
import type { TheaterItem } from '@/components/theater/types'

function photoItem(): TheaterItem {
  return {
    action: 'save',
    platform: 'twitter',
    bookmarkId: '9',
    author: 'pat',
    authorName: 'Pat',
    text: 'a photo',
    thumbnailUrl: 'https://example.com/p.jpg',
    url: '/pat/status/9',
    createdAt: '2026-08-23T00:00:00Z',
    contentType: 'photo',
  } as TheaterItem
}

describe('StageText photo tap', () => {
  it('dispatches theater-stage-tap so chrome can hide overlays', () => {
    const heard = vi.fn()
    window.addEventListener('theater-stage-tap', heard)
    const { container } = render(<StageText item={photoItem()} photo photoCaption={false} />)
    fireEvent.click(container.firstElementChild as Element)
    expect(heard).toHaveBeenCalledTimes(1)
    window.removeEventListener('theater-stage-tap', heard)
  })
})
