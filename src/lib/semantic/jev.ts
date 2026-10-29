/**
 * Minimal client for Jev (TypeSafe's decision model). One POST with a state
 * object and named questions; each answer comes back under its question id.
 * Callers send only public post content and the viewer's own query — never
 * tags or anything about who saved a post — and treat any failure as "no
 * answer" (Jev only ever refines; it is never required).
 */

import { trackServiceCall } from '@/lib/ops/service-calls'
import { extra } from '@/lib/settings/extras'

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone'

export type JevQuestion =
  | { type: 'score'; instructions: string; criteria: string[] }
  | { type: 'choice'; instructions: string; criteria: Record<string, string> }

export interface JevAnswer {
  type?: string
  score?: number
  choice?: string
  confidence?: number
  probabilities?: Record<string, number>
}

export function jevAvailable(): boolean {
  return Boolean(extra('TYPESAFE_API_KEY'))
}

/**
 * Half an emoji (a lone surrogate) makes Jev reject the whole request.
 * JSON.stringify escapes one rather than removing it, so every string is
 * repaired before serialising.
 */
function wellFormedJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => (typeof v === 'string' ? v.toWellFormed() : v))
}

export async function askJev(
  state: Record<string, unknown>,
  questions: Record<string, JevQuestion>,
  timeoutMs: number,
  /** What the answer is for, as the admin System page lists it. */
  purpose = 'other',
): Promise<Record<string, JevAnswer>> {
  return trackServiceCall('jev', purpose, () => ask(state, questions, timeoutMs))
}

async function ask(
  state: Record<string, unknown>,
  questions: Record<string, JevQuestion>,
  timeoutMs: number,
): Promise<Record<string, JevAnswer>> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${extra('TYPESAFE_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: wellFormedJson({ model: 'jev-latest', state, questions }),
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'error',
  })
  if (!response.ok) throw new Error(`Jev returned ${response.status}`)
  const body = (await response.json()) as { answers?: Record<string, JevAnswer> }
  return body.answers ?? {}
}
