/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { PWAInstallPrompt } from '@/components/PWAInstallPrompt'
import { SHORTCUT_DISMISS_KEY } from '@/components/IosShortcutInstall'
import { ANDROID_A2HS_DISMISS_KEY } from '@/components/AndroidInstall'
import { X_ONLY_SHORTCUT_URL } from '@/lib/share/ios'

let mockPlatform: 'ios' | 'android' | 'desktop' = 'desktop'
let mockPathname = '/'
vi.mock('@/lib/platform', () => ({
  getPlatformType: () => mockPlatform,
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(),
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
  mockPathname = '/'
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
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /add shortcut/i })).not.toBeInTheDocument()
    const install = screen.getByRole('link', { name: /install the iOS shortcut/i })
    expect(install).toHaveAttribute('href', X_ONLY_SHORTCUT_URL)
    expect(install).toHaveAttribute('target', '_blank')
    expect(
      screen.getByText(/Share posts to ADHX from X, Instagram, TikTok, and YouTube in one tap\./),
    ).toBeInTheDocument()
  })

  it('still shows the iOS shortcut prompt in standalone (home screen ≠ share sheet)', () => {
    mockPlatform = 'ios'
    setStandalone(true)
    render(<PWAInstallPrompt />)
    expect(screen.getByText('Install the iOS shortcut')).toBeInTheDocument()
  })

  it('shows the Android banner without waiting for beforeinstallprompt', async () => {
    mockPlatform = 'android'
    render(<PWAInstallPrompt />)
    expect(await screen.findByText('Add ADHX to your home screen')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'How' })).toHaveAttribute(
      'href',
      '/settings#android-install',
    )
    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument()
  })

  it('offers a one-tap Add button on Android once beforeinstallprompt fires', async () => {
    mockPlatform = 'android'
    render(<PWAInstallPrompt />)
    expect(await screen.findByText('Add ADHX to your home screen')).toBeInTheDocument()

    const evt = fireBeforeInstallPrompt()
    const addBtn = await screen.findByRole('button', { name: 'Add' })
    expect(screen.queryByRole('link', { name: 'How' })).not.toBeInTheDocument()
    fireEvent.click(addBtn)
    expect(evt.prompt).toHaveBeenCalled()
  })

  it('stays hidden on Android once the home-screen nudge is dismissed', () => {
    mockPlatform = 'android'
    localStorage.setItem(ANDROID_A2HS_DISMISS_KEY, '1')
    const { container } = render(<PWAInstallPrompt />)
    expect(container).toBeEmptyDOMElement()
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
    await waitFor(() =>
      expect(screen.queryByText('Install the iOS shortcut')).not.toBeInTheDocument(),
    )
    expect(localStorage.getItem(SHORTCUT_DISMISS_KEY)).toBe('1')
  })

  it('dismisses the iOS banner when tapping away', async () => {
    mockPlatform = 'ios'
    render(
      <div>
        <button type="button">elsewhere</button>
        <PWAInstallPrompt />
      </div>,
    )
    fireEvent.pointerDown(screen.getByRole('button', { name: 'elsewhere' }))
    await waitFor(() =>
      expect(screen.queryByText('Install the iOS shortcut')).not.toBeInTheDocument(),
    )
    expect(localStorage.getItem(SHORTCUT_DISMISS_KEY)).toBe('1')
  })

  it('does not dismiss the iOS banner when tapping the card itself', () => {
    mockPlatform = 'ios'
    render(<PWAInstallPrompt />)
    fireEvent.pointerDown(screen.getByRole('link', { name: /install the iOS shortcut/i }))
    expect(screen.getByText('Install the iOS shortcut')).toBeInTheDocument()
    expect(localStorage.getItem(SHORTCUT_DISMISS_KEY)).toBeNull()
  })

  it('hangs fixed under the theater logo, and sits in-flow under the header elsewhere', () => {
    mockPlatform = 'ios'
    const { rerender } = render(<PWAInstallPrompt />)
    expect(
      screen.getByRole('link', { name: /install the iOS shortcut/i }).closest('.fixed'),
    ).toHaveClass('left-3', 'top-[calc(env(safe-area-inset-top,0px)+3.15rem)]')

    mockPathname = '/library'
    rerender(<PWAInstallPrompt />)
    const wrap = screen
      .getByRole('link', { name: /install the iOS shortcut/i })
      .closest('.sm\\:hidden')
    expect(wrap).toHaveClass('relative', 'mx-3', 'mt-2')
    expect(wrap).not.toHaveClass('fixed')
  })

  it('registers the service worker', () => {
    mockPlatform = 'ios'
    render(<PWAInstallPrompt />)
    expect(navigator.serviceWorker.register).toHaveBeenCalledWith('/sw.js')
  })
})
