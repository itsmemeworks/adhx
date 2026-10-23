/**
 * Counting how a video is watched, on the client (pure: no clock, no DOM, no
 * server imports). The iPhone (`apps/ios/App/Library/WatchTally.swift`) and
 * Android (`library/WatchTally.kt`) apps follow the same rules:
 *
 * - A **play** is a pass that starts at the top (or a loop round) and then
 *   really plays for a second (half the video when it's shorter). Picking up
 *   part-way, or scrubbing back, isn't a new play.
 * - A **finish** is reaching the end, once per pass; a native loop wrapping
 *   from the end to the top counts one too.
 * - **Seconds** are the position's forward steps while it plays, each at most
 *   `MAX_STEP_S` (a seek or a jump isn't watching).
 *
 * The caller feeds it the post on stage (`begin`), its position (`sample`)
 * and the end (`ended`); tallies collect per post until they're sent.
 */

export const PLAY_AFTER_S = 1
/** Within this of the top counts as starting there. */
export const START_S = 1.5
/** Within this of the end, a jump back to the top is a loop. */
export const END_S = 1.5
/** Longer steps are seeks, not watching. */
export const MAX_STEP_S = 2

export type Tally = { plays: number; finishes: number; seconds: number }

type Pass = { fromTop: boolean; counted: boolean; watched: number; finished: boolean }

export class WatchTracker {
  key: string | null = null
  private last: number | null = null
  private pass: Pass = { fromTop: false, counted: false, watched: 0, finished: false }
  /** Not sent yet, by post (`platform:id`). Seconds keep their fractions. */
  readonly tallies = new Map<string, Tally>()

  /** A post is on stage (null: nothing playing). Its first sample says where it starts. */
  begin(key: string | null): void {
    this.key = key
    this.last = null
    this.pass = { fromTop: false, counted: false, watched: 0, finished: false }
  }

  /** Where the video is now (seconds), and how long it is (0 when unknown). */
  sample(position: number, duration: number): void {
    const key = this.key
    if (!key || !Number.isFinite(position) || position < 0) return
    const last = this.last
    this.last = position
    if (last === null) {
      this.pass.fromTop = position < START_S
      return
    }
    const step = position - last
    if (step > 0 && step <= MAX_STEP_S) {
      this.add(key, { seconds: step })
      this.pass.watched += step
      const needed = duration > 0 ? Math.min(PLAY_AFTER_S, duration / 2) : PLAY_AFTER_S
      if (this.pass.fromTop && !this.pass.counted && this.pass.watched >= needed) {
        this.pass.counted = true
        this.add(key, { plays: 1 })
      }
      return
    }
    const wrapped =
      step < 0 &&
      position < START_S &&
      (this.pass.finished || (duration > 0 && last >= duration - END_S))
    if (wrapped) {
      if (!this.pass.finished) this.add(key, { finishes: 1 })
      this.pass = { fromTop: true, counted: false, watched: 0, finished: false }
    }
  }

  /** It played to the end. A replay from the top starts the next pass. */
  ended(): void {
    const key = this.key
    if (!key || this.pass.finished) return
    this.pass.finished = true
    this.add(key, { finishes: 1 })
  }

  private add(key: string, by: Partial<Tally>): void {
    const t = this.tallies.get(key) ?? { plays: 0, finishes: 0, seconds: 0 }
    t.plays += by.plays ?? 0
    t.finishes += by.finishes ?? 0
    t.seconds += by.seconds ?? 0
    this.tallies.set(key, t)
  }
}

export type WatchedPost = { platform: string; id: string } & Tally

/**
 * What's ready to send (at most `max` posts): plays, finishes and whole
 * seconds. The fractions of a second stay behind in `tallies`, so nothing is
 * lost to rounding.
 */
export function takeBatch(tallies: Map<string, Tally>, max = 50): WatchedPost[] {
  const out: WatchedPost[] = []
  for (const [key, t] of tallies) {
    if (out.length >= max) break
    const seconds = Math.floor(t.seconds)
    if (!t.plays && !t.finishes && !seconds) continue
    const at = key.indexOf(':')
    if (at <= 0) {
      tallies.delete(key)
      continue
    }
    out.push({
      platform: key.slice(0, at),
      id: key.slice(at + 1),
      plays: t.plays,
      finishes: t.finishes,
      seconds,
    })
    t.plays = 0
    t.finishes = 0
    t.seconds -= seconds
    if (t.seconds <= 0) tallies.delete(key)
  }
  return out
}

/** A batch didn't get through: add it back. */
export function putBack(tallies: Map<string, Tally>, batch: WatchedPost[]): void {
  for (const p of batch) {
    const key = `${p.platform}:${p.id}`
    const t = tallies.get(key) ?? { plays: 0, finishes: 0, seconds: 0 }
    t.plays += p.plays
    t.finishes += p.finishes
    t.seconds += p.seconds
    tallies.set(key, t)
  }
}
