import type { RankWindow } from '@/lib/discovery/rank'

/**
 * Per-window title/description copy for the /leaderboard pages.
 * Shared between `src/app/leaderboard/page.tsx` (week, the default) and
 * `src/app/leaderboard/[window]/page.tsx` (the other three windows) so
 * metadata, JSON-LD `name`/`description`, and the sr-only heading never
 * drift apart.
 */
export const WINDOW_COPY: Record<RankWindow, { title: string; description: string }> = {
  day: {
    title: 'Top collections today — ADHX',
    description: 'The most-watched public collections on ADHX today, ranked by views and saves.',
  },
  week: {
    title: 'Top collections this week — ADHX',
    description:
      'The most-watched public collections on ADHX this week, ranked by views and saves.',
  },
  month: {
    title: 'Top collections this month — ADHX',
    description:
      'The most-watched public collections on ADHX this month, ranked by views and saves.',
  },
  all: {
    title: 'Top collections, all-time — ADHX',
    description: 'The all-time most-watched public collections on ADHX, ranked by views and saves.',
  },
}
