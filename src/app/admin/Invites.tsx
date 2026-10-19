'use client'

import { useState, type FormEvent } from 'react'
import { Check, Copy, Link2, Share2, X } from 'lucide-react'
import { daysLeft, useInvites } from '@/components/next/settings/InviteCard'

const BUTTON =
  'inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-[10px] bg-clay text-white text-[13px] font-semibold disabled:opacity-50'
const OUTLINE =
  'inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-[10px] border border-hairline text-[13px] font-semibold text-ink-2'

/**
 * The admin page's "Invite someone", next to Sign-in links: the same invites
 * as Settings (`useInvites`), in the admin page's look, listing everyone's.
 */
export function AdminInvites() {
  const inv = useInvites()
  const [nameHint, setNameHint] = useState('')

  if (!inv.canInvite) return null

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (await inv.create(nameHint)) setNameHint('')
  }

  return (
    <section
      id="invites"
      aria-labelledby="admin-invites"
      className="bg-surface rounded-card border border-hairline shadow-m-sm p-5 scroll-mt-24"
    >
      <div className="mb-3">
        <h2 id="admin-invites" className="font-serif font-semibold text-base text-ink">
          Invite someone
        </h2>
        <p className="text-[13px] text-ink-3">
          The easy way in: one link for one person. They pick a name and they’re in, with no email
          and no allowlist entry. Each link works once, for 7 days.
        </p>
      </div>

      <form onSubmit={(e) => void submit(e)} className="mb-3 flex flex-wrap gap-2">
        <input
          type="text"
          aria-label="Who’s it for? (optional)"
          placeholder="Who’s it for? (optional)"
          value={nameHint}
          maxLength={40}
          onChange={(e) => setNameHint(e.target.value)}
          className="min-h-[40px] min-w-0 flex-1 rounded-[10px] border border-hairline bg-inset px-3 text-[14px] text-ink outline-none focus:border-clay"
        />
        <button type="submit" disabled={inv.busy} className={BUTTON}>
          <Link2 aria-hidden className="h-3.5 w-3.5" />
          <span>{inv.busy ? 'Making…' : 'Make an invite link'}</span>
        </button>
      </form>

      {inv.made && (
        <div className="mb-3 flex flex-col gap-2 rounded-[12px] bg-inset px-4 py-3">
          <span className="text-[12px] text-ink-3">
            {`${inv.made.nameHint ? `For ${inv.made.nameHint}. ` : ''}Shown only this once.`}
          </span>
          <code className="block select-all break-all rounded-lg bg-surface px-2.5 py-2 font-mono text-[12px] text-ink-2">
            {inv.made.url}
          </code>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void inv.copy()} className={BUTTON}>
              {inv.copied ? (
                <Check aria-hidden className="h-3.5 w-3.5" />
              ) : (
                <Copy aria-hidden className="h-3.5 w-3.5" />
              )}
              <span>{inv.copied ? 'Copied' : 'Copy link'}</span>
            </button>
            {inv.canShare && (
              <button type="button" onClick={() => void inv.share()} className={OUTLINE}>
                <Share2 aria-hidden className="h-3.5 w-3.5" />
                <span>Share…</span>
              </button>
            )}
            <button type="button" onClick={inv.dismiss} className={OUTLINE}>
              Done
            </button>
          </div>
        </div>
      )}

      {inv.invites.length === 0 ? (
        <p className="rounded-[12px] bg-inset px-4 py-3 text-[13px] text-ink-3">
          No invites waiting.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {inv.invites.map((invite) => (
            <li
              key={invite.id}
              className="flex flex-wrap items-center gap-2 rounded-[12px] bg-inset px-4 py-3"
            >
              <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">
                {invite.nameHint ? `For ${invite.nameHint}` : 'Invite link'}
              </span>
              <span className="text-[12px] text-ink-3">
                {`From @${invite.createdBy} · ${daysLeft(invite.expiresAt)}`}
              </span>
              <button type="button" onClick={() => void inv.revoke(invite)} className={OUTLINE}>
                <X aria-hidden className="h-3.5 w-3.5" />
                <span>Revoke</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {inv.error && (
        <p role="alert" className="mt-2 text-[13px] text-red-700">
          {inv.error}
        </p>
      )}
    </section>
  )
}
