'use client'

/**
 * Theater tag + action pill chrome — the same flat frost as the mobile
 * paste button (`PasteLinkButton` iconOnly) and the avatar menu trigger:
 * `border-white/25 bg-white/10 backdrop-blur-md hover:bg-white/20`.
 */

import { cn } from '@/lib/utils'
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react'

/** Same fill as `PasteLinkButton` iconOnly. */
export const STAGE_GLASS_FILL =
  'border border-white/25 bg-white/10 backdrop-blur-md hover:bg-white/20'

type StageGlassProps<T extends ElementType> = {
  as?: T
  className?: string
  children: ReactNode
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'className' | 'children'>

export function StageGlass<T extends ElementType = 'div'>({
  as,
  className,
  children,
  ...props
}: StageGlassProps<T>) {
  const Comp = (as ?? 'div') as ElementType
  return (
    <Comp className={cn(STAGE_GLASS_FILL, className)} data-stage-glass="" {...props}>
      {children}
    </Comp>
  )
}
