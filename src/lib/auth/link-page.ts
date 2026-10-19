import { NextResponse } from 'next/server'

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!
  })
}

/** A script-free confirmation keeps GET/HEAD previews from spending a sign-in link. */
export function loginLinkPage(options: {
  token?: string
  intent?: string
  error?: string
  status?: number
}): NextResponse {
  const changing = options.intent === 'change'
  const title = options.error
    ? 'This link couldn’t be used'
    : changing
      ? 'Confirm your email'
      : 'Sign in to ADHX'
  const action = changing ? 'Confirm email' : 'Sign in'
  const content = options.error
    ? `<p role="alert">${escapeHtml(options.error)}</p><a class="button" href="/start">Get a new sign-in link</a>`
    : `<p>Continue in the browser where you want to use ADHX. Your link is used only when you press the button.</p>
       <form action="/api/auth/email/callback" method="post">
         <input type="hidden" name="token" value="${escapeHtml(options.token ?? '')}">
         <button type="submit">${action}</button>
       </form>`
  return scriptFreePage({ title, content, status: options.status })
}

/**
 * A small dark page with no scripts and a CSP that forbids them, for links
 * that must survive previews (sign-in links, invites). Forms may only post
 * back to this origin.
 */
export function scriptFreePage(options: {
  title: string
  /** Trusted HTML; escape anything that came from a person. */
  content: string
  status?: number
}): NextResponse {
  return new NextResponse(
    `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(options.title)}</title><style>
html{color-scheme:dark;font-family:system-ui,sans-serif;background:#080808;color:#f5f3eb}
body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:24px;box-sizing:border-box}
main{width:min(100%,440px);padding:32px;box-sizing:border-box;border-radius:28px;background:#1c1b19}
h1{font-family:Georgia,serif;font-size:36px;line-height:1.1;margin:0 0 20px}
p{font-size:16px;line-height:1.5;color:#d0cec7;margin:0 0 24px}
label{display:block;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#a8a69f;margin:0 0 8px}
input.field{display:block;box-sizing:border-box;width:100%;height:52px;border-radius:14px;border:1.5px solid #3a3833;background:#080808;color:#fff;padding:0 16px;font:17px system-ui;margin:0 0 8px}
input.field:focus{outline:none;border-color:#ffdc42}
.hint{font-size:13px;color:#a8a69f;margin:0 0 20px}
.note{font-size:14px;color:#a8a69f;margin:20px 0 0}
[role=alert]{color:#ff8a7a}
button,.button{display:block;box-sizing:border-box;width:100%;border:0;border-radius:99px;background:#ffdc42;color:#080808;padding:16px;text-align:center;text-decoration:none;font:700 17px system-ui;cursor:pointer}
button:focus-visible,a:focus-visible{outline:3px solid white;outline-offset:4px}
</style></head><body><main><h1>${escapeHtml(options.title)}</h1>${options.content}</main></body></html>`,
    {
      status: options.status ?? 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'same-origin',
        'X-Robots-Tag': 'noindex, nofollow, noarchive',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy':
          "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      },
    },
  )
}
