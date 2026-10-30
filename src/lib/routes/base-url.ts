import { cleanOrigin } from './configured-url'

/**
 * This ADHX's address as compiled into the client bundle: `NEXT_PUBLIC_APP_URL`
 * when the app was built with it, else empty. Client code only, and only as a
 * fallback before `window.location` is known. A prebuilt image (Docker) has no
 * address compiled in, so this is usually empty; never fall back to adhx.com.
 *
 * Server code uses `appUrl()` from `./app-url`, read per request.
 */
export const PUBLIC_BASE_URL = cleanOrigin(process.env.NEXT_PUBLIC_APP_URL) ?? ''

/** The host of `PUBLIC_BASE_URL`, e.g. `adhx.example.com`, or empty. */
export const PUBLIC_HOST = PUBLIC_BASE_URL ? new URL(PUBLIC_BASE_URL).host : ''
