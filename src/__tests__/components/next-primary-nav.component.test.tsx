// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'

const nav = vi.hoisted(() => ({ pathname: '/now' }))
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: vi.fn() }),
}))

import { BottomNav, PrimaryNav, navFor } from '@/components/next/PrimaryNav'

describe('primary navigation', () => {
  it('knows which place each address belongs to', () => {
    expect(navFor('/now')).toBe('now')
    expect(navFor('/moments/frogs-abc')).toBe('now')
    expect(navFor('/channels')).toBe('channels')
    expect(navFor('/t/alice/synth-gear')).toBe('channels')
    expect(navFor('/search')).toBe('search')
    expect(navFor('/settings')).toBeNull()
  })

  it('leads with Right now and lights the current place', () => {
    nav.pathname = '/channels'
    render(<PrimaryNav />)
    const links = within(screen.getByRole('navigation', { name: 'Main' })).getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual(['Right now', 'Channels', 'My saves'])
    expect(links[0]).toHaveAttribute('href', '/now')
    expect(screen.getByRole('link', { name: 'Channels' })).toHaveAttribute('aria-current', 'page')
  })

  it('puts all four places, Search included, along the bottom on phones', () => {
    render(<BottomNav current="saves" />)
    const links = within(screen.getByRole('navigation', { name: 'Main' })).getAllByRole('link')
    expect(links.map((l) => [l.textContent, l.getAttribute('href')])).toEqual([
      ['Right now', '/now'],
      ['Channels', '/channels'],
      ['My saves', '/play?recent=1'],
      ['Search', '/search'],
    ])
    expect(screen.getByRole('link', { name: 'My saves' })).toHaveAttribute('aria-current', 'page')
  })
})
