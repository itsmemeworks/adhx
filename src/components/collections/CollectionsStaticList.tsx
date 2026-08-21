import type { LeaderboardEntry } from '@/lib/discovery/rank'

/**
 * Server-rendered, crawlable ranked list for the /collections leaderboard —
 * visually hidden (the podium + grid in `CollectionsBoard` is what users
 * see) but present in the HTML source with full rank/tag/curator/counts +
 * links, so search engines and no-JS clients get real content. Mirrors the
 * role `TrendingStaticList` plays for /trending.
 *
 * ANONYMITY: `LeaderboardEntry` never carries a raw userId — only the public
 * `username` — so nothing extra to guard here (see rank.ts's choke-point
 * comment).
 */
export function CollectionsStaticList({
  entries,
  heading,
}: {
  entries: LeaderboardEntry[]
  heading: string
}) {
  if (entries.length === 0) return null
  return (
    <section aria-label={heading} className="sr-only">
      <h2>{heading}</h2>
      <ol>
        {entries.map((entry) => (
          <li key={`${entry.username}:${entry.tag}`}>
            <a href={`/t/${entry.username}/${entry.tag}`}>
              <span>#{entry.rank}</span>
              <span>#{entry.tag}</span>
              <span>@{entry.username}</span>
              <span>
                {entry.itemCount} post{entry.itemCount === 1 ? '' : 's'}
              </span>
              <span>{entry.viewCount} views</span>
              <span>{entry.cloneCount} saves</span>
            </a>
          </li>
        ))}
      </ol>
    </section>
  )
}
