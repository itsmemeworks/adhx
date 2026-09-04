/** The viewer's last explicit Theater sound choice, shared by every same-origin tab. */
export const THEATER_SOUND_CHOICE_STORAGE_KEY = 'adhx-theater-sound'
export const THEATER_SOUND_DEFAULT_STORAGE_KEY = 'adhx-theater-sound-default'

export function parseStoredSoundPreference(value: string | null): boolean | null {
  if (value === 'on') return true
  if (value === 'off') return false
  return null
}

export function readStoredSoundPreference(storage: Storage, key: string): boolean | null {
  try {
    return parseStoredSoundPreference(storage.getItem(key))
  } catch {
    // Storage may be unavailable in private browsing.
  }
  return null
}

export function writeStoredSoundPreference(storage: Storage, key: string, soundOn: boolean): void {
  try {
    storage.setItem(key, soundOn ? 'on' : 'off')
  } catch {
    // Account persistence still works when browser storage is unavailable.
  }
}

export function removeStoredSoundPreference(storage: Storage, key: string): void {
  try {
    storage.removeItem(key)
  } catch {
    // Storage may be unavailable in private browsing.
  }
}
