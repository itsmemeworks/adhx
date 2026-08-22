/**
 * TikTok video ids are Snowflake-style: the high 32 bits are the Unix
 * creation time in seconds — so a video's real post date is recoverable from
 * the id alone, no metadata fetch needed. This is why saved TikToks can show
 * an honest post age even though tnktok's metadata carries no date field.
 *
 * Pure and dependency-free (client- and server-safe). Returns null for
 * anything that doesn't parse or lands outside a ~2014–2096 sanity window.
 */
export function tiktokCreatedAtFromId(id: string): string | null {
  try {
    const secs = Number(BigInt(id) >> BigInt(32))
    if (secs < 1_400_000_000 || secs > 4_000_000_000) return null
    return new Date(secs * 1000).toISOString()
  } catch {
    return null
  }
}
