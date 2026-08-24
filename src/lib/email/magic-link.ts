import { render, toPlainText } from 'react-email'
import { MagicLinkEmail } from '@/emails/magic-link'
import { captureException } from '@/lib/sentry'
import { fetchWithTimeout } from '@/lib/utils/fetch-timeout'

export interface SendMagicLinkResult {
  ok: boolean
  devLogged?: boolean
}

/**
 * Send a magic-link email via Resend. In local dev (no RESEND_API_KEY set,
 * NODE_ENV !== 'production') it logs the link to the console instead — that's
 * how sign-in works locally without an email provider configured.
 *
 * HTML is the SignInModal-shaped template in `src/emails/magic-link.tsx`
 * (`pnpm email:dev` to preview).
 */
export async function sendMagicLinkEmail(params: {
  email: string
  url: string
  intent: 'signin' | 'change'
}): Promise<SendMagicLinkResult> {
  const { email, url, intent } = params
  const apiKey = process.env.RESEND_API_KEY

  if (!apiKey) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[magic-link] Sign-in link for ${email}: ${url}`)
      return { ok: true, devLogged: true }
    }
    return { ok: false }
  }

  const from = process.env.EMAIL_FROM || 'ADHX <login@adhx.com>'
  const subject = intent === 'change' ? 'Confirm your new ADHX email' : 'Your ADHX sign-in link'

  let html: string
  let text: string
  try {
    html = await render(MagicLinkEmail({ url, intent }))
    text = toPlainText(html)
  } catch (error) {
    captureException(error, { endpoint: 'sendMagicLinkEmail' })
    return { ok: false }
  }

  try {
    const response = await fetchWithTimeout('https://api.resend.com/emails', 10_000, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: email, subject, html, text }),
    })

    if (!response.ok) {
      const body = await response.text()
      captureException(new Error(`Resend send failed: ${response.status} ${body}`), {
        endpoint: 'sendMagicLinkEmail',
      })
      return { ok: false }
    }

    return { ok: true }
  } catch (error) {
    captureException(error, { endpoint: 'sendMagicLinkEmail' })
    return { ok: false }
  }
}
