import type { RankWindow } from '@/lib/discovery/rank'

/**
 * Per-window title/description copy for the /leaderboard pages.
 * Shared between `src/app/leaderboard/page.tsx` (week, the default) and
 * `src/app/leaderboard/[window]/page.tsx` (the other three windows) so
 * metadata, JSON-LD `name`/`description`, and the sr-only heading never
 * drift apart.
 *
 * Titles carry NO "— ADHX" suffix: the root layout's metadata template already
 * appends "| ADHX", so including it here rendered "Top playlists this week —
 * ADHX | ADHX" (spotted while checking the leaderboard's robots tag).
 */
export const WINDOW_COPY: Record<RankWindow, { title: string; description: string }> = {
  day: {
    title: 'Top playlists today',
    description: 'The most-watched public playlists on ADHX today, ranked by views and saves.',
  },
  week: {
    title: 'Top playlists this week',
    description: 'The most-watched public playlists on ADHX this week, ranked by views and saves.',
  },
  month: {
    title: 'Top playlists this month',
    description: 'The most-watched public playlists on ADHX this month, ranked by views and saves.',
  },
  all: {
    title: 'Top playlists, all-time',
    description: 'The all-time most-watched public playlists on ADHX, ranked by views and saves.',
  },
}
