import { NextResponse } from 'next/server'
import { appError, withPhoneKeyOrSession } from '@/lib/api/phone-auth'
import { channelsOverview, coverUrls } from '@/lib/channels/overview'
import { captureException } from '@/lib/sentry'
import { channelTitle } from '@/components/next/channels/title'

/**
 * GET /api/app/channels — the Channels screen for the phone app (phone key,
 * or a signed-in session): `{ group, friends, mine }`.
 *
 * - `group`: From everyone, `{ slug, name, size, members, savers, newCount, covers }`.
 * - `friends`: Your people, `{ username, name, avatarUrl, size, newCount, covers }`.
 * - `mine`: your own channels then Made for you,
 *   `{ slug, name, size, kind: 'channel' | 'made-for-you', isPublic, covers }`.
 *
 * `covers` are image addresses (absolute paths on this ADHX, or full URLs).
 * Play one with `GET /api/app/channels/{group|friend|mine}/{slug}`.
 */
export const GET = withPhoneKeyOrSession(async (_request, userId) => {
  try {
    const o = await channelsOverview(userId)
    return NextResponse.json(
      {
        group: o.group.map((c) => ({ ...c, covers: coverUrls(c.covers) })),
        friends: o.friends.map((f) => ({ ...f, covers: coverUrls(f.covers) })),
        mine: [
          ...o.mine.map((c) => ({
            slug: c.tag,
            name: channelTitle(c.tag),
            size: c.count,
            kind: 'channel' as const,
            isPublic: c.isPublic,
            covers: coverUrls(c.covers),
          })),
          ...o.madeForYou.map((c) => ({
            slug: c.slug,
            name: c.name,
            size: c.size,
            kind: 'made-for-you' as const,
            isPublic: false,
            covers: coverUrls(c.covers),
          })),
        ],
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    captureException(error, { endpoint: '/api/app/channels' })
    return appError(500, 'failed', 'Channels didn’t load just now. Try again.')
  }
})
