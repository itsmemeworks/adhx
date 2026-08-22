/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest'
import { render, act } from '@testing-library/react'
import { TheaterProgressLine } from '@/components/theater/TheaterProgressLine'

describe('TheaterProgressLine', () => {
  it('video kind paints the fill from theater-video-progress', () => {
    const { container } = render(<TheaterProgressLine itemKey="youtube:1" kind="video" />)
    const fill = container.querySelector('[data-theater-progress-fill]') as HTMLElement
    expect(fill).toBeTruthy()
    expect(fill.style.width).toBe('0%')

    act(() => {
      window.dispatchEvent(new CustomEvent('theater-video-progress', { detail: { progress: 0.4 } }))
    })
    expect(fill.style.width).toBe('40%')
  })

  it('renders nothing for kind none', () => {
    const { container } = render(<TheaterProgressLine itemKey="youtube:1" kind="none" />)
    expect(container.querySelector('[data-theater-progress-fill]')).toBeNull()
  })
})
