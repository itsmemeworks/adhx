/**
 * Theater persistence catalog.
 *
 * localStorage lasts across visits (seen list, repeat, queue types).
 * sessionStorage is this tab only — mute follows a paste navigation, Saved
 * cursor survives a /live ⇄ /saved remount, neither should leak to a new
 * device or a later week.
 */

export { LIVE_REPEAT_STORAGE_KEY, SAVED_REPEAT_STORAGE_KEY } from './types'
export { SEEN_STORAGE_KEY, LAST_VISIT_STORAGE_KEY } from './useSeenSet'
export { SAVED_PLAYING_STORAGE_KEY } from '@/lib/theater/saved-playing'

/** sessionStorage: 'on' | 'off'. Survives location.assign paste-to-preview. */
export const THEATER_SOUND_STORAGE_KEY = 'adhx-theater-sound'

/** localStorage JSON ContentType[]. Empty / missing = All. */
export const THEATER_QUEUE_TYPES_STORAGE_KEY = 'adhx-theater-types'

/** Retired Videos+Photos flag — migrated once into THEATER_QUEUE_TYPES_STORAGE_KEY. */
export const THEATER_QUEUE_TYPES_LEGACY_VISUAL = 'adhx-theater-visual'
