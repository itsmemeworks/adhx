'use client'

import { useEffect } from 'react'
import { usePreferences, type BodyFont } from '@/lib/preferences-context'

const FONT_CLASSES: Record<BodyFont, string> = {
  'ibm-plex': 'font-ibm-plex',
  'inter': 'font-inter',
  'lexend': 'font-lexend',
  'atkinson': 'font-atkinson',
}

export function FontProvider({ children }: { children: React.ReactNode }) {
  const { preferences } = usePreferences()

  useEffect(() => {
    // Remove all font classes first
    Object.values(FONT_CLASSES).forEach(cls => {
      document.documentElement.classList.remove(cls)
    })
    // Add the selected font class
    document.documentElement.classList.add(FONT_CLASSES[preferences.bodyFont])
  }, [preferences.bodyFont])

  return <>{children}</>
}
