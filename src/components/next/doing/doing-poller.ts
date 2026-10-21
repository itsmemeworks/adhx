import type { DoingItem, DoingScope, DoingSummary } from './useDoing'

export type DoingSnapshot = {
  items: DoingItem[] | null
  summary: DoingSummary | null
  error: string | null
}
const empty = (): DoingSnapshot => ({ items: null, summary: null, error: null })
type Subscriber = { notify: (state: DoingSnapshot) => void; everyMs: number; summaryOnly: boolean }
const polls = new Map<string, DoingPoll>()

/** One foreground request/clock per account and scope, shared by every pill,
 * sheet and page. The last subscriber destroys both its data and its clock. */
class DoingPoll {
  subscribers = new Set<Subscriber>()
  snapshot = empty()
  timer: ReturnType<typeof setTimeout> | null = null
  request: AbortController | null = null
  refreshAfter = false

  constructor(
    readonly key: string,
    readonly scope: DoingScope,
  ) {}

  get full() {
    return [...this.subscribers].some((s) => !s.summaryOnly)
  }

  publish(value: DoingSnapshot) {
    this.snapshot = value
    for (const s of this.subscribers) s.notify(value)
  }

  stop = () => {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    this.request?.abort()
    this.request = null
  }

  visible = () => {
    if (document.hidden) this.stop()
    else void this.load()
  }

  async load(force = false) {
    if (!this.subscribers.size || document.hidden) return
    if (this.request) {
      this.refreshAfter ||= force
      return
    }
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    const controller = new AbortController()
    this.request = controller
    const full = this.full
    let denied = false
    try {
      const qs = new URLSearchParams({ scope: this.scope, ...(!full ? { summary: '1' } : {}) })
      const response = await fetch(`/api/activity/processing?${qs}`, {
        cache: 'no-store',
        credentials: 'same-origin',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
      })
      denied = response.status === 401 || response.status === 403
      if (!response.ok) throw new Error('Couldn’t update progress. Trying again shortly.')
      const data = (await response.json()) as { items?: DoingItem[]; summary: DoingSummary }
      if (controller.signal.aborted || this.request !== controller) return
      this.publish({ items: data.items ?? this.snapshot.items, summary: data.summary, error: null })
    } catch {
      if (controller.signal.aborted || this.request !== controller) return
      this.publish({
        ...(denied ? empty() : this.snapshot),
        error: denied
          ? 'Sign in again to see progress.'
          : 'Couldn’t update progress. Trying again shortly.',
      })
    } finally {
      if (this.request === controller) {
        this.request = null
        if (this.subscribers.size && !document.hidden && !denied) {
          const soon = this.refreshAfter || (!full && this.full)
          this.refreshAfter = false
          const interval = Math.min(...[...this.subscribers].map((s) => s.everyMs))
          this.timer = setTimeout(() => void this.load(), soon ? 0 : interval)
        }
      }
    }
  }
}

export function followDoing(
  account: string,
  scope: DoingScope,
  subscriber: Subscriber,
): { refresh: () => void; leave: () => void } {
  const key = `${account}|${scope}`
  let poll = polls.get(key)
  if (!poll) {
    poll = new DoingPoll(key, scope)
    polls.set(key, poll)
    document.addEventListener('visibilitychange', poll.visible)
    window.addEventListener('online', poll.visible)
  }
  const first = poll.subscribers.size === 0
  const neededDetails = !poll.full && !subscriber.summaryOnly
  poll.subscribers.add(subscriber)
  subscriber.notify(poll.snapshot)
  if (first || neededDetails) void poll.load(neededDetails)
  const current = poll
  return {
    refresh: () => void current.load(true),
    leave: () => {
      current.subscribers.delete(subscriber)
      if (current.subscribers.size) return
      current.stop()
      document.removeEventListener('visibilitychange', current.visible)
      window.removeEventListener('online', current.visible)
      polls.delete(key)
    },
  }
}
