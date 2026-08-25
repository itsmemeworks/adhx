import { theaterItemKey, type RepeatMode, type TheaterItem } from './types'
import { computeQueueCounts, countPlayedThisRun, liveQueueTreatAsUnseen } from './theater-math'

const EMPTY_KEY_SET: ReadonlySet<string> = new Set()

export interface TheaterChromeInput {
  isCollectionTab: boolean
  personalFinished: boolean
  collectionStageTheaterItem: TheaterItem | null
  waiting: boolean
  current: TheaterItem | null
  personalDisplayItems: TheaterItem[]
  displayItems: TheaterItem[]
  currentKey: string | null
  personalIsSeen: (key: string) => boolean
  isSeen: (key: string) => boolean
  seenReady: boolean
  freshKeys: ReadonlySet<string>
  /** Session prepends on Saved — clay accent, not Live grouping. */
  personalFreshKeys?: ReadonlySet<string>
  newCount: number
  currentIndex: number
  unseenCount: number
  effectiveRepeatMode: RepeatMode
  personalIndex: number
  canPrev: boolean
  canNext: boolean
  /** Arrival snapshot — headings / grouping. Not leftover-run math. */
  wasSeenOnEntry?: (key: string) => boolean
  /** Keys already seen when this leftover run began (last caught-up). */
  wasSeenBeforeLeftoverRun?: (key: string) => boolean
  rewatching?: boolean
  sharedItemKey?: string | null
}

export interface TheaterChromeModel {
  chromeCurrent: TheaterItem | null
  chromeItems: TheaterItem[]
  chromeCurrentKey: string | null
  chromeIsSeen: (key: string) => boolean
  chromeSeenReady: boolean
  chromeFreshKeys: ReadonlySet<string>
  chromeNewCount: number
  queueTotal: number | undefined
  queuePlayed: number | undefined
  queueToPlay: number | undefined
  queueLooping: boolean | undefined
  chromeCanPrev: boolean
  chromeCanNext: boolean
}

/**
 * One place the desktop + mobile chromes read from. Collection tab vs live
 * pulse pick different lists; the chromes stay mode-agnostic.
 */
export function resolveTheaterChrome(input: TheaterChromeInput): TheaterChromeModel {
  const chromeCurrent: TheaterItem | null = input.isCollectionTab
    ? input.personalFinished
      ? null
      : input.collectionStageTheaterItem
    : input.waiting
      ? null
      : input.current

  const chromeCurrentKey = input.isCollectionTab
    ? chromeCurrent
      ? theaterItemKey(chromeCurrent)
      : null
    : input.currentKey

  // Saved one-pass is the 1-based now-playing index (`2 of 92`). Live
  // leftover is played of the pending run (`16 of 23`), not a playlist
  // index. Keep playing is the pile (`23 on repeat`). Repeat this post
  // is `1 on repeat`.
  // Headings keep `wasSeenOnEntry`. Counts use the leftover-run snapshot
  // when it exists, unioned with entry so the first paint (empty run set)
  // still hides last-visit watches.
  const leftoverSeenBase =
    input.wasSeenOnEntry || input.wasSeenBeforeLeftoverRun
      ? (key: string) =>
          Boolean(input.wasSeenOnEntry?.(key) || input.wasSeenBeforeLeftoverRun?.(key))
      : undefined
  const leftoverSeen = leftoverSeenBase
    ? (key: string) => liveQueueTreatAsUnseen(key, input.sharedItemKey, leftoverSeenBase)
    : undefined
  const livePlayed =
    !input.isCollectionTab && !input.rewatching && input.effectiveRepeatMode === 'off'
      ? leftoverSeen
        ? countPlayedThisRun(input.displayItems, {
            currentKey: input.currentKey,
            remaining: input.unseenCount,
            currentIndex: input.currentIndex,
            wasSeenOnEntry: leftoverSeen,
            isFresh: (key) => input.freshKeys.has(key),
            isSeen: input.isSeen,
          })
        : 0
      : undefined
  const queueCount = input.isCollectionTab
    ? computeQueueCounts({
        index: input.personalIndex,
        length: input.personalDisplayItems.length,
        unseenCount: input.personalDisplayItems.length,
        repeatMode: input.effectiveRepeatMode,
        listWalk: true,
      })
    : computeQueueCounts({
        index: input.currentIndex,
        length: input.displayItems.length,
        unseenCount: input.unseenCount,
        repeatMode: input.effectiveRepeatMode,
        listWalk: input.rewatching === true,
        played: livePlayed,
      })

  return {
    chromeCurrent,
    chromeItems: input.isCollectionTab ? input.personalDisplayItems : input.displayItems,
    chromeCurrentKey,
    chromeIsSeen: input.isCollectionTab ? input.personalIsSeen : input.isSeen,
    chromeSeenReady: input.isCollectionTab ? true : input.seenReady,
    chromeFreshKeys: input.isCollectionTab
      ? (input.personalFreshKeys ?? EMPTY_KEY_SET)
      : input.freshKeys,
    chromeNewCount: input.isCollectionTab ? 0 : input.newCount,
    queueTotal: queueCount.length,
    queuePlayed: queueCount.played,
    queueToPlay: queueCount.toPlay,
    queueLooping: queueCount.looping,
    chromeCanPrev: input.isCollectionTab ? input.personalIndex > 0 : input.canPrev,
    chromeCanNext: input.isCollectionTab ? !input.personalFinished : input.canNext,
  }
}
