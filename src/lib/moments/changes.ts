import { savePrivacyFingerprint } from '@/lib/bookmarks/privacy'
import { captureException } from '@/lib/sentry'

/** One cheap durable-revision read for all connected phones, including writes
 * made by a worker/another process. Never send the revision or private keys. */
type State = { listeners: Set<() => void>; timer?: ReturnType<typeof setInterval>; last: string }
const g = globalThis as unknown as { __adhxLiveChanges?: State }
export function onLiveChange(listener: () => void): () => void {
  const s = (g.__adhxLiveChanges ??= { listeners: new Set(), last: savePrivacyFingerprint() })
  s.listeners.add(listener)
  if (!s.timer) {
    s.last = savePrivacyFingerprint()
    s.timer = setInterval(() => {
      try {
        const next = savePrivacyFingerprint()
        if (next === s.last) return
        s.last = next
        for (const notify of [...s.listeners]) notify()
      } catch (error) {
        captureException(error, { endpoint: 'moments.changes' })
      }
    }, 3_000)
    s.timer.unref?.()
  }
  return () => {
    s.listeners.delete(listener)
    if (!s.listeners.size) {
      clearInterval(s.timer)
      s.timer = undefined
    }
  }
}
