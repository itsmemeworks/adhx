/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { PWAInstallPrompt } from '@/components/PWAInstallPrompt'
import { SHORTCUT_DISMISS_KEY } from '@/components/IosShortcutInstall'
import { X_ONLY_SHORTCUT_URL } from '@/lib/share/ios'

let mockPlatform: 'ios' | 'android' | 'desktop' = 'desktop'
vi.mock('@/lib/platform', () => ({
  getPlatformType: () => mockPlatform,
}))

function setStandalone(value: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: value,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

function fireBeforeInstallPrompt() {
  const evt = new Event('beforeinstallprompt') as Event & {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: string }>
  }
  evt.prompt = vi.fn(() => Promise.resolve())
  evt.userChoice = Promise.resolve({ outcome: 'accepted' })
  act(() => {
    window.dispatchEvent(evt)
  })
  return evt
}

beforeEach(() => {
  mockPlatform = 'desktop'
  setStandalone(false)
  localStorage.clear()
  // @ts-expect-error — stub SW registration
  navigator.serviceWorker = { register: vi.fn(() => Promise.resolve()) }
})
afterEach(() => vi.clearAllMocks())

describe('PWAInstallPrompt', () => {
  it('renders nothing on desktop', () => {
    mockPlatform = 'desktop'
    const { container } = render(<PWAInstallPrompt />)
    expect(container).toBeEmptyDOMElement()
  })

  it('offers a one-tap Share Sheet install on iOS', () => {
    mockPlatform = 'ios'
    render(<PWAInstallPrompt />)
    expect(screen.getByText('Add ADHX to Share')).toBeInTheDocument()
    const add = screen.getByRole('link', { name: /add/i })
    expect(add).toHaveAttribute('href', X_ONLY_SHORTCUT_URL)
  })

  it('still shows the iOS shortcut prompt in standalone (home screen ≠ share sheet)', () => {
    mockPlatform = 'ios'
    setStandalone(true)
    render(<PWAInstallPrompt />)
    expect(screen.getByText('Add ADHX to Share')).toBeInTheDocument()
  })

  it('offers a one-tap Add button on Android once beforeinstallprompt fires', async () => {
    mockPlatform = 'android'
    render(<PWAInstallPrompt />)
    expect(screen.queryByText('Add ADHX to your home screen')).not.toBeInTheDocument()

    const evt = fireBeforeInstallPrompt()
    expect(await screen.findByText('Add ADHX to your home screen')).toBeInTheDocument()

    const addBtn = screen.getByRole('button', { name: 'Add' })
    fireEvent.click(addBtn)
    expect(evt.prompt).toHaveBeenCalled()
  })

  it('stays hidden on Android when already installed (standalone)', () => {
    mockPlatform = 'android'
    setStandalone(true)
    const { container } = render(<PWAInstallPrompt />)
    expect(container).toBeEmptyDOMElement()
  })

  it('stays hidden on iOS once the shortcut nudge is dismissed', () => {
    mockPlatform = 'ios'
    localStorage.setItem(SHORTCUT_DISMISS_KEY, '1')
    const { container } = render(<PWAInstallPrompt />)
    expect(container).toBeEmptyDOMElement()
  })

  it('dismiss hides the iOS banner and remembers it', async () => {
    mockPlatform = 'ios'
    render(<PWAInstallPrompt />)
    fireEvent.click(screen.getByLabelText('Dismiss'))
    await waitFor(() => expect(screen.queryByText('Add ADHX to Share')).not.toBeInTheDocument())
    expect(localStorage.getItem(SHORTCUT_DISMISS_KEY)).toBe('1')
  })

  it('registers the service worker', () => {
    mockPlatform = 'ios'
    render(<PWAInstallPrompt />)
    expect(navigator.serviceWorker.register).toHaveBeenCalledWith('/sw.js')
  })
})
