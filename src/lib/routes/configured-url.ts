/**
 * The address set in the environment or given by the host. No database here:
 * the startup migration reads it too. `appUrl()` in `./app-url` adds the
 * address remembered at setup and the localhost fallback.
 */

export function cleanOrigin(raw: string | undefined | null): string | null {
  const value = raw?.trim()
  if (!value) return null
  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.origin
  } catch {
    return null
  }
}

/** The address set in the environment or given by the host, if any. */
export function configuredAppUrl(): string | null {
  const env = process.env
  return (
    cleanOrigin(env['NEXT_PUBLIC_APP_URL']) ??
    cleanOrigin(env['APP_URL']) ??
    cleanOrigin(env['RENDER_EXTERNAL_URL']) ??
    cleanOrigin(env['RAILWAY_PUBLIC_DOMAIN']) ??
    (env['FLY_APP_NAME'] ? cleanOrigin(`${env['FLY_APP_NAME']}.fly.dev`) : null) ??
    cleanOrigin(env['COOLIFY_URL']?.split(',')[0]) ??
    cleanOrigin(env['ZEABUR_WEB_URL'])
  )
}
