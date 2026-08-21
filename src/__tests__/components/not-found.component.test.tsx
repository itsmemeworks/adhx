/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import NotFound from '@/app/not-found'

describe('NotFound (404 page)', () => {
  it('links back to the collection and to trending', () => {
    render(<NotFound />)
    expect(screen.getByRole('link', { name: /back to your collection/i })).toHaveAttribute(
      'href',
      '/',
    )
    expect(screen.getByRole('link', { name: /see what.s trending/i })).toHaveAttribute(
      'href',
      '/trending',
    )
  })

  it('never links to /search — that route does not exist', () => {
    render(<NotFound />)
    const links = screen.getAllByRole('link')
    expect(links.some((link) => link.getAttribute('href') === '/search')).toBe(false)
  })
})
