import { describe, it, expect } from 'vitest'
import { isValidEmail } from '@/lib/utils/email'

/**
 * `isValidEmail` (`src/lib/utils/email.ts`) is a hand-rolled, linear-time
 * shape check — no backtrackable regex, because the sign-in request route
 * (`/api/auth/email/request`) is unauthenticated and a regex ReDoS there was
 * flagged by CodeQL. It's deliberately a *shape* check, not RFC validation:
 * one '@', non-empty local part, a domain with an interior dot, no
 * whitespace, length capped at 254. Assertions here follow the documented
 * rules exactly rather than general email-validity intuition.
 */

describe('isValidEmail', () => {
  describe('valid addresses', () => {
    it.each([
      'a@b.co',
      'user@example.com',
      'first.last@example.com',
      'user+tag@example.com',
      'user.name+filter@sub.example.com',
      'user@sub.domain.example.com',
      'x@y.z.co.uk',
    ])('%s', (email) => {
      expect(isValidEmail(email)).toBe(true)
    })
  })

  describe('invalid addresses', () => {
    it('rejects a missing @', () => {
      expect(isValidEmail('no-at-sign.com')).toBe(false)
    })

    it('rejects multiple @ signs', () => {
      expect(isValidEmail('a@b@c.com')).toBe(false)
    })

    it('rejects an empty local part (@ at index 0)', () => {
      expect(isValidEmail('@example.com')).toBe(false)
    })

    it('rejects whitespace anywhere in the address', () => {
      expect(isValidEmail('a b@example.com')).toBe(false)
      expect(isValidEmail('a@ example.com')).toBe(false)
      expect(isValidEmail('a@example.com ')).toBe(false)
    })

    it('rejects the empty string', () => {
      expect(isValidEmail('')).toBe(false)
    })

    it('rejects addresses shorter than 3 characters', () => {
      expect(isValidEmail('a@')).toBe(false)
      expect(isValidEmail('ab')).toBe(false)
    })

    it('rejects a domain with no dot at all', () => {
      expect(isValidEmail('user@localhost')).toBe(false)
    })

    it('rejects a domain whose dot is the first character', () => {
      expect(isValidEmail('user@.com')).toBe(false)
    })

    it('rejects a domain whose dot is the last character (trailing dot)', () => {
      expect(isValidEmail('user@example.')).toBe(false)
    })

    it('rejects an empty domain', () => {
      expect(isValidEmail('user@')).toBe(false)
    })

    it('rejects addresses longer than 254 characters', () => {
      const longLocal = 'a'.repeat(250)
      const email = `${longLocal}@b.co` // > 254 chars total
      expect(email.length).toBeGreaterThan(254)
      expect(isValidEmail(email)).toBe(false)
    })

    it('accepts an address at exactly the 254-character boundary', () => {
      // 'a@' + local dot domain sized to land exactly on 254 chars.
      const prefix = 'user@'
      const suffix = '.com'
      const middleLength = 254 - prefix.length - suffix.length
      const email = `${prefix}${'x'.repeat(middleLength)}${suffix}`
      expect(email.length).toBe(254)
      expect(isValidEmail(email)).toBe(true)
    })
  })

  describe('pathological input (ReDoS guard)', () => {
    it('completes quickly for a very long string with no @', () => {
      const start = performance.now()
      const result = isValidEmail('a'.repeat(10_000))
      const elapsed = performance.now() - start
      expect(result).toBe(false)
      expect(elapsed).toBeLessThan(50)
    })

    it('completes quickly for a long string with a late @ and no dot', () => {
      const start = performance.now()
      const result = isValidEmail(`${'a'.repeat(5000)}@${'b'.repeat(5000)}`)
      const elapsed = performance.now() - start
      expect(result).toBe(false)
      expect(elapsed).toBeLessThan(50)
    })

    it('completes quickly for a long string with many @ signs', () => {
      const start = performance.now()
      const result = isValidEmail(`${'@'.repeat(5000)}b.com`)
      const elapsed = performance.now() - start
      expect(result).toBe(false)
      expect(elapsed).toBeLessThan(50)
    })
  })
})
