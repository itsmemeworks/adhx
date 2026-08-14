/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { PreviewShell, MobileSendDock } from '@/components/previews/PreviewShell'

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

describe('MobileSendDock', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('portals to document.body on small viewports so fadeInUp transform cannot trap position:fixed', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: query === '(max-width: 767px)',
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
        onchange: null,
      })),
    )

    const { container } = render(
      <div data-column="preview">
        <MobileSendDock>
          <button type="button">Send this video</button>
        </MobileSendDock>
      </div>,
    )

    expect(container.querySelector('[data-column="preview"]')).not.toHaveTextContent(
      'Send this video',
    )
    expect(document.body.querySelector('.fixed')?.textContent).toContain('Send this video')
  })
})
