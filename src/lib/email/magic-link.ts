import crypto from 'crypto'
import { and, eq, gt, isNull, lt, sql } from 'drizzle-orm'
import { render, toPlainText } from 'react-email'
import { MagicLinkEmail } from '@/emails/magic-link'
import { db } from '@/lib/db'
import { adminSignInLinks, loginTokens, userIdentities, users } from '@/lib/db/schema'
import { captureException } from '@/lib/sentry'
import { fetchWithTimeout } from '@/lib/utils/fetch-timeout'
import { ADMIN_LOGIN_TOKEN_TTL_MS } from '@/lib/auth/login-token-policy'
import { appUrl } from '@/lib/routes/app-url'
import { trackServiceCall } from '@/lib/ops/service-calls'
import { extra } from '@/lib/settings/extras'

/**
 * How a sign-in link reaches someone:
 * - `email`: sent through Resend (`RESEND_API_KEY`) or your own mail server
 *   (`SMTP_URL`, e.g. `smtps://user:pass@mail.example.com:465`).
 * - `admin`: no email service. The link waits on the admin page for whoever
 *   runs ADHX to hand over. The default in production without email, so a
 *   one-click install works; `EMAIL_LINKS_TO_ADMIN=off` turns sign-in links
 *   off instead.
 * - `log`: local development with neither, the link is printed to the console.
 */
export type SignInDelivery = 'email' | 'admin' | 'log'

export interface SendMagicLinkResult {
  ok: boolean
  delivery?: SignInDelivery
  /** @deprecated read `delivery === 'log'` */
  devLogged?: boolean
}

const SEND_TIMEOUT_MS = 10_000

function flag(name: string): boolean | null {
  const v = process.env[name]?.trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'on') return true
  if (v === '0' || v === 'false' || v === 'off') return false
  return null
}

/** Which way links go on this server (also shown to admins). */
export function signInDelivery(): SignInDelivery | null {
  if (extra('RESEND_API_KEY') || extra('SMTP_URL')) return 'email'
  const held = flag('EMAIL_LINKS_TO_ADMIN')
  if (held) return 'admin'
  if (process.env.NODE_ENV !== 'production') return 'log'
  return held === false ? null : 'admin'
}

async function renderEmail(url: string, intent: 'signin' | 'change') {
  const html = await render(MagicLinkEmail({ url, intent }))
  return {
    subject: intent === 'change' ? 'Confirm your new ADHX email' : 'Your ADHX sign-in link',
    html,
    text: toPlainText(html),
  }
}

type Message = { subject: string; html: string; text: string }

async function sendWithResend(to: string, message: Message) {
  const from = extra('EMAIL_FROM') || 'ADHX <login@adhx.com>'
  const response = await fetchWithTimeout('https://api.resend.com/emails', SEND_TIMEOUT_MS, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${extra('RESEND_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, ...message }),
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Resend send failed: ${response.status} ${body}`)
  }
}

/**
 * `smtp://user:pass@host:587` (STARTTLS) or `smtps://user:pass@host:465`
 * (TLS from the start). Credentials may be percent-encoded.
 */
export function smtpOptions(raw: string) {
  const url = new URL(raw)
  if (url.protocol !== 'smtp:' && url.protocol !== 'smtps:') {
    throw new Error('SMTP_URL must start with smtp:// or smtps://')
  }
  const secure = url.protocol === 'smtps:'
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : secure ? 465 : 587,
    secure,
    auth: url.username
      ? { user: decodeURIComponent(url.username), pass: decodeURIComponent(url.password) }
      : undefined,
    connectionTimeout: SEND_TIMEOUT_MS,
    greetingTimeout: SEND_TIMEOUT_MS,
    socketTimeout: SEND_TIMEOUT_MS,
  }
}

async function sendWithSmtp(to: string, message: Message) {
  const nodemailer = await import('nodemailer')
  const transport = nodemailer.createTransport(smtpOptions(extra('SMTP_URL') ?? ''))
  try {
    await transport.sendMail({
      from: extra('EMAIL_FROM') || 'ADHX <login@localhost>',
      to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    })
  } finally {
    transport.close()
  }
}

function tokenHashOf(url: string): string | null {
  try {
    const token = new URL(url).searchParams.get('token')
    return token ? crypto.createHash('sha256').update(token).digest('hex') : null
  } catch {
    return null
  }
}

/** Nobody is an admin yet, or this email belongs to one. */
function isOwnerBootstrap(email: string): boolean {
  const [admins] = db
    .select({ n: sql<number>`count(*)` })
    .from(users)
    .where(eq(users.role, 'admin'))
    .all()
  if (!admins || Number(admins.n) === 0) return true
  const [row] = db
    .select({ role: users.role })
    .from(userIdentities)
    .innerJoin(users, eq(users.id, userIdentities.userId))
    .where(and(eq(userIdentities.provider, 'email'), eq(userIdentities.providerId, email)))
    .limit(1)
    .all()
  return row?.role === 'admin'
}

/**
 * Keep the link for an admin to hand over. The person who runs ADHX can't
 * open the admin page before they've signed in, so until there's an admin
 * (and for admins' own links) it's also printed in the server log.
 */
function holdForAdmin(email: string, url: string, intent: 'signin' | 'change'): boolean {
  const tokenHash = tokenHashOf(url)
  if (!tokenHash) return false
  const [token] = db
    .select({ expiresAt: loginTokens.expiresAt })
    .from(loginTokens)
    .where(eq(loginTokens.tokenHash, tokenHash))
    .limit(1)
    .all()
  const now = Date.now()
  db.delete(adminSignInLinks).where(lt(adminSignInLinks.expiresAt, now)).run()
  db.insert(adminSignInLinks)
    .values({
      tokenHash,
      email,
      url,
      intent,
      createdAt: new Date(now).toISOString(),
      expiresAt: token?.expiresAt ?? now + ADMIN_LOGIN_TOKEN_TTL_MS,
    })
    .onConflictDoNothing()
    .run()
  if (isOwnerBootstrap(email)) {
    console.warn(`[sign-in] Link for ${email} (also on the admin page): ${url}`)
  }
  return true
}

/** Sign-in links waiting on the admin page: not used, not expired. */
export function pendingAdminSignInLinks(): Array<{
  tokenHash: string
  email: string
  url: string
  intent: string
  createdAt: string
  expiresAt: number
}> {
  return db
    .select({
      tokenHash: adminSignInLinks.tokenHash,
      email: adminSignInLinks.email,
      url: adminSignInLinks.url,
      intent: adminSignInLinks.intent,
      createdAt: adminSignInLinks.createdAt,
      expiresAt: adminSignInLinks.expiresAt,
    })
    .from(adminSignInLinks)
    .innerJoin(loginTokens, eq(loginTokens.tokenHash, adminSignInLinks.tokenHash))
    .where(and(gt(adminSignInLinks.expiresAt, Date.now()), isNull(loginTokens.usedAt)))
    .orderBy(sql`${adminSignInLinks.createdAt} DESC`)
    .all()
}

export function discardAdminSignInLink(tokenHash: string): boolean {
  return (
    db.delete(adminSignInLinks).where(eq(adminSignInLinks.tokenHash, tokenHash)).run().changes === 1
  )
}

/**
 * Get a magic link to someone: by email (Resend or SMTP), onto the admin page
 * (`EMAIL_LINKS_TO_ADMIN`), or, in local development, into the console.
 * HTML is `src/emails/magic-link.tsx` (`pnpm email:dev` to preview).
 */
export async function sendMagicLinkEmail(params: {
  email: string
  url: string
  intent: 'signin' | 'change'
}): Promise<SendMagicLinkResult> {
  const { email, url, intent } = params
  const delivery = signInDelivery()

  if (delivery === 'log') {
    console.log(`[magic-link] Sign-in link for ${email}: ${url}`)
    return { ok: true, delivery, devLogged: true }
  }
  if (delivery === 'admin') {
    try {
      return { ok: holdForAdmin(email, url, intent), delivery }
    } catch (error) {
      captureException(error, { endpoint: 'sendMagicLinkEmail.admin' })
      return { ok: false }
    }
  }
  if (delivery !== 'email') return { ok: false }

  try {
    const message = await renderEmail(url, intent)
    await trackServiceCall('email', 'sign-in', () =>
      extra('RESEND_API_KEY') ? sendWithResend(email, message) : sendWithSmtp(email, message),
    )
    return { ok: true, delivery }
  } catch (error) {
    captureException(error, { endpoint: 'sendMagicLinkEmail' })
    return { ok: false }
  }
}

/**
 * Email a phone sign-in code (`POST /api/app/signin`). Only by email (Resend
 * or SMTP), or into the console in local development: a code can't wait on
 * the admin page, so `admin` delivery (and no delivery) returns `ok: false`.
 * HTML is `src/emails/sign-in-code.tsx`.
 */
export async function sendSignInCodeEmail(params: {
  email: string
  code: string
}): Promise<SendMagicLinkResult> {
  const { email, code } = params
  const delivery = signInDelivery()
  if (delivery === 'log') {
    console.log(`[sign-in-code] Phone sign-in code for ${email}: ${code}`)
    return { ok: true, delivery, devLogged: true }
  }
  if (delivery !== 'email') return { ok: false }
  try {
    const origin = appUrl()
    const { SignInCodeEmail } = await import('@/emails/sign-in-code')
    const html = await render(SignInCodeEmail({ code, origin }))
    const message = { subject: `Your ADHX code: ${code}`, html, text: toPlainText(html) }
    await trackServiceCall('email', 'sign-in', () =>
      extra('RESEND_API_KEY') ? sendWithResend(email, message) : sendWithSmtp(email, message),
    )
    return { ok: true, delivery }
  } catch (error) {
    captureException(error, { endpoint: 'sendSignInCodeEmail' })
    return { ok: false }
  }
}

/**
 * Admin → System → Send a test email: one plain message to the admin's own
 * address, through whichever service is set up. Throws with the failure.
 */
export async function sendTestEmail(to: string): Promise<void> {
  if (signInDelivery() !== 'email') throw new Error('No email service is set up')
  const message: Message = {
    subject: 'ADHX can send email',
    html: '<p>This is a test from Admin → System. Sign-in links will arrive the same way.</p>',
    text: 'This is a test from Admin → System. Sign-in links will arrive the same way.',
  }
  await trackServiceCall('email', 'test', () =>
    extra('RESEND_API_KEY') ? sendWithResend(to, message) : sendWithSmtp(to, message),
  )
}
