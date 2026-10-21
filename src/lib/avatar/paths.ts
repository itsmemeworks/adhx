/** Where a member's own picture is served (`/api/files/avatar/<hash>`). No imports, so anything can use it. */
export const AVATAR_URL_PREFIX = '/api/files/avatar/'

/** Is this picture one stored on this server (an upload or a Gob), not the X photo? */
export function isOwnPicture(avatarUrl: string | null | undefined): boolean {
  return !!avatarUrl?.startsWith(AVATAR_URL_PREFIX)
}
