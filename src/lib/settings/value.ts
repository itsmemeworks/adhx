/**
 * The value of a setting an admin can change from Admin → System: the one
 * saved there, else the environment's, else null (the caller's default).
 *
 * This module never touches the database. A process that has one (the web
 * server, the understanding worker) installs a reader by importing
 * `@/lib/settings/extras`; everything else (the Mac helper, scripts, tests
 * that don't care) sees only the environment.
 */

type StoredReader = () => ReadonlyMap<string, string>

const g = globalThis as unknown as { __adhxStoredSettings?: StoredReader }

export function installStoredSettings(reader: StoredReader): void {
  g.__adhxStoredSettings = reader
}

export function storedSetting(name: string): string | null {
  try {
    return g.__adhxStoredSettings?.().get(name) ?? null
  } catch {
    return null
  }
}

export function envSetting(name: string): string | null {
  const v = process.env[name]?.trim()
  return v ? v : null
}

export function setting(name: string): string | null {
  return storedSetting(name) ?? envSetting(name)
}

/** A flag that's on unless set to off, 0 or false. */
export function settingOff(name: string): boolean {
  const v = setting(name)?.toLowerCase()
  return v === 'off' || v === '0' || v === 'false'
}
