/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PreviewShell } from '@/components/previews/PreviewShell'

// ThemeToggle renders nothing outside a ThemeProvider (isolated-render
// fallback) — mock the hook so the toggle actually renders here, matching
// how it behaves under the real app-wide provider.
vi.mock('@/lib/theme/context', () => ({
  useTheme: () => ({ theme: 'light', resolvedTheme: 'light', setTheme: vi.fn() }),
  useThemeOptional: () => ({ theme: 'light', resolvedTheme: 'light', setTheme: vi.fn() }),
}))

describe('PreviewShell', () => {
  it('links to the GitHub repo without displacing the theme toggle', () => {
    render(<PreviewShell hero={<div>hero</div>} sidebar={<div>sidebar</div>} />)

    const link = screen.getByRole('link', { name: 'View source on GitHub' })
    expect(link).toHaveAttribute('href', 'https://github.com/itsmemeworks/adhx')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')

    // Both live in the same fixed top-right cluster, ahead of the CTA content.
    const themeButton = screen.getByRole('button', { name: /switch to (light|dark) mode/i })
    expect(link.parentElement).toContainElement(themeButton)
  })
})
