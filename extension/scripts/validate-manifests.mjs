import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const GECKO_ADDON_ID = 'save-to-adhx@adhx.com'

const targets = [
  {
    name: 'Chromium',
    path: new URL('../dist/chrome/manifest.json', import.meta.url),
    validateBackground(background) {
      assert(
        typeof background.service_worker === 'string' && background.service_worker.length > 0,
        'Chromium background.service_worker must be a non-empty string',
      )
      assert(!('scripts' in background), 'Chromium background must not contain scripts')
    },
    validateBrowserSettings(manifest) {
      assert(
        !('browser_specific_settings' in manifest),
        'Chromium must not contain browser_specific_settings',
      )
    },
  },
  {
    name: 'Firefox',
    path: new URL('../dist/firefox/manifest.json', import.meta.url),
    validateBackground(background) {
      assert(
        Array.isArray(background.scripts) &&
          background.scripts.length > 0 &&
          background.scripts.every((script) => typeof script === 'string' && script.length > 0),
        'Firefox background.scripts must be a non-empty string array',
      )
      assert(
        !('service_worker' in background),
        'Firefox background must not contain service_worker',
      )
    },
    validateBrowserSettings(manifest) {
      assert(
        manifest.browser_specific_settings?.gecko?.id === GECKO_ADDON_ID,
        `Firefox browser_specific_settings.gecko.id must be ${GECKO_ADDON_ID}`,
      )
      assert(
        manifest.browser_specific_settings.gecko.strict_min_version === '140.0',
        'Firefox browser_specific_settings.gecko.strict_min_version must be 140.0',
      )
      assert(
        Array.isArray(
          manifest.browser_specific_settings?.gecko?.data_collection_permissions?.required,
        ) &&
          manifest.browser_specific_settings.gecko.data_collection_permissions.required.length ===
            1 &&
          manifest.browser_specific_settings.gecko.data_collection_permissions.required[0] ===
            'browsingActivity',
        'Firefox data_collection_permissions.required must be ["browsingActivity"]',
      )
    },
  },
]

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function readManifest(target) {
  const path = fileURLToPath(target.path)
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`Could not read ${target.name} manifest at ${path}`, { cause: error })
  }
}

for (const target of targets) {
  const manifest = readManifest(target)
  assert(manifest.manifest_version === 3, `${target.name} manifest_version must be 3`)
  assert(
    manifest.action && typeof manifest.action === 'object' && !Array.isArray(manifest.action),
    `${target.name} action must be present`,
  )
  assert(!('browser_action' in manifest), `${target.name} must not contain browser_action`)
  assert(
    manifest.commands?._execute_action &&
      typeof manifest.commands._execute_action === 'object' &&
      !Array.isArray(manifest.commands._execute_action),
    `${target.name} must define commands._execute_action`,
  )
  assert(
    !('_execute_browser_action' in (manifest.commands ?? {})),
    `${target.name} must not define commands._execute_browser_action`,
  )
  assert(
    manifest.background &&
      typeof manifest.background === 'object' &&
      !Array.isArray(manifest.background),
    `${target.name} background must be present`,
  )
  target.validateBackground(manifest.background)
  target.validateBrowserSettings(manifest)
  console.log(`Validated ${target.name} MV3 manifest`)
}
