import { cn } from '@/lib/utils'

export interface PostLoaderProps {
  variant: 'auto' | 'dark' | 'paper'
  size?: number
  caption?: string
  label?: string
  decorative?: boolean
  className?: string
}

/** Brand loader for post/media resolution. Action-level network spinners keep
 * their compact progress icons; this is for content that has not painted yet. */
export function PostLoader({
  variant,
  size = 64,
  caption,
  label = 'Loading post',
  decorative = false,
  className,
}: PostLoaderProps) {
  return (
    <div
      role={decorative ? undefined : 'status'}
      aria-label={decorative ? undefined : label}
      className={cn('flex flex-col items-center justify-center gap-3 text-center', className)}
    >
      {variant === 'auto' ? (
        <>
          <img
            src="/gob-loader-paper.svg"
            alt=""
            aria-hidden
            style={{ width: size, height: size }}
            className="block flex-none dark:hidden"
          />
          <img
            src="/gob-loader.svg"
            alt=""
            aria-hidden
            style={{ width: size, height: size }}
            className="hidden flex-none dark:block"
          />
        </>
      ) : (
        <img
          src={variant === 'dark' ? '/gob-loader.svg' : '/gob-loader-paper.svg'}
          alt=""
          aria-hidden
          style={{ width: size, height: size }}
          className="block flex-none"
        />
      )}
      {caption ? (
        <span
          className={cn(
            'font-indie-flower text-[22px]',
            variant === 'dark'
              ? 'text-[#F4F1EA]'
              : variant === 'paper'
                ? 'text-[#141414]'
                : 'text-[#141414] dark:text-[#F4F1EA]',
          )}
        >
          <span>{caption}</span>
        </span>
      ) : null}
    </div>
  )
}
