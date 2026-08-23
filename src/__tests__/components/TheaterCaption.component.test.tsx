/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createRef, type ComponentProps } from 'react'
import { TheaterCaption } from '@/components/theater/TheaterCaption'

function renderCaption(overrides: Partial<ComponentProps<typeof TheaterCaption>> = {}) {
  const onToggle = vi.fn()
  render(
    <TheaterCaption
      captionRef={createRef<HTMLParagraphElement>()}
      expanded={false}
      overflowing={false}
      onToggle={onToggle}
      platform="twitter"
      text="two lines of caption that might clamp"
      {...overrides}
    />,
  )
  return onToggle
}

describe('TheaterCaption', () => {
  it('renders the caption and no more/less control', () => {
    renderCaption()
    expect(screen.getByText('two lines of caption that might clamp')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'more' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'less' })).not.toBeInTheDocument()
  })

  it('does not toggle when the text is not overflowing', () => {
    const onToggle = renderCaption({ overflowing: false, expanded: false })
    fireEvent.click(screen.getByText('two lines of caption that might clamp'))
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('toggles when overflowing — tap the text, not a more link', () => {
    const onToggle = renderCaption({ overflowing: true })
    const caption = screen.getByText('two lines of caption that might clamp')
    expect(caption.closest('p')).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(caption)
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('toggles again when already expanded so a second tap collapses', () => {
    const onToggle = renderCaption({ overflowing: true, expanded: true })
    expect(screen.getByText('two lines of caption that might clamp').closest('p')).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    fireEvent.click(screen.getByText('two lines of caption that might clamp'))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('does not toggle when a link inside the caption is clicked', () => {
    const onToggle = renderCaption({
      overflowing: true,
      text: 'see https://example.com/post for more',
    })
    fireEvent.click(screen.getByRole('link'))
    expect(onToggle).not.toHaveBeenCalled()
  })
})
