import type { NextResponse } from 'next/server'
import { escapeHtml, scriptFreePage } from './link-page'
import type { InviteProblem } from './invites'
import { USERNAME_MAX_LENGTH } from './username-rules'
import { personColour } from '@/components/next/moments/people'

/** Plain reasons an invite can't be used. */
export const INVITE_PROBLEMS: Record<InviteProblem, string> = {
  bad: 'This invite link doesn’t work. Check you copied all of it, or ask for a new one.',
  used: 'This invite has already been used. Ask whoever sent it for a new one.',
  expired: 'This invite has expired. Invites last 7 days, so ask for a new one.',
  revoked: 'This invite was cancelled. Ask whoever sent it for a new one.',
  dead: 'This invite doesn’t work any more. Ask whoever runs this ADHX for a new one.',
}

export const INVITE_NAME_ERRORS = {
  invalid: 'Names are 3 to 15 letters, numbers or underscores.',
  taken: (name: string) => `@${name} is taken. Try another.`,
}

const STATUS: Record<InviteProblem, number> = {
  bad: 404,
  used: 410,
  expired: 410,
  revoked: 410,
  dead: 410,
}

export function inviteProblemPage(problem: InviteProblem): NextResponse {
  return scriptFreePage({
    title: 'This invite can’t be used',
    content: `<p role="alert">${escapeHtml(INVITE_PROBLEMS[problem])}</p><a class="button" href="/">Go to ADHX</a>`,
    status: STATUS[problem],
  })
}

/** Any text error that isn't about the invite itself (a refused form post). */
export function inviteErrorPage(message: string, status: number): NextResponse {
  return scriptFreePage({
    title: 'This invite can’t be used',
    content: `<p role="alert">${escapeHtml(message)}</p>`,
    status,
  })
}

/**
 * The invite itself: who it's from, a name field and Join. No scripts, so a
 * message preview or link scanner can open it without spending it; only the
 * form's POST does that.
 */
export function inviteJoinPage(options: {
  token: string
  inviter: string
  name: string
  error?: string
  signedInAs?: string | null
  status?: number
}): NextResponse {
  const error = options.error
    ? `<p role="alert" id="name-error" class="hint">${escapeHtml(options.error)}</p>`
    : `<p class="hint" id="name-hint">3 to ${USERNAME_MAX_LENGTH} letters, numbers or _. It’s how your lot will see you.</p>`
  const signedIn = options.signedInAs
    ? `<p class="note">You’re signed in here as @${escapeHtml(options.signedInAs)}. Joining switches this browser to your new name.</p>`
    : ''
  const inviter = escapeHtml(options.inviter)
  const initial = escapeHtml(Array.from(options.inviter.trim())[0]?.toUpperCase() ?? '?')
  return scriptFreePage({
    title: `${options.inviter} wants you in.`,
    heading: `${inviter} wants you in. <span class="accent">Pick a name.</span>`,
    kicker: 'Private invite',
    before: `<div class="chip"><span class="face" aria-hidden="true" style="background:${personColour(options.inviter)}">${initial}</span><span><b>${inviter} invited you</b><small>to their ADHX, for friends only</small></span></div>`,
    content: `<form action="/invite/${escapeHtml(options.token)}" method="post">
         <label for="username">Your name</label>
         <input class="field" id="username" name="username" value="${escapeHtml(options.name)}" required minlength="3" maxlength="${USERNAME_MAX_LENGTH}" autocomplete="off" autocapitalize="none" spellcheck="false" aria-describedby="${options.error ? 'name-error' : 'name-hint'}"${options.error ? ' aria-invalid="true" autofocus' : ''}>
         ${error}
         <button type="submit">Join<span aria-hidden="true">→</span></button>
       </form>
       <p class="note">No password, no email needed. This link works once and lasts 7 days.</p>${signedIn}`,
    status: options.status,
  })
}
