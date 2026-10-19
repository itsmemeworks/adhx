'use client'

import { useState } from 'react'
import { generateAvatarDataUri, usableAvatarUrl } from '@/lib/avatar/generated-avatar'
import { GobShape } from '@/components/next/GobShape'

interface AuthorAvatarProps {
  src?: string | null
  author: string
  size?: 'sm' | 'md' | 'lg'
}

const SIZE_CLASSES = {
  sm: 'w-5 h-5 text-[10px]',
  md: 'w-7 h-7 text-xs',
  lg: 'w-10 h-10 text-sm',
}

/** A person's face, Gob shaped like every other one (see `GobShape`). */
export function AuthorAvatar({ src, author, size = 'sm' }: AuthorAvatarProps): React.ReactElement {
  const sizeClass = SIZE_CLASSES[size]
  // A remote avatar that fails to load (dead URL, blocked hotlink, etc.)
  // falls through to the same generated icon as having no `src` at all.
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
        <img
          src={generateAvatarDataUri(author)}
          alt={author}
          className="h-full w-full object-cover"
        />
      )}
    </GobShape>
  )
}
