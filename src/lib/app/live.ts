import type { FeedItemResponse as FeedItem } from '@/lib/feed/build-item'
import type { Saver } from '@/lib/people/types'
import type {
  FormingView,
  MomentDetail,
  MomentEvent,
  MomentView,
  MomentsSnapshot,
  StreamItem,
} from '@/lib/moments/engine'
import { toPhonePost, type PhonePost } from './phone-post'

/**
 * "Right now" for the phone apps (`/api/app/live*`): the same moments as the
 * web, with names (the caller is always a member: a phone key), covers as
 * image addresses (absolute paths on this ADHX, or a full URL for a link's
 * preview picture) and posts as `PhonePost`s.
 */

/** Reads per phone per minute (`/api/app/live`, `/api/app/live/{slug}`). */
export const LIVE_LIMIT = { windowMs: 60_000, max: 120 }

export interface PhoneMoment {
  slug: string
  title: string
  hue: string
  people: number
  posts: number
  lastAt: string
  rising: boolean
  watching: number
  /** Cover pictures, newest first (posts without one are left out). */
  covers: string[]
  /** Up to 5 people saving these, newest first; `people` is the full count. */
  savers: Saver[]
  /** Members tuned in now, without you. */
  watchers: Saver[]
  /** Visible saves into it in the last `windowMinutes` ("3 saves in 10 min"). */
  recentSaves: number
  /** 5, 10, 15, 30 or 60: the span `recentSaves` covers (60 when there are none). */
  windowMinutes: number
}

export interface PhoneForming {
  id: string
  title: string
  hue: string
  have: number
  need: number
  unit: 'people' | 'saves'
  covers: string[]
}

export interface PhoneStreamItem {
  id: string
  at: string
  post: PhonePost
  to: StreamItem['to']
}

export interface PhoneLive {
  label: string
  hours: number
  moments: PhoneMoment[]
  forming: PhoneForming[]
  stream: PhoneStreamItem[]
  stats: { today: number; lastHour: number }
}

export interface PhoneMomentDetail {
  moment: PhoneMoment
  items: PhonePost[]
  watchers: Saver[]
}

/** An address the app can resolve against its ADHX: a path from the root, or a full URL. */
export function absolutePath(url: string): string {
  if (/^https?:\/\//i.test(url) || url.startsWith('/')) return url
  return `/${url}`
}

/** A post's cover picture: a link's preview image, a video's poster, a photo. */
export function coverImage(post: FeedItem): string | null {
  const article = post.category === 'article' || post.isXArticle
  const media = post.media?.[0]
  const src = (article ? post.articlePreview?.imageUrl : null) || media?.thumbnailUrl || media?.url
  return src ? absolutePath(src) : null
}

function covers(posts: FeedItem[]): string[] {
  return posts.map(coverImage).filter((c): c is string => !!c)
}

function phonePost(post: FeedItem, savedAt?: string, savers?: Saver[]): PhonePost {
  const out = toPhonePost({ post, saved: false, matched: [], strength: 'related' }, false)
  return {
    ...out,
    ...(savedAt ? { savedAt } : {}),
    ...(savers ? { savers } : {}),
  }
}

export function phoneMoment(m: MomentView): PhoneMoment {
  return {
    slug: m.slug,
    title: m.title,
    hue: m.hue,
    people: m.people,
    posts: m.posts,
    lastAt: m.lastAt,
    rising: m.rising,
    watching: m.watching,
    covers: covers(m.covers),
    savers: m.savers ?? [],
    watchers: m.watchers ?? [],
    recentSaves: m.recentSaves ?? 0,
    windowMinutes: m.windowMinutes ?? 60,
  }
}

function phoneForming(f: FormingView): PhoneForming {
  return {
    id: f.id,
    title: f.title,
    hue: f.hue,
    have: f.have,
    need: f.need,
    unit: f.unit,
    covers: covers(f.covers),
  }
}

/** The snapshot, already named for the caller (`withSnapshotPeople`), in the phone's shapes. */
export function phoneLive(snapshot: MomentsSnapshot): PhoneLive {
  return {
    label: snapshot.label,
    hours: snapshot.hours,
    moments: snapshot.moments.map(phoneMoment),
    forming: snapshot.forming.map(phoneForming),
    stream: snapshot.stream.map((item) => ({
      id: item.id,
      at: item.at,
      post: phonePost(item.post, item.at),
      to: item.to,
    })),
    stats: snapshot.stats,
  }
}

/** One moment, already named for the caller (`withDetailPeople`), in the phone's shapes. */
export function phoneMomentDetail(detail: MomentDetail): PhoneMomentDetail {
  return {
    moment: phoneMoment(detail.moment),
    items: detail.items.map((i) => phonePost(i.post, i.savedAt, i.savers ?? [])),
    watchers: detail.watchers ?? [],
  }
}

/**
 * A live event for the phone: the same events as the web, with the phone's
 * shapes where a post or moment rides along (`save.item.post` is a
 * `PhonePost`, moments are `PhoneMoment`s).
 */
export function phoneEvent(event: MomentEvent): { type: string } {
  switch (event.type) {
    case 'save': {
      const out: Omit<typeof event, 'item' | 'moment' | 'forming'> & Record<string, unknown> = {
        ...event,
        item: {
          ...event.item,
          post: phonePost(event.item.post, event.item.at, event.saver ? [event.saver] : []),
        },
        ...(event.moment ? { moment: phoneMoment(event.moment) } : {}),
        ...(event.forming ? { forming: phoneForming(event.forming) } : {}),
      }
      return out
    }
    case 'formed': {
      const out: { type: 'formed'; formingId: string; moment: PhoneMoment } = {
        ...event,
        moment: phoneMoment(event.moment),
      }
      return out
    }
    default:
      return event
  }
}
