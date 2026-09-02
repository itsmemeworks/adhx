export const THEATER_SOUND_SESSION_STORAGE_KEY = 'adhx-theater-sound'
export const THEATER_SOUND_DEFAULT_STORAGE_KEY = 'adhx-theater-sound-default'

export function readStoredSoundPreference(storage: Storage, key: string): boolean | null {
  try {
    const value = storage.getItem(key)
    if (value === 'on') return true
    if (value === 'off') return false
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
