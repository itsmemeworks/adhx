import { describe, it, expect, beforeAll } from 'vitest'
import {
  encryptToken,
  decryptToken,
  isEncryptedToken,
  safeDecryptToken,
} from '@/lib/auth/token-encryption'

/**
 * AES-256-GCM encrypt/decrypt for OAuth tokens at rest
 * (`src/lib/auth/token-encryption.ts`). Round-trip, IV uniqueness, and tamper
 * detection across each of the three `iv:authTag:ciphertext` segments packed
 * into the base64 blob.
 */

beforeAll(() => {
  // The key is derived from SESSION_SECRET (falls back to
  // TWITTER_CLIENT_SECRET) via scrypt — set explicitly so this file doesn't
  // depend on the shared component-test setup file's env var.
  process.env.SESSION_SECRET = 'test-secret-for-unit-tests-minimum-32-chars-here'
})

const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16

function flipByteAt(base64: string, index: number): string {
  const buf = Buffer.from(base64, 'base64')
  buf[index] = buf[index] ^ 0xff
  return buf.toString('base64')
}

describe('token-encryption', () => {
  describe('encryptToken / decryptToken round trip', () => {
    it('decrypts back to the original plaintext', () => {
      const plaintext = 'super-secret-oauth-access-token-abc123'
      const encrypted = encryptToken(plaintext)
      expect(decryptToken(encrypted)).toBe(plaintext)
    })

    it('round-trips an empty string', () => {
      const encrypted = encryptToken('')
      expect(decryptToken(encrypted)).toBe('')
    })

    it('round-trips a long, unicode token', () => {
      const plaintext = `🔐-token-${'x'.repeat(5000)}-日本語テスト-${'y'.repeat(5000)}-end`
      const encrypted = encryptToken(plaintext)
      expect(decryptToken(encrypted)).toBe(plaintext)
    })

    it('produces output that is not the plaintext itself', () => {
      const plaintext = 'plaintext-oauth-token'
      const encrypted = encryptToken(plaintext)
      expect(encrypted).not.toBe(plaintext)
      expect(encrypted).not.toContain(plaintext)
    })
  })

  describe('IV uniqueness', () => {
    it('produces different ciphertext for the same plaintext on repeated calls', () => {
      const plaintext = 'same-token-value'
      const first = encryptToken(plaintext)
      const second = encryptToken(plaintext)
      expect(first).not.toBe(second)
      // But both still decrypt to the same original value.
      expect(decryptToken(first)).toBe(plaintext)
      expect(decryptToken(second)).toBe(plaintext)
    })

    it('uses a distinct IV (first 16 bytes) each time', () => {
      const plaintext = 'same-token-value'
      const ivs = new Set<string>()
      for (let i = 0; i < 10; i++) {
        const combined = Buffer.from(encryptToken(plaintext), 'base64')
        ivs.add(combined.subarray(0, IV_LENGTH).toString('hex'))
      }
      expect(ivs.size).toBe(10)
    })
  })

  describe('tamper detection', () => {
    it('throws when a byte in the IV segment is flipped', () => {
      const encrypted = encryptToken('a-token-to-tamper-with')
      const tampered = flipByteAt(encrypted, 0)
      expect(() => decryptToken(tampered)).toThrow()
    })

    it('throws when a byte in the auth tag segment is flipped', () => {
      const encrypted = encryptToken('a-token-to-tamper-with')
      const tampered = flipByteAt(encrypted, IV_LENGTH)
      expect(() => decryptToken(tampered)).toThrow()
    })

    it('throws when a byte in the ciphertext segment is flipped', () => {
      const encrypted = encryptToken('a-token-to-tamper-with')
      const tampered = flipByteAt(encrypted, IV_LENGTH + AUTH_TAG_LENGTH)
      expect(() => decryptToken(tampered)).toThrow()
    })
  })

  describe('isEncryptedToken', () => {
    it('returns true for a real encrypted token', () => {
      expect(isEncryptedToken(encryptToken('some-token'))).toBe(true)
    })

    it('returns false for a short plaintext value that cannot hold IV+authTag', () => {
      expect(isEncryptedToken('short')).toBe(false)
    })

    it('returns false for invalid base64', () => {
      expect(isEncryptedToken('not valid base64!! @@@')).toBe(false)
    })
  })

  describe('safeDecryptToken', () => {
    it('decrypts a genuinely encrypted token', () => {
      const plaintext = 'legacy-migration-token'
      expect(safeDecryptToken(encryptToken(plaintext))).toBe(plaintext)
    })

    it('returns a short plaintext (legacy, unencrypted) token unchanged', () => {
      expect(safeDecryptToken('legacy-plain-token')).toBe('legacy-plain-token')
    })

    it('returns the original value unchanged if it looks encrypted but auth fails', () => {
      const tampered = flipByteAt(encryptToken('a-token'), IV_LENGTH + AUTH_TAG_LENGTH)
      // Falls back to returning the (tampered) value as-is rather than throwing.
      expect(safeDecryptToken(tampered)).toBe(tampered)
    })
  })
})
