/**
 * Demo mode (`DEMO_MODE=1`): a public ADHX anyone can look around without an
 * account. Every visitor is the demo person (`DEMO_USER`, default `sam`) and
 * nothing can be changed: no saves, reactions, invites, sign-ins or settings.
 * A public server that saved any pasted link would download anyone's videos
 * for anyone, so a small gate in front of the app (`deploy/demo/gate.ts`)
 * refuses every request that could change something, before Next sees it.
 * `deploy/demo/` builds the image; the world is reseeded every day.
 *
 * No database here: the gate imports it.
 */

export const DEMO_HEADER = 'x-adhx-demo'

export function demoMode(): boolean {
  return process.env['DEMO_MODE'] === '1'
}

/** Reading only. Anything else is a change, and a demo refuses it. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** GETs that would start something: X sign-in and bookmark sync. */
const BLOCKED_GETS = [/^\/api\/auth\/twitter(\/|$)/, /^\/api\/sync(\/|$)/, /^\/invite\//]

export function demoRefuses(method: string, pathname: string): boolean {
  if (!SAFE_METHODS.has(method.toUpperCase())) return true
  return BLOCKED_GETS.some((pattern) => pattern.test(pathname))
}

export const DEMO_REFUSAL =
  'This is the ADHX demo, so saving and changes are off. Run your own to keep things.'
