import { expect, test } from '@playwright/test'
import crypto from 'node:crypto'
import Database from 'better-sqlite3'
import { E2E_DB_PATH } from './env'
import { E2E_ORIGIN } from './constants'

test('a preview leaves the link usable and an explicit sign-in persists the browser session', async ({
  page,
  context,
}, testInfo) => {
  const db = new Database(E2E_DB_PATH)
  const token = crypto.randomBytes(32).toString('base64url')
  const hash = crypto.createHash('sha256').update(token).digest('hex')
  const email = `browser-${crypto.randomBytes(6).toString('hex')}@example.com`
  const url = `${E2E_ORIGIN}/api/auth/email/callback?token=${token}`
  db.prepare(
    'INSERT INTO login_tokens (token_hash, email, intent, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(hash, email, 'signin', Date.now() + 60 * 60_000, new Date().toISOString())
  try {
    const preview = await context.request.head(url)
    expect(preview.status()).toBe(200)
    expect(preview.headers()['cache-control']).toBe('no-store')
    expect(preview.headers()['referrer-policy']).toBe('same-origin')
    expect(preview.headers()['content-security-policy']).toContain("default-src 'none'")
    expect((await context.request.get(url)).status()).toBe(200)
    await page.goto(url)
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
    expect(await context.cookies()).toEqual([])
    expect(db.prepare('SELECT used_at FROM login_tokens WHERE token_hash = ?').get(hash)).toEqual({
      used_at: null,
    })
    await page.screenshot({ path: testInfo.outputPath('link-confirmation.png') })
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page).toHaveURL(/\/welcome\?returnTo=/)
    const me = await (await context.request.get('/api/auth/me')).json()
    expect(me).toMatchObject({ authenticated: true, identities: { email: { email } } })
    expect(
      (await context.cookies()).find((cookie) => cookie.name === 'adhx_session'),
    ).toMatchObject({ httpOnly: true, sameSite: 'Lax' })
    await page.reload()
    expect(await (await context.request.get('/api/auth/me')).json()).toMatchObject({
      authenticated: true,
    })
    const used = await page.goto(url)
    expect(used?.status()).toBe(410)
    await expect(page.getByRole('alert')).toContainText('already been used')
    await expect(page.getByRole('link', { name: 'Get a new sign-in link' })).toBeVisible()
  } finally {
    db.prepare('DELETE FROM login_tokens WHERE token_hash = ?').run(hash)
    db.prepare('DELETE FROM users WHERE email = ?').run(email)
    db.close()
  }
})
