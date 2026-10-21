'use client'

import { useEffect, useRef } from 'react'
import type { FloatingReaction } from '../moments/LiveTogether'
import type { ReactionEmoji } from '@/lib/moments/reactions'

/**
 * Replaying the reactions kept on a post (members only): when a post settles
 * on screen, fetch what people left on it (`GET /api/posts/reactions`) and
 * float the newest few up the stage, oldest first, the way Live floats them.
 * Once per post per visit: the answer is kept for the session and a post that
 * already replayed doesn't replay again when you come back to it.
 */

/** At most this many float, the newest ones. */
export const REPLAY_MAX = 12
/** After the post settles. */
export const REPLAY_START_MS = 600
/** Between one and the next. */
export const REPLAY_GAP_MS = 350

/** A reaction as `GET /api/posts/reactions` returns it. */
export type StoredReaction = {
  id: string
  emoji: string | null
  text: string | null
  at: string
  saver: { username: string; name: string | null; avatarUrl: string | null; isYou: boolean }
}

type Memory = { fetched: Map<string, StoredReaction[]>; replayed: Set<string> }

const g = globalThis as unknown as { __adhxReactionReplay?: Memory }

function memory(): Memory {
  g.__adhxReactionReplay ??= { fetched: new Map(), replayed: new Set() }
  return g.__adhxReactionReplay
}

/** Test-only. */
export function __resetReactionReplay(): void {
  g.__adhxReactionReplay = undefined
}

export function toFloat(r: StoredReaction): FloatingReaction {
  return {
    id: r.id,
    saver: { ...r.saver, savedAt: r.at },
    ...(r.emoji ? { emoji: r.emoji as ReactionEmoji } : { text: r.text ?? '' }),
  }
}

/** What to float: the newest `max` not already on screen this visit, oldest first. */
export function replayPlan(
  reactions: readonly StoredReaction[],
  shown: (id: string) => boolean,
  max = REPLAY_MAX,
): StoredReaction[] {
  return reactions.filter((r) => (r.emoji || r.text) && !shown(r.id)).slice(-max)
}

export function useReactionReplay({
  enabled,
  platform,
  id,
  isShown,
  onFloat,
  onCancel,
}: {
  /** A signed-in member, with the post on screen. */
  enabled: boolean
  platform: string | null
  id: string | null
  /** Already floated this visit (a Live arrival, or yours). */
  isShown: (id: string) => boolean
  onFloat: (float: FloatingReaction) => void
  /** The post moved on: take these replayed ones off the stage. */
  onCancel: (ids: string[]) => void
}): void {
  const callbacks = useRef({ isShown, onFloat, onCancel })
  callbacks.current = { isShown, onFloat, onCancel }

  useEffect(() => {
    if (!enabled || !platform || !id) return
    const key = `${platform}:${id}`
    const mem = memory()
    if (mem.replayed.has(key)) return
    const settledAt = Date.now()
    const controller = new AbortController()
    const timers: ReturnType<typeof setTimeout>[] = []
    const floated: string[] = []

    const play = (reactions: readonly StoredReaction[]) => {
      if (controller.signal.aborted) return
      const plan = replayPlan(reactions, callbacks.current.isShown)
      if (plan.length === 0) {
        mem.replayed.add(key)
        return
      }
      const wait = Math.max(0, REPLAY_START_MS - (Date.now() - settledAt))
      plan.forEach((r, i) => {
        timers.push(
          setTimeout(
            () => {
              mem.replayed.add(key)
              floated.push(r.id)
              callbacks.current.onFloat(toFloat(r))
            },
            wait + i * REPLAY_GAP_MS,
          ),
        )
      })
    }

    const cached = mem.fetched.get(key)
    if (cached) {
      play(cached)
    } else {
      fetch(`/api/posts/reactions?${new URLSearchParams({ platform, id })}`, {
        credentials: 'same-origin',
        signal: controller.signal,
      })
        .then(async (response) => {
          // Not yet visible to you (a save still on its way) or a blip: ask again next visit.
          if (!response.ok) return
          const data = (await response.json().catch(() => null)) as {
            reactions?: StoredReaction[]
          } | null
          const list = Array.isArray(data?.reactions) ? data.reactions : []
          mem.fetched.set(key, list)
          play(list)
        })
        .catch(() => {})
    }

    return () => {
      controller.abort()
      for (const t of timers) clearTimeout(t)
      if (floated.length) callbacks.current.onCancel([...floated])
    }
  }, [enabled, platform, id])
}
