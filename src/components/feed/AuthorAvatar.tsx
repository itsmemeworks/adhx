'use client'

import { useState } from 'react'
import { usableAvatarUrl } from '@/lib/avatar/generated-avatar'
import { GobShape } from '@/components/next/GobShape'
import { FaceInitial } from '@/components/next/FaceInitial'

interface AuthorAvatarProps {
  src?: string | null
  author: string
  size?: 'sm' | 'md' | 'lg'
}

const PIXELS = { sm: 20, md: 28, lg: 40 }

const SIZE_CLASSES = {
  sm: 'w-5 h-5 text-[10px]',
  md: 'w-7 h-7 text-xs',
  lg: 'w-10 h-10 text-sm',
}

/** A person's face, Gob shaped like every other one (see `GobShape`). */
export function AuthorAvatar({ src, author, size = 'sm' }: AuthorAvatarProps): React.ReactElement {
  const sizeClass = SIZE_CLASSES[size]
  // A remote avatar that fails to load (dead URL, blocked hotlink, etc.)
  // falls through to the initial on their colour, like having no `src` at all.
  const [broken, setBroken] = useState(false)
  // Also treats a platform's own "no photo" placeholder (X's grey silhouette)
  // as absent — it loads fine, so `onError` never fires for it.
  const remote = usableAvatarUrl(src)

  return (
    <GobShape className={sizeClass}>
      {remote && !broken ? (
        <img
          src={remote}
          alt={author}
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        <span role="img" aria-label={author} className="block h-full w-full">
          <FaceInitial username={author} size={PIXELS[size]} />
        </span>
      )}
    </GobShape>
  )
}
