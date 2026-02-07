/**
 * Platform detection utilities for showing platform-specific UI
 */

/**
 * Detect if device is running iOS (iPhone, iPad, iPod)
 * Uses userAgent detection for iOS-specific targeting
 */
export function isIOSDevice(): boolean {
  if (typeof window === 'undefined') return false
  const ua = navigator.userAgent || ''
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/**
 * Detect if device is running Android
 */
export function isAndroidDevice(): boolean {
  if (typeof window === 'undefined') return false
  return /android/i.test(navigator.userAgent || '')
}

export type PlatformType = 'ios' | 'android' | 'desktop'

/**
 * Get the current platform type for showing platform-specific content
 */
export function getPlatformType(): PlatformType {
  if (isIOSDevice()) return 'ios'
  if (isAndroidDevice()) return 'android'
  return 'desktop'
}
