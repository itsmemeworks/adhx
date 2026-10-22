'use client'

import { useState } from 'react'
import { usePreferences, FONT_OPTIONS, type BodyFont } from '@/lib/preferences-context'
import { cn } from '@/lib/utils'
import { IN_CARD, SettingRow, SettingsCard, Switch } from './parts'

const BIONIC_SAMPLE: [string, string][] = [
  ['Bo', 'lds the '],
  ['fi', 'rst '],
  ['pa', 'rt of '],
  ['ea', 'ch '],
  ['wo', 'rd to '],
  ['gui', 'de your '],
  ['ey', 'es.'],
]

/** Sound, Bionic Reading and the reading font. */
export function PreferencesCard() {
  const { preferences, updatePreference, loading } = usePreferences()
  const [soundSaving, setSoundSaving] = useState(false)

  const toggleSound = async () => {
    if (loading || soundSaving) return
    setSoundSaving(true)
    try {
      await updatePreference('soundOn', !preferences.soundOn)
    } finally {
      setSoundSaving(false)
    }
  }

  return (
    <SettingsCard id="preferences" title="Watching and reading">
      <SettingRow
        label="Sound on by default"
        hint="Start videos with sound when your browser allows it. Phones may still need one tap."
      >
        <Switch
          label="Sound on by default"
          checked={preferences.soundOn}
          onChange={() => void toggleSound()}
          disabled={loading || soundSaving}
          busy={soundSaving}
        />
      </SettingRow>

      <SettingRow
        label={
          <span className="flex flex-wrap items-center gap-2">
            <span>Bionic Reading</span>
            <span className="rounded-full bg-nx-accent/15 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.05em] text-nx-accent">
              ADHD mode
            </span>
          </span>
        }
        hint={
          <span>
            {BIONIC_SAMPLE.map(([bold, rest]) => (
              <span key={bold + rest}>
                <strong className="font-bold text-white/85">{bold}</strong>
                <span>{rest}</span>
              </span>
            ))}
          </span>
        }
      >
        <Switch
          label="Bionic reading"
          checked={preferences.bionicReading}
          onChange={() => updatePreference('bionicReading', !preferences.bionicReading)}
        />
      </SettingRow>

      <div className="flex flex-col gap-2.5">
        <span
          id="nx-font-label"
          className="text-xs font-bold uppercase tracking-[0.08em] text-white/45"
        >
          Reading font
        </span>
        <div
          role="radiogroup"
          aria-labelledby="nx-font-label"
          className="grid gap-2 sm:grid-cols-2"
        >
          {(
            Object.entries(FONT_OPTIONS) as [BodyFont, { name: string; description: string }][]
          ).map(([key, { name, description }]) => {
            const fontVar = `var(--font-${key})`
            const selected = preferences.bodyFont === key
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => updatePreference('bodyFont', key)}
                className={cn(
                  'flex min-h-[44px] items-center gap-3 border-[1.5px] px-4 py-3 text-left transition-colors',
                  IN_CARD,
                  selected
                    ? 'border-nx-accent bg-nx-accent/10'
                    : 'border-white/10 bg-black/40 hover:border-white/30',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2',
                    selected ? 'border-nx-accent' : 'border-white/40',
                  )}
                >
                  {selected && <span className="h-[9px] w-[9px] rounded-full bg-nx-accent" />}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-[15px] font-bold" style={{ fontFamily: fontVar }}>
                    {name}
                  </span>
                  <span className="text-xs text-white/55" style={{ fontFamily: fontVar }}>
                    {`The quick brown fox · ${description}`}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </SettingsCard>
  )
}
