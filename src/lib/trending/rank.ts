import type { TheaterItem } from '@/components/theater/types'

/**
 * Pure ranking rule for the dark ranked list ("Top today"): highest
 * `trendCount` first, ties broken by newest `createdAt`. Shared by live
 * `/trending` and the frozen `/trending/archive/[week]` pages so they
 * cannot drift.
 */
export function rankItems<T extends Pick<TheaterItem, 'trendCount' | 'createdAt'>>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => {
    const d = (b.trendCount ?? 0) - (a.trendCount ?? 0)
    if (d !== 0) return d
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })
}
