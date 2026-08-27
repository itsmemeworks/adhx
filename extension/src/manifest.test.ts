import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

type Manifest = Record<string, unknown> & {
  action?: unknown
  background?: Record<string, unknown>
  commands?: Record<string, unknown>
  manifest_version?: unknown
}

const manifestPath = fileURLToPath(new URL('./manifest.json', import.meta.url))
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest
const GECKO_ADDON_ID = 'save-to-adhx@adhx.com'

describe('extension source manifest contract', () => {
  it('keeps both browser targets on Manifest V3 action semantics', () => {
    expect(manifest.manifest_version).toBe(3)
    expect(manifest.action).toBeTypeOf('object')
    expect(Object.keys(manifest).filter((key) => key.endsWith('manifest_version'))).toEqual([
      'manifest_version',
    ])
    expect(Object.keys(manifest).filter((key) => key.endsWith('browser_action'))).toEqual([])
  })

  it('uses the Manifest V3 action command', () => {
    expect(manifest.commands).toHaveProperty('_execute_action')
    expect(manifest.commands).not.toHaveProperty('_execute_browser_action')
  })

  it('declares each target background in its supported shape', () => {
    expect(manifest.background).toEqual({
      'chromium:service_worker': 'background.ts',
      'firefox:scripts': ['background.ts'],
    })
  })

  it('declares the exact Firefox-only AMO identity and privacy contract', () => {
    expect(manifest).not.toHaveProperty('browser_specific_settings')
    expect(manifest['firefox:browser_specific_settings']).toEqual({
      gecko: {
        id: GECKO_ADDON_ID,
        strict_min_version: '140.0',
        data_collection_permissions: {
          required: ['browsingActivity'],
        },
      },
    })
  })
})
