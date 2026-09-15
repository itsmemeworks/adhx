'use client'

import { useEffect, useState } from 'react'
import { PictureInPicture2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  NO_PICTURE_IN_PICTURE,
  PIP_QUERY,
  PIP_STATE,
  PIP_TOGGLE,
  type PictureInPictureState,
} from './useVideoPictureInPicture'

export function TheaterPictureInPictureButton({ className }: { className: string }) {
  const [state, setState] = useState(NO_PICTURE_IN_PICTURE)
  useEffect(() => {
    const update = (event: Event) => {
      setState((event as CustomEvent<PictureInPictureState>).detail)
    }
    window.addEventListener(PIP_STATE, update)
    window.dispatchEvent(new CustomEvent(PIP_QUERY))
    return () => window.removeEventListener(PIP_STATE, update)
  }, [])

  if (!state.supported && !state.active) return null
  const label = state.active ? 'Exit picture-in-picture' : 'Picture-in-picture'
  return (
    <div className="pointer-events-auto relative flex-none">
      <button
        type="button"
        aria-label={label}
        aria-pressed={state.active}
        title={state.ready || state.active ? label : 'Picture-in-picture: waiting for video'}
        disabled={state.pending || (!state.ready && !state.active)}
        onClick={(event) => {
          event.stopPropagation()
          window.dispatchEvent(new CustomEvent(PIP_TOGGLE))
        }}
        onTouchEnd={(event) => event.stopPropagation()}
        className={cn(className, 'disabled:opacity-35', state.active && 'text-clay')}
      >
        <PictureInPicture2 size={18} />
      </button>
      {state.error && (
        <span
          role="status"
          className="absolute bottom-full left-1/2 z-50 mb-2 w-52 -translate-x-1/2 rounded-lg bg-black/90 p-3 text-xs text-white lg:left-0 lg:translate-x-0"
        >
          {state.error}
        </span>
      )}
    </div>
  )
}
