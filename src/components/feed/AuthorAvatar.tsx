'use client'

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

export function AuthorAvatar({ src, author, size = 'sm' }: AuthorAvatarProps): React.ReactElement {
  const sizeClass = SIZE_CLASSES[size]

  if (src) {
    return <img src={src} alt={author} className={`${sizeClass} rounded-full object-cover flex-shrink-0`} />
  }

  const initial = author[0]?.toUpperCase() || '?'
  return (
    <div
      className={`${sizeClass} rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-semibold flex-shrink-0`}
    >
      {initial}
    </div>
  )
}
