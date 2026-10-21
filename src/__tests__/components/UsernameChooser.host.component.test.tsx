// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UsernameChooser } from '@/components/auth/UsernameChooser'

describe('UsernameChooser', () => {
  it('shows the address this ADHX is open at, not one fixed at build time', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ available: true }))),
    )
    // jsdom serves the page from http://localhost:3000
    render(<UsernameChooser suggestedUsername="ana" theme="dark" onSuccess={() => {}} />)
    expect(await screen.findByText(`${window.location.host}/t/`)).toBeInTheDocument()
    expect(screen.queryByText('adhx.com/t/')).not.toBeInTheDocument()
    vi.unstubAllGlobals()
  })
})
