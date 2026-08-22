'use client'

import { useState } from 'react'
import { generateAvatarDataUri, usableAvatarUrl } from '@/lib/avatar/generated-avatar'

interface AvatarImageProps {
  /** Remote avatar URL, or null/undefined for "no image on file". */
  src?: string | null
  /** Stable identifier (user id/username, or a post author's handle) the
   * generated fallback icon is derived from — same seed always renders the
   * same icon. */
  seed: string
  alt?: string
  className?: string
}

/**
 * `<img>` that shows a remote avatar when one is set, and falls back to a
 * deterministic generated icon (see `@/lib/avatar/generated-avatar`) both
 * when there's no `src` AND when a set `src` fails to load (dead URL,
 * blocked hotlink, etc.) — same fallback either way. A client component so
 * it can carry the `onError` handler even when rendered from a server
 * component (curator/author profile pages).
 */
export function AvatarImage({ src, seed, alt = '', className }: AvatarImageProps) {
  const [broken, setBroken] = useState(false)
  // `usableAvatarUrl` also treats a platform's own "no photo" placeholder as
  // absent — it loads fine, so `onError` would never fire for it.
  const remote = usableAvatarUrl(src)
  const showRemote = Boolean(remote) && !broken

  return (
    <img
      src={showRemote ? remote! : generateAvatarDataUri(seed)}
      alt={alt}
      referrerPolicy="no-referrer"
      className={className}
      onError={() => setBroken(true)}
    />
  )
}
