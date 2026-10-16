import { cookies } from 'next/headers'
import { NEXT_UI_COOKIE, NEXT_UI_PARAM, parseFlagValue, resolveNextUi } from './flag'

type SearchParamsLike =
  URLSearchParams | Record<string, string | string[] | undefined> | null | undefined

function queryValue(searchParams: SearchParamsLike): string | null {
  if (!searchParams) return null
  if (searchParams instanceof URLSearchParams) return searchParams.get(NEXT_UI_PARAM)
  const raw = searchParams[NEXT_UI_PARAM]
  return Array.isArray(raw) ? (raw[0] ?? null) : (raw ?? null)
}

/**
 * Server-side `next_ui` check for pages, layouts and route handlers.
 * Pass the page's (awaited) `searchParams` so `?next_ui=1` works on the very
 * first request; otherwise the cookie mirror of the browser override and then
 * `NEXT_PUBLIC_NEXT_UI` decide.
 */
export async function isNextUiEnabled(searchParams?: SearchParamsLike): Promise<boolean> {
  // Emergency switch: read at runtime (not inlined), so `fly secrets set
  // NEXT_UI_FORCE=off` rolls everyone back without a rebuild.
  const forced = parseFlagValue(process.env['NEXT_UI_FORCE'])
  if (forced !== null) return forced
  let stored: string | null = null
  try {
    stored = (await cookies()).get(NEXT_UI_COOKIE)?.value ?? null
  } catch {
    // Outside a request scope (build, tests): fall through to env.
    stored = null
  }
  return resolveNextUi({ query: queryValue(searchParams), stored })
}
