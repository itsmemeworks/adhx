/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  IosShortcutHow,
  IosShortcutInstallButton,
  IosShortcutNudge,
  SHORTCUT_DISMISS_KEY,
} from '@/components/IosShortcutInstall'
import { X_ONLY_SHORTCUT_URL } from '@/lib/share/ios'

let mockIos = true
vi.mock('@/lib/platform', () => ({
  isIOSDevice: () => mockIos,
}))

beforeEach(() => {
  mockIos = true
  localStorage.clear()
})

describe('IosShortcutInstallButton', () => {
  it('opens the iCloud shortcut as a one-tap install', () => {
    render(<IosShortcutInstallButton />)
    const link = screen.getByRole('link', { name: /add to share sheet/i })
    expect(link).toHaveAttribute('href', X_ONLY_SHORTCUT_URL)
    expect(link).toHaveAttribute('target', '_blank')
  })
})

describe('IosShortcutHow', () => {
  it('keeps the 4-platform recipe behind a disclosure', () => {
    render(<IosShortcutHow />)
    expect(screen.getByText(/instagram, tiktok, youtube too/i)).toBeInTheDocument()
    expect(screen.getByText(/https:\/\/adhx.com\/share\?url=/)).toBeInTheDocument()
  })
})

describe('IosShortcutNudge', () => {
  it('shows the install on iOS until dismissed', () => {
    render(<IosShortcutNudge />)
    expect(screen.getByText('Next time, skip this page')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /add to share sheet/i })).toHaveAttribute(
      'href',
      X_ONLY_SHORTCUT_URL,
    )

    fireEvent.click(screen.getByLabelText('Dismiss'))
    expect(screen.queryByText('Next time, skip this page')).not.toBeInTheDocument()
    expect(localStorage.getItem(SHORTCUT_DISMISS_KEY)).toBe('1')
  })

  it('stays hidden on non-iOS', () => {
    mockIos = false
    const { container } = render(<IosShortcutNudge />)
    expect(container).toBeEmptyDOMElement()
  })

  it('stays hidden once dismissed', () => {
    localStorage.setItem(SHORTCUT_DISMISS_KEY, '1')
    const { container } = render(<IosShortcutNudge />)
    expect(container).toBeEmptyDOMElement()
  })
})
