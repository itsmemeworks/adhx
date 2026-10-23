'use client'

import { Suspense } from 'react'
import { SettingsScreen } from '@/components/next/settings/SettingsScreen'

export function SettingsClient() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-nx-bg" />}>
      <SettingsScreen />
    </Suspense>
  )
}
