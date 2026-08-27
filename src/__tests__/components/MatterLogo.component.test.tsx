/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MatterLogo } from '@/components/matter'

describe('MatterLogo', () => {
  it('uses the supplied dark lockup and enforces the header minimum height', () => {
    const { container } = render(<MatterLogo size={16} surface="dark" />)

    const logo = screen.getByAltText('ADHX')
    expect(logo).toHaveAttribute('src', '/logo-dark.png')
    expect(logo).toHaveStyle({ height: '32px' })
    expect(container.querySelector('img[src="/gob-loader.svg"]')).toBeInTheDocument()
  })

  it('uses the supplied paper lockup on paper surfaces', () => {
    const { container } = render(<MatterLogo size={20} surface="paper" />)

    expect(screen.getByAltText('ADHX')).toHaveAttribute('src', '/logo-paper.png')
    expect(container.querySelector('img[src="/gob-loader-paper.svg"]')).toBeInTheDocument()
  })

  it('renders theme-selectable lockups for theme-aware surfaces', () => {
    render(<MatterLogo size={20} />)

    const logos = screen.getAllByAltText('ADHX')
    expect(logos.map((logo) => logo.getAttribute('src'))).toEqual([
      '/logo-paper.png',
      '/logo-dark.png',
    ])
  })
})
