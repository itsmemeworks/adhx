/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { PWAInstallPrompt } from '@/components/PWAInstallPrompt'

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

  it('shows manual Add-to-Home-Screen instructions on iOS (no native button)', () => {
    mockPlatform = 'ios'
    render(<PWAInstallPrompt />)
    expect(screen.getByText('Add ADHX to your home screen')).toBeInTheDocument()
    expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add/ })).not.toBeInTheDocument()
  })

  it('offers a one-tap Add button on Android once beforeinstallprompt fires', async () => {
    mockPlatform = 'android'
    render(<PWAInstallPrompt />)
    // Nothing until the browser offers the prompt
    expect(screen.queryByText('Add ADHX to your home screen')).not.toBeInTheDocument()

    const evt = fireBeforeInstallPrompt()
    expect(await screen.findByText('Add ADHX to your home screen')).toBeInTheDocument()

    const addBtn = screen.getByRole('button', { name: 'Add' })
    fireEvent.click(addBtn)
    expect(evt.prompt).toHaveBeenCalled()
  })

  it('stays hidden when already installed (standalone)', () => {
    mockPlatform = 'ios'
    setStandalone(true)
    const { container } = render(<PWAInstallPrompt />)
    expect(container).toBeEmptyDOMElement()
  })

  it('stays hidden once dismissed (persisted)', () => {
    mockPlatform = 'ios'
    localStorage.setItem('adhx-a2hs-dismissed', '1')
    const { container } = render(<PWAInstallPrompt />)
    expect(container).toBeEmptyDOMElement()
  })

  it('dismiss hides the banner and remembers it', async () => {
    mockPlatform = 'ios'
    render(<PWAInstallPrompt />)
    fireEvent.click(screen.getByLabelText('Dismiss'))
    await waitFor(() =>
      expect(screen.queryByText('Add ADHX to your home screen')).not.toBeInTheDocument(),
    )
    expect(localStorage.getItem('adhx-a2hs-dismissed')).toBe('1')
  })

  it('registers the service worker', () => {
    mockPlatform = 'ios'
    render(<PWAInstallPrompt />)
    expect(navigator.serviceWorker.register).toHaveBeenCalledWith('/sw.js')
  })
})
