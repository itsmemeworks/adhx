import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => ({ all: () => (existing ? [{ userId: 'u1' }] : []) }),
        }),
      }),
    }),
  },
}))

let existing = false

describe('sign-up allowlist', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    existing = false
  })

  it('is open when ALLOWED_EMAILS is unset or *', async () => {
    const { mayUseEmail } = await import('@/lib/auth/allowlist')
    expect(mayUseEmail('anyone@example.com')).toBe(true)
    vi.stubEnv('ALLOWED_EMAILS', '*')
    expect(mayUseEmail('anyone@example.com')).toBe(true)
  })

  it('lets in listed emails and whole domains, and nobody else', async () => {
    vi.stubEnv('ALLOWED_EMAILS', 'me@home.example, @friends.example')
    const { mayUseEmail } = await import('@/lib/auth/allowlist')
    expect(mayUseEmail('ME@home.example')).toBe(true)
    expect(mayUseEmail('sam@friends.example')).toBe(true)
    expect(mayUseEmail('stranger@elsewhere.example')).toBe(false)
    expect(mayUseEmail('x@notfriends.example')).toBe(false)
  })

  it('always lets existing accounts sign in', async () => {
    vi.stubEnv('ALLOWED_EMAILS', 'me@home.example')
    existing = true
    const { mayUseEmail } = await import('@/lib/auth/allowlist')
    expect(mayUseEmail('old-friend@example.com')).toBe(true)
  })
})
