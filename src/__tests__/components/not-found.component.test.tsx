/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import NotFound from '@/app/not-found'

describe('NotFound (404 page)', () => {
  it('points to Right now and Search, in the new design', () => {
    render(<NotFound />)
    expect(screen.getByRole('heading', { name: 'Nothing here' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Right now' })).toHaveAttribute('href', '/now')
    expect(screen.getByRole('link', { name: 'Search' })).toHaveAttribute('href', '/search')
    expect(screen.getByRole('link', { name: 'adhx home' })).toHaveAttribute('href', '/')
  })

  it('never sends you to the old design’s pages', () => {
    render(<NotFound />)
    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'))
    for (const old of ['/saved', '/trending', '/library']) expect(hrefs).not.toContain(old)
  })
})
