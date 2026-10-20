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

/** Gob, inline (no requests): the mark beside "adhx" on script-free pages. */
const GOB_SVG = `<svg aria-hidden="true" width="34" height="34" viewBox="0 0 96 96"><g transform="rotate(-4 48 48)"><rect x="10" y="14" width="76" height="72" rx="28" fill="#ffd23f"/><circle cx="36" cy="46" r="7" fill="#141414"/><circle cx="63" cy="42" r="11" fill="#141414"/><circle cx="66" cy="39" r="3.5" fill="#ffd23f"/><path d="M40 66 q9 5 18 -1" stroke="#141414" stroke-width="5" fill="none" stroke-linecap="round" transform="rotate(-7 49 66)"/></g></svg>`

/**
 * A small dark page with no scripts and a CSP that forbids them, for links
 * that must survive previews (sign-in links, invites). Forms may only post
 * back to this origin. Same look as the app: warm black, Gob and adhx on
 * top, a serif heading.
 */
export function scriptFreePage(options: {
  title: string
  /** Trusted HTML for the heading, when it isn't just the title (a second, yellow line). */
  heading?: string
  /** Small words top right ("Private invite"). */
  kicker?: string
  /** Trusted HTML above the heading (who sent an invite). */
  before?: string
  /** Trusted HTML; escape anything that came from a person. */
  content: string
  status?: number
}): NextResponse {
  const heading = options.heading ?? escapeHtml(options.title)
  const kicker = options.kicker ? `<span class="kicker">${escapeHtml(options.kicker)}</span>` : ''
  return new NextResponse(
    `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(options.title)}</title><style>
html{color-scheme:dark;font-family:'Hanken Grotesk',system-ui,sans-serif;background:#0f0e0c;color:#f4f1ea}
body{margin:0;min-height:100dvh;display:flex;justify-content:center;padding:20px 24px 32px;box-sizing:border-box}
main{width:min(100%,440px);display:flex;flex-direction:column}
.top{display:flex;align-items:center;justify-content:space-between;gap:12px;height:48px;margin:0 0 28px}
.brand{display:flex;align-items:center;gap:6px;color:#f4f1ea;text-decoration:none;font:400 30px/1 'Instrument Serif',Georgia,serif}
.kicker{font-size:14px;color:#a39b8b;white-space:nowrap}
.chip{display:flex;align-items:center;gap:14px;padding:10px 18px 10px 10px;border-radius:28px;background:#1a1814;border:1px solid rgba(255,255,255,.08);margin:0 0 24px}
.face{flex:none;width:44px;height:44px;border-radius:38%;transform:rotate(-4deg);display:flex;align-items:center;justify-content:center;color:#000;font-weight:800;font-size:18px}
.chip b{display:block;font-size:15px;font-weight:800;color:#f4f1ea}
.chip small{display:block;font-size:13px;color:#a39b8b;margin-top:2px}
h1{font-family:'Instrument Serif',Georgia,serif;font-weight:400;font-size:40px;line-height:1.02;letter-spacing:-.01em;margin:0 0 26px}
h1 .accent{display:block;color:#ffd23f}
p{font-size:16px;line-height:1.5;color:#c9bfab;margin:0 0 24px}
label{display:block;font-size:15px;font-weight:700;color:#c9bfab;margin:0 0 10px}
input.field{display:block;box-sizing:border-box;width:100%;height:60px;border-radius:18px;border:2px solid #3a352d;background:#1a1814;color:#f4f1ea;padding:0 18px;font:700 19px system-ui,sans-serif;margin:0 0 10px}
input.field:focus{outline:none;border-color:#ffd23f;box-shadow:0 0 0 4px rgba(255,210,63,.16)}
.hint{font-size:14px;color:#a39b8b;margin:0 0 22px}
.note{font-size:14px;line-height:1.5;color:#a39b8b;margin:18px 0 0;text-align:center}
[role=alert]{color:#ff8a7a}
button,.button{display:flex;align-items:center;justify-content:center;gap:10px;box-sizing:border-box;width:100%;height:56px;border:0;border-radius:99px;background:#ffd23f;color:#000;padding:0 20px;text-align:center;text-decoration:none;font:800 18px system-ui,sans-serif;cursor:pointer}
button:focus-visible,a:focus-visible{outline:3px solid white;outline-offset:4px}
@media (min-width:700px){body{align-items:center;padding:40px}h1{font-size:56px}}
</style></head><body><main><div class="top"><a class="brand" href="/" aria-label="adhx home">${GOB_SVG}<span>adhx</span></a>${kicker}</div>${options.before ?? ''}<h1>${heading}</h1>${options.content}</main></body></html>`,
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
