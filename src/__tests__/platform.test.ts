import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { isIOSDevice, isAndroidDevice, getPlatformType } from '@/lib/platform'

describe('platform detection', () => {
  const originalWindow = global.window
  const originalNavigator = global.navigator

  beforeEach(() => {
    // Reset to a default desktop environment
    Object.defineProperty(global, 'window', { value: {}, writable: true, configurable: true })
    Object.defineProperty(global, 'navigator', {
      value: {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        platform: 'MacIntel',
        maxTouchPoints: 0,
      },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    Object.defineProperty(global, 'window', { value: originalWindow, writable: true, configurable: true })
    Object.defineProperty(global, 'navigator', { value: originalNavigator, writable: true, configurable: true })
  })

  describe('isIOSDevice', () => {
    it('returns true for iPhone user agent', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
          platform: 'iPhone',
          maxTouchPoints: 5,
        },
        writable: true,
        configurable: true,
      })
      expect(isIOSDevice()).toBe(true)
    })

    it('returns true for iPad user agent', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
          platform: 'iPad',
          maxTouchPoints: 5,
        },
        writable: true,
        configurable: true,
      })
      expect(isIOSDevice()).toBe(true)
    })

    it('returns true for iPod user agent', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15',
          platform: 'iPod',
          maxTouchPoints: 5,
        },
        writable: true,
        configurable: true,
      })
      expect(isIOSDevice()).toBe(true)
    })

    it('returns true for iPad on iOS 13+ (reports as MacIntel with touch)', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
          platform: 'MacIntel',
          maxTouchPoints: 5,
        },
        writable: true,
        configurable: true,
      })
      expect(isIOSDevice()).toBe(true)
    })

    it('returns false for desktop Mac (MacIntel but no touch)', () => {
      expect(isIOSDevice()).toBe(false)
    })

    it('returns false for Android user agent', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
          platform: 'Linux armv81',
          maxTouchPoints: 5,
        },
        writable: true,
        configurable: true,
      })
      expect(isIOSDevice()).toBe(false)
    })

    it('returns false on server (window undefined)', () => {
      Object.defineProperty(global, 'window', { value: undefined, writable: true, configurable: true })
      expect(isIOSDevice()).toBe(false)
    })
  })

  describe('isAndroidDevice', () => {
    it('returns true for Android phone user agent', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
          platform: 'Linux armv81',
          maxTouchPoints: 5,
        },
        writable: true,
        configurable: true,
      })
      expect(isAndroidDevice()).toBe(true)
    })

    it('returns true for Android tablet user agent', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-X800) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          platform: 'Linux armv81',
          maxTouchPoints: 5,
        },
        writable: true,
        configurable: true,
      })
      expect(isAndroidDevice()).toBe(true)
    })

    it('returns false for iPhone user agent', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
          platform: 'iPhone',
          maxTouchPoints: 5,
        },
        writable: true,
        configurable: true,
      })
      expect(isAndroidDevice()).toBe(false)
    })

    it('returns false for desktop Chrome', () => {
      expect(isAndroidDevice()).toBe(false)
    })

    it('returns false on server (window undefined)', () => {
      Object.defineProperty(global, 'window', { value: undefined, writable: true, configurable: true })
      expect(isAndroidDevice()).toBe(false)
    })
  })

  describe('getPlatformType', () => {
    it('returns ios for iPhone', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
          platform: 'iPhone',
          maxTouchPoints: 5,
        },
        writable: true,
        configurable: true,
      })
      expect(getPlatformType()).toBe('ios')
    })

    it('returns android for Android device', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
          platform: 'Linux armv81',
          maxTouchPoints: 5,
        },
        writable: true,
        configurable: true,
      })
      expect(getPlatformType()).toBe('android')
    })

    it('returns desktop for Mac Chrome', () => {
      expect(getPlatformType()).toBe('desktop')
    })

    it('returns desktop for Windows Chrome', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          platform: 'Win32',
          maxTouchPoints: 0,
        },
        writable: true,
        configurable: true,
      })
      expect(getPlatformType()).toBe('desktop')
    })

    it('returns desktop for Linux Firefox', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0',
          platform: 'Linux x86_64',
          maxTouchPoints: 0,
        },
        writable: true,
        configurable: true,
      })
      expect(getPlatformType()).toBe('desktop')
    })

    it('returns desktop on server (window undefined)', () => {
      Object.defineProperty(global, 'window', { value: undefined, writable: true, configurable: true })
      expect(getPlatformType()).toBe('desktop')
    })
  })
})
