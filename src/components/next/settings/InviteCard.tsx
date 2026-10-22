'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Check, Copy, Link2, Share2, X } from 'lucide-react'
import { IN_CARD, INPUT, PRIMARY, SECONDARY, SettingsCard } from './parts'

export interface PendingInvite {
  id: string
  /** Short, non-secret code from the invite's id (never the link). */
  code?: string
  createdAt: string
  expiresAt: string
  nameHint: string | null
  createdBy: string
  /** The maker's display name, when set. */
  createdByName?: string | null
  mine: boolean
}

export interface MadeInvite {
  id: string
  url: string
  expiresAt: string
  nameHint: string | null
}

export function daysLeft(expiresAt: string, now = Date.now()): string {
  const hours = (Date.parse(expiresAt) - now) / 3_600_000
  if (hours >= 36) return `${Math.round(hours / 24)} days left`
  if (hours >= 23.5) return '1 day left'
  const rounded = Math.max(1, Math.round(hours))
  return rounded === 1 ? 'about an hour left' : `${rounded} hours left`
}

/**
 * Making, sharing and revoking invite links (`/api/invites`). Shared by
 * Settings → Invite someone and the admin page. A link is only shown when
 * it's made: the server keeps just its hash.
 */
export function useInvites() {
  const [canInvite, setCanInvite] = useState<boolean | null>(null)
  const [invites, setInvites] = useState<PendingInvite[]>([])
  const [made, setMade] = useState<MadeInvite | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [canShare, setCanShare] = useState(false)
  /** Links made (or renewed) in this visit, by invite id: the only ones that can be copied as they are. */
  const [links, setLinks] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/invites', { cache: 'no-store' })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setCanInvite(!!data.canInvite)
      setInvites(Array.isArray(data.invites) ? data.invites : [])
    } catch {
      setCanInvite((c) => c ?? false)
    }
  }, [])

  useEffect(() => {
    void load()
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function')
  }, [load])

  async function create(nameHint: string) {
    setBusy(true)
    setError(null)
    setCopied(false)
    try {
      const res = await fetch('/api/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nameHint: nameHint.trim() || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || typeof data.url !== 'string') {
        setError(data.error || 'Couldn’t make an invite. Try again.')
        return false
      }
      setLinks((l) => ({ ...l, [data.id]: data.url }))
      setMade({
        id: data.id,
        url: data.url,
        expiresAt: data.expiresAt,
        nameHint: nameHint.trim() || null,
      })
      await load()
      return true
    } catch {
      setError('Couldn’t make an invite. Try again.')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    if (!made) return
    try {
      await navigator.clipboard.writeText(made.url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // The link is selectable.
    }
  }

  async function share() {
    if (!made) return
    try {
      await navigator.share({
        title: 'Join our ADHX',
        text: 'You’re invited to our ADHX. Pick a name and you’re in.',
        url: made.url,
      })
    } catch {
      // Cancelled, or the sheet isn't available.
    }
  }

  /**
   * Copy an invite's link. A link is only known when it's made (the server
   * keeps its hash), so an older invite gets a fresh link after asking: the
   * one sent before stops working. Returns what happened, for the row to say.
   */
  async function copyLink(
    invite: PendingInvite,
  ): Promise<'copied' | 'renewed' | 'cancelled' | 'failed'> {
    setError(null)
    let url = links[invite.id]
    let renewed = false
    if (!url) {
      if (
        !window.confirm(
          'Invite links are shown once, when they’re made. Get a new link for this invite? The one you sent before stops working.',
        )
      )
        return 'cancelled'
      const res = await fetch(`/api/invites/${encodeURIComponent(invite.id)}/link`, {
        method: 'POST',
      }).catch(() => null)
      const data = res?.ok ? ((await res.json()) as { url?: string }) : null
      if (!data?.url) {
        setError('Couldn’t get a new link for that invite. Try again.')
        await load()
        return 'failed'
      }
      url = data.url
      renewed = true
      setLinks((l) => ({ ...l, [invite.id]: data.url! }))
    }
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      window.prompt('Copy this link', url)
    }
    return renewed ? 'renewed' : 'copied'
  }

  async function revoke(invite: PendingInvite) {
    const who = invite.nameHint ? ` for ${invite.nameHint}` : ''
    if (!window.confirm(`Revoke the invite${who}? The link will stop working.`)) return
    setError(null)
    const res = await fetch(`/api/invites/${encodeURIComponent(invite.id)}`, {
      method: 'DELETE',
    }).catch(() => null)
    if (!res?.ok) setError('Couldn’t revoke that invite. Try again.')
    if (made?.id === invite.id) setMade(null)
    await load()
  }

  return {
    canInvite,
    invites,
    made,
    busy,
    error,
    copied,
    canShare,
    create,
    copy,
    share,
    revoke,
    copyLink,
    dismiss: () => setMade(null),
  }
}

/** Settings → Invite someone. Hidden when you can't invite and have none waiting. */
export function InviteCard() {
  const inv = useInvites()
  const [nameHint, setNameHint] = useState('')

  if (inv.canInvite === null) return null
  if (!inv.canInvite && inv.invites.length === 0) return null

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (await inv.create(nameHint)) setNameHint('')
  }

  return (
    <SettingsCard
      id="invite"
      title="Invite someone"
      sub="One link, one person. They pick a name and they’re in, no email needed. Works once, for 7 days."
    >
      {inv.canInvite && (
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-2.5 sm:flex-row">
          <input
            type="text"
            aria-label="Who’s it for? (optional)"
            placeholder="Who’s it for? (optional)"
            value={nameHint}
            maxLength={40}
            onChange={(e) => setNameHint(e.target.value)}
            className={INPUT}
          />
          <button type="submit" disabled={inv.busy} className={`${PRIMARY} shrink-0`}>
            <Link2 aria-hidden className="h-[18px] w-[18px]" />
            <span>{inv.busy ? 'Making…' : 'Make an invite link'}</span>
          </button>
        </form>
      )}

      {inv.made && (
        <div className={`flex flex-col gap-2.5 bg-black/40 p-4 ${IN_CARD}`}>
          <span className="text-[13px] text-white/65">
            {inv.made.nameHint
              ? `For ${inv.made.nameHint}. Send it to them; it’s shown only this once.`
              : 'Send it to them; it’s shown only this once.'}
          </span>
          <code className="block select-all break-all rounded-[8px] bg-black px-3 py-2.5 font-mono text-[13px] text-nx-cream">
            {inv.made.url}
          </code>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void inv.copy()} className={SECONDARY}>
              {inv.copied ? (
                <Check aria-hidden className="h-4 w-4" />
              ) : (
                <Copy aria-hidden className="h-4 w-4" />
              )}
              <span>{inv.copied ? 'Copied' : 'Copy link'}</span>
            </button>
            {inv.canShare && (
              <button type="button" onClick={() => void inv.share()} className={SECONDARY}>
                <Share2 aria-hidden className="h-4 w-4" />
                <span>Share…</span>
              </button>
            )}
            <button type="button" onClick={inv.dismiss} className={SECONDARY}>
              Done
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-xs font-bold uppercase tracking-[0.08em] text-white/55">
          Waiting to be used
        </span>
        {inv.invites.length === 0 ? (
          <span className="text-[13px] text-white/55">None right now.</span>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {inv.invites.map((invite) => (
              <li
                key={invite.id}
                className={`flex items-center gap-3 bg-black/40 px-4 py-3 text-sm ${IN_CARD}`}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-bold">
                    {invite.nameHint ? `For ${invite.nameHint}` : 'Invite link'}
                  </span>
                  <span className="text-xs text-white/55">
                    {`${invite.mine ? '' : `From @${invite.createdBy} · `}${daysLeft(invite.expiresAt)}`}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => void inv.revoke(invite)}
                  className={SECONDARY}
                  aria-label={`Revoke ${invite.nameHint ? `the invite for ${invite.nameHint}` : 'this invite'}`}
                >
                  <X aria-hidden className="h-4 w-4" />
                  <span>Revoke</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {inv.error && (
        <p role="alert" className="m-0 text-[13px] text-[#ff8a7a]">
          {inv.error}
        </p>
      )}
    </SettingsCard>
  )
}
