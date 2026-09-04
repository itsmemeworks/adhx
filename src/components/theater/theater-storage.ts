/**
 * Theater persistence catalog.
 *
 * localStorage lasts across visits (seen list, repeat, queue types, and the
 * viewer's last sound choice). Saved cursor state remains tab-scoped.
 */

export { LIVE_REPEAT_STORAGE_KEY, SAVED_REPEAT_STORAGE_KEY } from './types'
export { SEEN_STORAGE_KEY, LAST_VISIT_STORAGE_KEY } from './useSeenSet'
export { SAVED_PLAYING_STORAGE_KEY, SAVED_PLAYED_STORAGE_KEY } from '@/lib/theater/saved-playing'
export {
  THEATER_SOUND_CHOICE_STORAGE_KEY as THEATER_SOUND_STORAGE_KEY,
  THEATER_SOUND_DEFAULT_STORAGE_KEY,
} from '@/lib/theater/sound-preference'

/** localStorage JSON ContentType[]. Empty / missing = All. */
export const THEATER_QUEUE_TYPES_STORAGE_KEY = 'adhx-theater-types'

/** Retired Videos+Photos flag — migrated once into THEATER_QUEUE_TYPES_STORAGE_KEY. */
export const THEATER_QUEUE_TYPES_LEGACY_VISUAL = 'adhx-theater-visual'
