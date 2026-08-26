import { theaterItemKey, type RepeatMode, type TheaterItem } from './types'
import { computeQueueCounts } from './theater-math'

const EMPTY_KEY_SET: ReadonlySet<string> = new Set()

export interface TheaterChromeInput {
  isCollectionTab: boolean
  personalFinished: boolean
  collectionStageTheaterItem: TheaterItem | null
  waiting: boolean
  current: TheaterItem | null
  personalDisplayItems: TheaterItem[]
  /** Repeat-off Queue list (playable + Seen). Defaults to personalDisplayItems. */
  personalQueueItems?: TheaterItem[]
  displayItems: TheaterItem[]
  /** Repeat-off Queue list (playable + Seen). Defaults to displayItems. */
  queueItems?: TheaterItem[]
  currentKey: string | null
  personalIsSeen: (key: string) => boolean
  isSeen: (key: string) => boolean
  seenReady: boolean
  freshKeys: ReadonlySet<string>
  /** Session prepends on Saved — clay accent. */
  personalFreshKeys?: ReadonlySet<string>
  newCount: number
  unseenCount: number
  effectiveRepeatMode: RepeatMode
  personalIndex: number
  canPrev: boolean
  canNext: boolean
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
  /** First Seen row. `-1` when Repeat is on or nothing has been watched. */
  seenStartIndex: number
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

  const playableItems = input.isCollectionTab ? input.personalDisplayItems : input.displayItems
  const listedItems = input.isCollectionTab
    ? (input.personalQueueItems ?? playableItems)
    : (input.queueItems ?? playableItems)
  const seenStartIndex = listedItems.length > playableItems.length ? playableItems.length : -1

  const queueCount = computeQueueCounts({
    length: playableItems.length,
    unseenCount: input.isCollectionTab ? playableItems.length : input.unseenCount,
    repeatMode: input.effectiveRepeatMode,
  })

  return {
    chromeCurrent,
    chromeItems: listedItems,
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
    seenStartIndex,
  }
}
