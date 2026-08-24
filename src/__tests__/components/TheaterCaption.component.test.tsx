/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest'
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
})
