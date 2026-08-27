import { describe, it, expect } from 'vitest'
import { render, toPlainText } from 'react-email'
import { MagicLinkEmail } from '@/emails/magic-link'

const URL = 'https://adhx.com/api/auth/email/callback?token=abc123'

describe('MagicLinkEmail', () => {
  it('renders the SignInModal-shaped sign-in mail', async () => {
    const html = await render(MagicLinkEmail({ url: URL, intent: 'signin' }))
    expect(html).toContain('Sign in to ADHX')
    expect(html).toContain('One tap, no password')
    expect(html).toContain('Sign in')
    expect(html).toContain('https://adhx.com/logo-dark.png')
    expect(html).toContain('Save it. Lose it. Find it.')
    expect(html).toContain(URL)
    expect(html).toContain('#08070a')
    expect(html).toContain('#201b16')
    expect(html).toContain('#e88a5e')
    expect(html).not.toContain('<script')
  })

  it('uses confirm copy for the email-change intent', async () => {
    const html = await render(MagicLinkEmail({ url: URL, intent: 'change' }))
    expect(html).toContain('Confirm your new email')
    expect(html).toContain('Confirm email')
    expect(html).not.toContain('Sign in to ADHX')
  })

  it('escapes a hostile callback URL in the href', async () => {
    const hostile = 'https://adhx.com/api/auth/email/callback?token="><script>alert(1)</script>'
    const html = await render(MagicLinkEmail({ url: hostile, intent: 'signin' }))
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&quot;')
  })

  it('plain text still carries the link', async () => {
    const html = await render(MagicLinkEmail({ url: URL, intent: 'signin' }))
    const text = toPlainText(html)
    expect(text).toMatch(/SIGN IN TO ADHX/i)
    expect(text).toContain(URL)
    expect(text).toContain('15 minutes')
  })
})
