/**
 * Device/input detection for feed components (touch vs. hover, iOS).
 */

/**
 * Detect if device is touch-only (no hover capability)
 * Uses CSS media query which is more reliable than touch event detection
 */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false
  return !window.matchMedia('(hover: hover)').matches
}

/**
 * Detect if device is running iOS (iPhone, iPad, iPod)
 * Uses userAgent detection for iOS-specific targeting
 */
export function isIOSDevice(): boolean {
  if (typeof window === 'undefined') return false

  const userAgent = navigator.userAgent || ''

  // Check for iPhone, iPad, iPod
  // Also check for iPad on iOS 13+ which reports as MacIntel but has touch
  return (
    /iPad|iPhone|iPod/.test(userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}
