// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

import { HeaderSearch, QuickSearch, openQuickSearch } from '@/components/next/QuickSearch'

describe('instant search', () => {
  beforeEach(() => {
    push.mockReset()
    window.localStorage.clear()
  })

  it('focuses the search sheet inside the tap, so the keyboard comes up', () => {
    render(<QuickSearch />)
    const field = document.getElementById('nx-quick-search') as HTMLInputElement
    act(() => openQuickSearch())
    expect(document.activeElement).toBe(field)
    expect(screen.getByRole('dialog', { name: 'Search' })).not.toHaveAttribute(
      'aria-hidden',
      'true',
    )
    fireEvent.change(field, { target: { value: 'frogs singing' } })
    fireEvent.submit(field.closest('form')!)
    expect(push).toHaveBeenCalledWith('/search?q=frogs+singing')
  })

  it('uses the Search page’s own field when you’re already there', () => {
    render(
      <>
        <input id="nx-search" aria-label="page search" />
        <QuickSearch />
      </>,
    )
    window.scrollTo = vi.fn() as never
    act(() => openQuickSearch())
    expect(document.activeElement).toBe(screen.getByLabelText('page search'))
  })

  it('searches from the header field on Enter', () => {
    render(<HeaderSearch />)
    const field = document.getElementById('nx-header-search') as HTMLInputElement
    fireEvent.change(field, { target: { value: 'synth' } })
    fireEvent.submit(field.closest('form')!)
    expect(push).toHaveBeenCalledWith('/search?q=synth')
  })

  it('still searches if someone presses Enter before the page script starts', () => {
    render(<HeaderSearch />)
    const field = document.getElementById('nx-header-search') as HTMLInputElement
    const form = field.closest('form')!
    // A plain GET form to /search with the text as ?q= is the no-script path.
    expect(form).toHaveAttribute('action', '/search')
    expect(form).toHaveAttribute('method', 'get')
    expect(field).toHaveAttribute('name', 'q')
  })
})
