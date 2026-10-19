/** Admin hand-over needs time for two people; email delivery stays short-lived. */
export const EMAIL_LOGIN_TOKEN_TTL_MS = 15 * 60_000
export const ADMIN_LOGIN_TOKEN_TTL_MS = 60 * 60_000

export function loginTokenTtlMs(delivery: string | null): number {
  return delivery === 'admin' ? ADMIN_LOGIN_TOKEN_TTL_MS : EMAIL_LOGIN_TOKEN_TTL_MS
}
