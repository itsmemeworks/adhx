'use client'

import { useEffect, useRef, type CSSProperties } from 'react'

/**
 * A short muted clip that loops while it's on screen. Nothing downloads until
 * it scrolls into view; with reduced motion (or no script) it stays on its
 * poster.
 */
export function LoopVideo({
  src,
  poster,
  className,
  style,
}: {
  src: string
  poster: string
  className?: string
  style?: CSSProperties
}) {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = ref.current
    if (!video) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)')
    let visible = false
    const sync = () => {
      if (visible && !still.matches) {
        video.play().catch(() => {})
      } else {
        video.pause()
      }
    }
    const watch = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting
        sync()
      },
      { threshold: 0.15 },
    )
    watch.observe(video)
    still.addEventListener('change', sync)
    return () => {
      watch.disconnect()
      still.removeEventListener('change', sync)
    }
  }, [])

  return (
    <video
      ref={ref}
      src={src}
      poster={poster}
      muted
      loop
      playsInline
      preload="none"
      disablePictureInPicture
      aria-hidden
      tabIndex={-1}
      className={className}
      style={style}
    />
  )
}
