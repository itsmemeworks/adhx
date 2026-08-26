/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createRef } from 'react'
import { TheaterCaption } from '@/components/theater/TheaterCaption'

describe('TheaterCaption', () => {
  it('renders a clamped caption with no more/less control and no tap-to-expand', () => {
    render(
      <TheaterCaption
        captionRef={createRef<HTMLParagraphElement>()}
        platform="twitter"
        text="two lines of caption that might clamp"
      />,
    )
    const caption = screen.getByText('two lines of caption that might clamp')
    expect(caption.closest('p')).toHaveClass('line-clamp-2')
    expect(caption.closest('p')).not.toHaveAttribute('aria-expanded')
    expect(screen.queryByRole('button', { name: 'more' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'less' })).not.toBeInTheDocument()
    fireEvent.click(caption)
    expect(caption.closest('p')).toHaveClass('line-clamp-2')
  })

  it('keeps links clickable inside the clamped caption', () => {
    render(
      <TheaterCaption
        captionRef={createRef<HTMLParagraphElement>()}
        platform="twitter"
        text="see https://example.com/post for more"
      />,
    )
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://example.com/post')
  })

  it('opens Read when the truncated caption is clicked', () => {
    const onOpenRead = vi.fn()
    render(
      <TheaterCaption
        captionRef={createRef<HTMLParagraphElement>()}
        platform="twitter"
        text="two lines of caption that might clamp"
        onOpenRead={onOpenRead}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Read the full post' }))
    expect(onOpenRead).toHaveBeenCalledTimes(1)
  })

  it('does not open Read when a link inside the caption is clicked', () => {
    const onOpenRead = vi.fn()
    render(
      <TheaterCaption
        captionRef={createRef<HTMLParagraphElement>()}
        platform="twitter"
        text="see https://example.com/post for more"
        onOpenRead={onOpenRead}
      />,
    )
    fireEvent.click(screen.getByRole('link'))
    expect(onOpenRead).not.toHaveBeenCalled()
  })
})
