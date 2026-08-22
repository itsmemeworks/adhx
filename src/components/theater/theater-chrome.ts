import { theaterItemKey, type RepeatMode, type TheaterItem } from './types'
import { computeQueueTotal } from './theater-math'

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
  newCount: number
  currentIndex: number
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

  return {
    chromeCurrent,
    chromeItems: input.isCollectionTab ? input.personalDisplayItems : input.displayItems,
    chromeCurrentKey,
    chromeIsSeen: input.isCollectionTab ? input.personalIsSeen : input.isSeen,
    chromeSeenReady: input.isCollectionTab ? true : input.seenReady,
    chromeFreshKeys: input.isCollectionTab ? EMPTY_KEY_SET : input.freshKeys,
    chromeNewCount: input.isCollectionTab ? 0 : input.newCount,
    queueTotal: input.isCollectionTab
      ? computeQueueTotal({
          index: input.personalIndex,
          length: input.personalDisplayItems.length,
          unseenCount: Math.max(0, input.personalDisplayItems.length - input.personalIndex),
          repeatMode: input.effectiveRepeatMode,
        })
      : computeQueueTotal({
          index: input.currentIndex,
          length: input.displayItems.length,
          unseenCount: input.unseenCount,
          repeatMode: input.effectiveRepeatMode,
        }),
    chromeCanPrev: input.isCollectionTab ? input.personalIndex > 0 : input.canPrev,
    chromeCanNext: input.isCollectionTab ? !input.personalFinished : input.canNext,
  }
}
