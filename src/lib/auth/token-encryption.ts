import crypto from 'crypto'

/**
 * Token encryption utilities for securing OAuth tokens at rest.
 * Uses AES-256-GCM for authenticated encryption.
 */

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16

// Derive encryption key from SESSION_SECRET
function getEncryptionKey(): Buffer {
  const secret = process.env.SESSION_SECRET || process.env.TWITTER_CLIENT_SECRET
  if (!secret) {
    throw new Error('SESSION_SECRET or TWITTER_CLIENT_SECRET must be set for token encryption')
  }
  // Use scrypt for key derivation (OWASP recommended)
  return crypto.scryptSync(secret, 'oauth-token-encryption-salt', 32)
}

/**
 * Encrypt a token using AES-256-GCM
 * Output format: base64(IV + AuthTag + Ciphertext)
 */
export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey()
  const iv = crypto.randomBytes(IV_LENGTH)

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  // Combine: IV (16) + AuthTag (16) + Ciphertext
  const combined = Buffer.concat([iv, authTag, encrypted])
  return combined.toString('base64')
}

/**
 * Decrypt a token encrypted with encryptToken
 */
export function decryptToken(ciphertext: string): string {
  const key = getEncryptionKey()
  const combined = Buffer.from(ciphertext, 'base64')

  // Extract components
  const iv = combined.subarray(0, IV_LENGTH)
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH)

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ])

  return decrypted.toString('utf8')
}

/**
 * Check if a string looks like an encrypted token (base64 with expected length)
 * Used for migration: detect if tokens are already encrypted
 */
export function isEncryptedToken(value: string): boolean {
  try {
    const decoded = Buffer.from(value, 'base64')
    // Minimum length: IV (16) + AuthTag (16) + at least 1 byte ciphertext
    return decoded.length >= IV_LENGTH + AUTH_TAG_LENGTH + 1
  } catch {
    return false
  }
}

/**
 * Safely decrypt a token that may or may not be encrypted
 * Returns the token as-is if decryption fails (for migration compatibility)
 */
export function safeDecryptToken(value: string): string {
  // If it doesn't look encrypted, return as-is (legacy plaintext token)
  if (!isEncryptedToken(value)) {
    return value
  }

  try {
    return decryptToken(value)
  } catch {
    // Decryption failed - likely a plaintext token that happens to be valid base64
    return value
  }
}
