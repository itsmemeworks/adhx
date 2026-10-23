import Link from 'next/link'
import type { ReactNode } from 'react'
import { Play } from 'lucide-react'
import { NxAvatar } from '../primitives'
import { NxHeader } from '../channels/ChannelParts'

/**
 * Public profile pages in the new design: an X author's posts on ADHX
 * (`/{handle}`) and a curator's public channels (`/t/{username}`). Server
 * friendly; the header and avatar are client parts.
 */

export function ProfileLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-nx-bg font-nx-sans text-nx-cream">
      <NxHeader current={null} />
      <main className="mx-auto flex max-w-[1600px] flex-col gap-8 px-4 pb-16 pt-4 md:px-7 md:pt-8">
        {children}
      </main>
    </div>
  )
}

export function ProfileHero({
  avatarUrl,
  handle,
  name,
  lines,
  actions,
}: {
  avatarUrl: string | null
  handle: string
  name: string
  /** Short facts under the name ("12 posts on ADHX"), joined with dots. */
  lines: string[]
  actions?: ReactNode
}) {
  return (
    <section className="flex flex-col gap-5 rounded-[28px] bg-nx-deep px-5 py-7 md:flex-row md:items-center md:px-9 md:py-9">
      <NxAvatar author={{ avatarUrl, handle, name }} size={84} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <h1 className="m-0 truncate font-nx-serif text-[40px] font-normal leading-none md:text-[56px]">
          {name}
        </h1>
        <p className="m-0 text-[15px] text-nx-ink/65">
          {/* No display name: the name already is the handle, so don't say it twice. */}
          {(name === `@${handle}` ? lines : [`@${handle}`, ...lines]).join(' · ')}
        </p>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2.5">{actions}</div>}
    </section>
  )
}

/**
 * The hero's buttons. It has 28 px corners and 20 px padding (36 px from md),
 * so they sit at the 8 px floor.
 */
export const PRIMARY_ACTION =
  'flex h-[50px] items-center gap-2 rounded-[8px] bg-nx-accent px-6 text-base font-extrabold text-black'
export const SECONDARY_ACTION =
  'flex h-[50px] items-center gap-2 rounded-[8px] border border-white/30 px-5 text-base font-bold text-nx-ink'

export function PlayLink({ href, label = 'Play' }: { href: string; label?: string }) {
  return (
    <Link href={href} className={PRIMARY_ACTION}>
      <Play aria-hidden className="h-4 w-4" fill="currentColor" strokeWidth={0} />
      <span>{label}</span>
    </Link>
  )
}

export interface ProfilePost {
  key: string
  url: string
  text: string | null
  thumbnailUrl: string | null
  kind: 'video' | 'photo' | 'text' | 'article'
  /** e.g. "3 saves" */
  meta?: string
}

const KIND_LABEL: Record<ProfilePost['kind'], string> = {
  video: 'Video',
  photo: 'Photo',
  text: 'Post',
  article: 'Article',
}

/** Posts as tiles: pictures where there are any, words on cream where not. */
export function ProfilePostGrid({ posts, author }: { posts: ProfilePost[]; author: string }) {
  return (
    <ul className="m-0 list-none columns-2 gap-3 p-0 md:columns-3 xl:columns-4">
      {posts.map((post) => (
        <li key={post.key} className="mb-3 break-inside-avoid">
          <a
            href={post.url}
            aria-label={`${KIND_LABEL[post.kind]} by @${author}: ${post.text || 'open it'}`}
            className="group relative block overflow-hidden rounded-nx-tile bg-nx-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nx-accent"
          >
            {post.thumbnailUrl ? (
              <span className="relative block aspect-[4/5]">
                <img
                  src={post.thumbnailUrl}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                />
                <span className="nx-scrim nx-text-shadow absolute inset-x-0 bottom-0 flex flex-col gap-1 px-3 pb-3 pt-12">
                  {post.text && (
                    <span className="line-clamp-2 text-[14px] leading-snug">{post.text}</span>
                  )}
                </span>
                <span className="nx-plate absolute left-2 top-2 rounded-full px-2.5 py-1 text-[11px] font-bold">
                  {KIND_LABEL[post.kind]}
                </span>
              </span>
            ) : (
              <span className="flex flex-col gap-2 bg-nx-cream p-4 text-nx-bg">
                <span className="text-[11px] font-bold uppercase tracking-wide text-nx-on-cream-soft">
                  {KIND_LABEL[post.kind]}
                </span>
                <span className="line-clamp-[8] font-nx-serif text-[19px] leading-[1.15]">
                  {post.text || `A post by @${author}`}
                </span>
              </span>
            )}
            {post.meta && (
              <span className="nx-plate absolute right-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-bold">
                {post.meta}
              </span>
            )}
          </a>
        </li>
      ))}
    </ul>
  )
}
