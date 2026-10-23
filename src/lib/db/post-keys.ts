import { and, eq, inArray, or, sql, type SQL, type SQLWrapper } from 'drizzle-orm'

export type PostKey = { platform: string; id: string }
export const POST_KEY_BATCH = 400

/** Post identity includes its network. At most 800 parameters per batch,
 * leaving room for caller filters below SQLite's historical 999 limit. */
export function postKeyBatches(keys: readonly (PostKey | string)[]): PostKey[][] {
  const unique = new Map<string, PostKey>()
  for (const key of keys) {
    const at = typeof key === 'string' ? key.indexOf(':') : -1
    const ref =
      typeof key === 'string' ? { platform: key.slice(0, at), id: key.slice(at + 1) } : key
    if (typeof key === 'string' && at < 1) continue
    unique.set(`${ref.platform}:${ref.id}`, ref)
  }
  const refs = [...unique.values()]
  const batches: PostKey[][] = []
  for (let i = 0; i < refs.length; i += POST_KEY_BATCH)
    batches.push(refs.slice(i, i + POST_KEY_BATCH))
  return batches
}

/** Match each platform's ids together so composite indexes can seek directly.
 * Independent `platform IN` and `id IN` predicates would include crossed keys. */
export function postKeyWhere(platform: SQLWrapper, id: SQLWrapper, keys: readonly PostKey[]): SQL {
  const grouped = new Map<string, string[]>()
  for (const key of keys) grouped.set(key.platform, [...(grouped.get(key.platform) ?? []), key.id])
  return (
    or(...[...grouped].map(([network, ids]) => and(eq(platform, network), inArray(id, ids)))) ??
    sql`0`
  )
}

export type OwnedPostKey = PostKey & { userId: string }

export function ownedPostKeyBatches(keys: readonly OwnedPostKey[]): OwnedPostKey[][] {
  const unique = new Map(keys.map((key) => [`${key.userId}|${key.platform}:${key.id}`, key]))
  const refs = [...unique.values()]
  const batches: OwnedPostKey[][] = []
  for (let i = 0; i < refs.length; i += 250) batches.push(refs.slice(i, i + 250))
  return batches
}

/** Batch related rows across savers without broadening account isolation. */
export function ownedPostKeyWhere(
  user: SQLWrapper,
  platform: SQLWrapper,
  id: SQLWrapper,
  keys: readonly OwnedPostKey[],
): SQL {
  const owners = new Map<string, OwnedPostKey[]>()
  for (const key of keys) owners.set(key.userId, [...(owners.get(key.userId) ?? []), key])
  return (
    or(
      ...[...owners].map(([userId, refs]) =>
        and(eq(user, userId), postKeyWhere(platform, id, refs)),
      ),
    ) ?? sql`0`
  )
}
