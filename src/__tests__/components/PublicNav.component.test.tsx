/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PublicNav } from '@/components/PublicNav'

describe('PublicNav', () => {
  it('links to the GitHub repo with a safe, discoverable anchor', () => {
    render(<PublicNav onConnect={vi.fn()} />)

    const link = screen.getByRole('link', { name: 'View source on GitHub' })
    expect(link).toHaveAttribute('href', 'https://github.com/itsmemeworks/adhx')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('renders the GitHub link regardless of which nav item is active', () => {
    render(<PublicNav active="trending" onConnect={vi.fn()} />)

    expect(screen.getByRole('link', { name: 'View source on GitHub' })).toBeInTheDocument()
  })
})
