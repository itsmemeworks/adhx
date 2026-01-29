import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { handleShareMedia, isTouchDevice } from '@/components/feed/utils'

describe('Feed Utils', () => {
  describe('isTouchDevice', () => {
    let originalMatchMedia: typeof window.matchMedia

    beforeEach(() => {
      originalMatchMedia = window.matchMedia
    })

    afterEach(() => {
      window.matchMedia = originalMatchMedia
    })

    it('returns false for devices with hover capability (desktop)', () => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query === '(hover: hover)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))

      expect(isTouchDevice()).toBe(false)
    })

    it('returns true for devices without hover capability (mobile)', () => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))

      expect(isTouchDevice()).toBe(true)
    })
  })

  describe('handleShareMedia', () => {
    let mockEvent: React.MouseEvent
    let originalFetch: typeof fetch
    let originalCreateObjectURL: typeof URL.createObjectURL
    let originalRevokeObjectURL: typeof URL.revokeObjectURL
    let originalMatchMedia: typeof window.matchMedia

    beforeEach(() => {
      mockEvent = {
        stopPropagation: vi.fn(),
        preventDefault: vi.fn(),
      } as unknown as React.MouseEvent

      originalFetch = global.fetch
      originalCreateObjectURL = URL.createObjectURL
      originalRevokeObjectURL = URL.revokeObjectURL
      originalMatchMedia = window.matchMedia

      URL.createObjectURL = vi.fn().mockReturnValue('blob:test-url')
      URL.revokeObjectURL = vi.fn()

      // Default to mobile (touch device) so Web Share API tests work
      // Tests that need desktop behavior will override this
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: false, // false for hover:hover means touch device
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    })

    afterEach(() => {
      global.fetch = originalFetch
      URL.createObjectURL = originalCreateObjectURL
      URL.revokeObjectURL = originalRevokeObjectURL
      window.matchMedia = originalMatchMedia
      vi.restoreAllMocks()
    })

    it('stops event propagation and prevents default', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        blob: () => Promise.resolve(new Blob(['test'], { type: 'image/jpeg' })),
      })

      // Mock navigator without share support
      const originalCanShare = navigator.canShare
      Object.defineProperty(navigator, 'canShare', {
        value: undefined,
        writable: true,
        configurable: true,
      })

      await handleShareMedia(mockEvent, 'https://example.com/image.jpg', 'test.jpg')

      expect(mockEvent.stopPropagation).toHaveBeenCalled()
      expect(mockEvent.preventDefault).toHaveBeenCalled()

      // Restore
      Object.defineProperty(navigator, 'canShare', {
        value: originalCanShare,
        writable: true,
        configurable: true,
      })
    })

    it('uses Web Share API when file sharing is supported', async () => {
      const mockBlob = new Blob(['test'], { type: 'image/jpeg' })
      global.fetch = vi.fn().mockResolvedValue({
        blob: () => Promise.resolve(mockBlob),
      })

      const mockShare = vi.fn().mockResolvedValue(undefined)
      const mockCanShare = vi.fn().mockReturnValue(true)

      Object.defineProperty(navigator, 'canShare', {
        value: mockCanShare,
        writable: true,
        configurable: true,
      })
      Object.defineProperty(navigator, 'share', {
        value: mockShare,
        writable: true,
        configurable: true,
      })

      const result = await handleShareMedia(mockEvent, 'https://example.com/image.jpg', 'test.jpg', 'image/jpeg')

      expect(mockCanShare).toHaveBeenCalled()
      expect(mockShare).toHaveBeenCalled()
      expect(result).toEqual({ success: true, method: 'share' })
    })

    it('falls back to download when file sharing is not supported', async () => {
      const mockBlob = new Blob(['test'], { type: 'image/jpeg' })
      global.fetch = vi.fn().mockResolvedValue({
        blob: () => Promise.resolve(mockBlob),
      })

      // Mock canShare to return false (not supported)
      Object.defineProperty(navigator, 'canShare', {
        value: () => false,
        writable: true,
        configurable: true,
      })

      // Mock document methods for download fallback
      const mockLink = {
        href: '',
        download: '',
        click: vi.fn(),
      }
      const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockLink as unknown as Node)
      const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockLink as unknown as Node)

      const result = await handleShareMedia(mockEvent, 'https://example.com/image.jpg', 'test.jpg')

      expect(result).toEqual({ success: true, method: 'download' })
      expect(URL.createObjectURL).toHaveBeenCalled()

      appendChildSpy.mockRestore()
      removeChildSpy.mockRestore()
    })

    it('handles user cancellation (AbortError) gracefully', async () => {
      const mockBlob = new Blob(['test'], { type: 'image/jpeg' })
      global.fetch = vi.fn().mockResolvedValue({
        blob: () => Promise.resolve(mockBlob),
      })

      const abortError = new Error('User cancelled')
      abortError.name = 'AbortError'
      const mockShare = vi.fn().mockRejectedValue(abortError)
      const mockCanShare = vi.fn().mockReturnValue(true)

      Object.defineProperty(navigator, 'canShare', {
        value: mockCanShare,
        writable: true,
        configurable: true,
      })
      Object.defineProperty(navigator, 'share', {
        value: mockShare,
        writable: true,
        configurable: true,
      })

      const result = await handleShareMedia(mockEvent, 'https://example.com/image.jpg', 'test.jpg')

      // AbortError means user cancelled the share sheet - still counts as handled
      expect(result).toEqual({ success: true, method: 'share' })
    })

    it('returns failure on fetch error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await handleShareMedia(mockEvent, 'https://example.com/image.jpg', 'test.jpg')

      // On mobile (default mock), failure returns method: 'share'
      expect(result.success).toBe(false)
      expect(consoleSpy).toHaveBeenCalled()

      consoleSpy.mockRestore()
    })

    it('downloads directly on desktop (hover-capable devices)', async () => {
      // Mock desktop device (has hover capability)
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query === '(hover: hover)', // true for hover:hover means desktop
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))

      const mockBlob = new Blob(['test'], { type: 'image/jpeg' })
      global.fetch = vi.fn().mockResolvedValue({
        blob: () => Promise.resolve(mockBlob),
      })

      // Mock document methods for download
      const mockLink = {
        href: '',
        download: '',
        click: vi.fn(),
      }
      const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockLink as unknown as Node)
      const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockLink as unknown as Node)

      const result = await handleShareMedia(mockEvent, 'https://example.com/image.jpg', 'test.jpg')

      // On desktop, should download directly without trying Web Share API
      expect(result).toEqual({ success: true, method: 'download' })
      expect(URL.createObjectURL).toHaveBeenCalled()

      appendChildSpy.mockRestore()
      removeChildSpy.mockRestore()
    })

    it('uses correct mime type for videos', async () => {
      const mockBlob = new Blob(['test'], { type: 'video/mp4' })
      global.fetch = vi.fn().mockResolvedValue({
        blob: () => Promise.resolve(mockBlob),
      })

      let capturedFile: File | null = null
      const mockShare = vi.fn().mockImplementation(({ files }) => {
        capturedFile = files[0]
        return Promise.resolve()
      })
      const mockCanShare = vi.fn().mockReturnValue(true)

      Object.defineProperty(navigator, 'canShare', {
        value: mockCanShare,
        writable: true,
        configurable: true,
      })
      Object.defineProperty(navigator, 'share', {
        value: mockShare,
        writable: true,
        configurable: true,
      })

      await handleShareMedia(mockEvent, 'https://example.com/video.mp4', 'test.mp4', 'video/mp4')

      expect((capturedFile as File | null)?.type).toBe('video/mp4')
      expect((capturedFile as File | null)?.name).toBe('test.mp4')
    })
  })
})
