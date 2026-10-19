'use client'

import { useEffect, useState } from 'react'
import { PUBLIC_HOST } from './base-url'

/**
 * This ADHX's address as the person sees it in their browser. In client code
 * `NEXT_PUBLIC_APP_URL` is fixed when the app is built, so a prebuilt image
 * (Docker) would show the fallback; the browser knows the real one. The first
 * render uses the build-time value so it matches the server's HTML.
 */
export function useSiteHost(): string {
  const [host, setHost] = useState(PUBLIC_HOST)
  useEffect(() => setHost(window.location.host), [])
  return host
}
