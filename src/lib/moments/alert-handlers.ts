import { captureException } from '@/lib/sentry'
import {
  listAlerts,
  markAlertsSeen,
  parseSeenIds,
  subscribeForming,
  unsubscribeForming,
} from './alerts'
import { hasForming } from './engine'

/**
 * "Tell me when it's live", shared by the web (`/api/moments/…`, session) and
 * the phone (`/api/app/live/forming/…`, `/api/app/alerts…`, phone key).
 */
export type AlertResult = { status: number; body: unknown }

const FORMING_ID = /^f[a-z0-9-]{1,40}$/

function fail(status: number, code: string, error: string): AlertResult {
  return { status, body: { error, code } }
}

/** PUT (on) / DELETE (off) the bell on a forming group → `{ alert }`. */
export async function setFormingAlert(
  userId: string,
  id: string,
  on: boolean,
): Promise<AlertResult> {
  if (!FORMING_ID.test(id)) return fail(404, 'forming_gone', 'That group isn’t forming any more.')
  try {
    if (!on) {
      unsubscribeForming(userId, id)
      return { status: 200, body: { alert: false } }
    }
    if (!(await hasForming(id))) {
      return fail(404, 'forming_gone', 'That group isn’t forming any more.')
    }
    subscribeForming(userId, id)
    return { status: 200, body: { alert: true } }
  } catch (error) {
    captureException(error, { endpoint: 'moments.forming.alert' })
    return fail(500, 'failed', 'That didn’t save just now. Try again.')
  }
}

/** GET → `{ alerts: [{ id, slug, title, at }] }`, unseen, newest first. */
export function getAlerts(userId: string): AlertResult {
  try {
    return { status: 200, body: { alerts: listAlerts(userId) } }
  } catch (error) {
    captureException(error, { endpoint: 'moments.alerts' })
    return fail(500, 'failed', 'That didn’t load just now. Try again.')
  }
}

/** POST `{ ids }` → `{ ok: true }`. */
export function postAlertsSeen(userId: string, body: unknown): AlertResult {
  const ids = parseSeenIds(body)
  if (!Array.isArray(ids)) return fail(400, 'bad_request', ids.error)
  try {
    markAlertsSeen(userId, ids)
    return { status: 200, body: { ok: true } }
  } catch (error) {
    captureException(error, { endpoint: 'moments.alerts.seen' })
    return fail(500, 'failed', 'That didn’t save just now. Try again.')
  }
}
