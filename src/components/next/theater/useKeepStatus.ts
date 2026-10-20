'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Is the post on stage kept yet? Asks `GET /api/activity/processing/posts`
 * when a post comes on stage, and every `POLL_MS` while it is still on its
 * way (`waiting`, `keeping`, `converting`), so "Getting it ready" turns into
 * playing the moment it's kept. Members only; nothing is asked signed out.
 */

export type KeepState = 'waiting' | 'keeping' | 'converting' | 'kept' | 'none'

export interface PostKeepStatus {
  platform: string
  id: string
  state: KeepState
  step: 1 | 2 | 3 | null
  percent: number | null
  keptAt: string | null
}

export interface PeopleFace {
  username: string
  name: string | null
  avatarUrl: string | null
}

export const KEEP_POLL_MS = 1500
/** A copy finished this recently still reads "Kept on your ADHX" when it comes on stage. */
export const JUST_KEPT_MS = 2 * 60_000

/** Still on its way to this ADHX: the stage shows "Getting it ready". */
export function onItsWay(status: Pick<PostKeepStatus, 'state'> | null | undefined): boolean {
  return (
    status?.state === 'waiting' || status?.state === 'keeping' || status?.state === 'converting'
  )
}

/** Kept a moment ago (seen happening, or finished in the last two minutes). */
export function isJustKept(
  status: Pick<PostKeepStatus, 'state' | 'keptAt'> | null | undefined,
  sawItKept: boolean,
  now = Date.now(),
): boolean {
  if (status?.state !== 'kept') return false
  if (sawItKept) return true
  const at = status.keptAt ? Date.parse(status.keptAt) : NaN
  return Number.isFinite(at) && now - at >= 0 && now - at <= JUST_KEPT_MS
}

export function useKeepStatus(
  post: { platform: string; id: string } | null,
  enabled: boolean,
): { status: PostKeepStatus | null; people: PeopleFace[]; justKept: boolean } {
  const key = post && enabled ? `${post.platform || 'twitter'}:${post.id}` : null
  const [answer, setAnswer] = useState<{
    key: string
    status: PostKeepStatus | null
    sawItKept: boolean
  } | null>(null)
  const [people, setPeople] = useState<PeopleFace[]>([])
  const peopleRef = useRef(people)
  peopleRef.current = people

  useEffect(() => {
    if (!key) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let wasOnItsWay = false
    const controller = new AbortController()
    const ask = async () => {
      try {
        const res = await fetch(`/api/activity/processing/posts?posts=${encodeURIComponent(key)}`, {
          credentials: 'same-origin',
          cache: 'no-store',
          signal: controller.signal,
        })
        if (stopped) return
        if (!res.ok) {
          setAnswer({ key, status: null, sawItKept: false })
          return
        }
        const body = (await res.json()) as { posts?: PostKeepStatus[]; people?: PeopleFace[] }
        if (stopped) return
        const status = body.posts?.find((p) => `${p.platform}:${p.id}` === key) ?? null
        if (body.people && peopleRef.current.length === 0) setPeople(body.people)
        const moving = onItsWay(status)
        setAnswer({ key, status, sawItKept: wasOnItsWay && status?.state === 'kept' })
        wasOnItsWay = wasOnItsWay || moving
        if (moving) timer = setTimeout(() => void ask(), KEEP_POLL_MS)
      } catch {
        // Aborted: done. Offline while it was on its way: ask again shortly.
        if (!stopped && wasOnItsWay) timer = setTimeout(() => void ask(), KEEP_POLL_MS * 2)
      }
    }
    void ask()
    return () => {
      stopped = true
      controller.abort()
      if (timer) clearTimeout(timer)
    }
  }, [key])

  const current = answer && answer.key === key ? answer : null
  const status = current?.status ?? null
  return {
    status,
    people,
    justKept: isJustKept(status, current?.sawItKept ?? false),
  }
}
