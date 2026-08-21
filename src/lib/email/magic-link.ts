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
  const html = buildMagicLinkHtml({ url, intent })

  try {
    const response = await fetchWithTimeout('https://api.resend.com/emails', 10_000, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: email, subject, html }),
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

function buildMagicLinkHtml({ url, intent }: { url: string; intent: 'signin' | 'change' }): string {
  const heading = intent === 'change' ? 'Confirm your new email' : 'Sign in to ADHX'
  const body =
    intent === 'change'
      ? 'Click the button below to confirm this email address for your ADHX account.'
      : 'Click the button below to sign in to your ADHX account.'
  const cta = intent === 'change' ? 'Confirm email' : 'Sign in'

  return `<!doctype html>
<html>
  <body style="margin:0;padding:32px 16px;background:#08070a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#f4f1ea;">
    <table role="presentation" width="100%" style="max-width:480px;margin:0 auto;">
      <tr>
        <td style="padding-bottom:24px;font-size:24px;font-weight:700;color:#f4f1ea;">ADHX</td>
      </tr>
      <tr>
        <td style="background:#131118;border-radius:12px;padding:32px;">
          <h1 style="margin:0 0 12px;font-size:20px;color:#f4f1ea;">${heading}</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:#c9c4ba;">${body}</p>
          <a href="${url}" style="display:inline-block;background:#e8664b;color:#0b0a0d;text-decoration:none;font-weight:600;padding:12px 24px;border-radius:8px;font-size:15px;">${cta}</a>
          <p style="margin:24px 0 0;font-size:13px;color:#8a8578;">Or paste this link into your browser:</p>
          <p style="margin:4px 0 0;font-size:13px;color:#8a8578;word-break:break-all;">${url}</p>
          <p style="margin:24px 0 0;font-size:12px;color:#65614f;">This link expires in 15 minutes. If you didn't request this, you can safely ignore this email.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`
}
