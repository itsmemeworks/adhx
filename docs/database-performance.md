# Database performance

The web and phone apps use the same server-side query helpers. Optimising
those helpers improves both clients. SQLite runs in WAL mode with one
connection per process; inference runs in separate model processes or on a
remote helper. No model work belongs in a database transaction.

This is a query-plan and synthetic growth audit, not a guarantee of a
particular number of concurrent users. It does not measure an operator's
NAS, network, disk, production content or production traffic.

## Query families and indexes

| Work                                                                                    | Access path                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign-in, pairing, account settings                                                      | Existing unique token/identity keys and owner-prefixed preference/access-key indexes.                                                                                                                                                                                |
| Saved lists and platform filters                                                        | `bookmarks_user_feed_idx(user_id, processed_at DESC, id DESC)` and `bookmarks_user_platform_feed_idx(user_id, platform, processed_at DESC, id DESC)`, aligned with the recent-save ordering.                                                                         |
| Savers, visibility, media, links, embeddings, extracted text and queue state for a page | Exact `(platform, post_id)` predicates, using existing post/primary keys; shared media and links also have post-prefixed indexes. Owner-owned rows retain `user_id` as well.                                                                                         |
| Search results, channels and feed hydration                                             | Bounded batches of exact owner/platform/post keys instead of two extra queries for each different saver. Related rows retain insertion order.                                                                                                                        |
| Tag channels                                                                            | `bookmark_tags_user_tag_idx(user_id, tag, platform, bookmark_id)`. The existing unique owner/platform/post/tag index still protects writes and serves per-post tags.                                                                                                 |
| Watched state, Who and last sitting                                                     | Existing owner/post primary key; new post/time and owner/time indexes for the reverse and latest-history reads.                                                                                                                                                      |
| Unread sends and per-post sends                                                         | Recipient/unread/time, sender/post/recipient and recipient/post/unread indexes.                                                                                                                                                                                      |
| Share queue, downloads and remote work                                                  | Existing due-work, status and lease keys; owner/status for phone-queue counts, file-path and conversion-source indexes for cleanup. Failed inference has small partial recent-time indexes, avoiding scans of successful vector/text history on the processing page. |
| Keyword search                                                                          | FTS5 `MATCH` and `bm25` remain the search path. `post_text_keys(platform, post_id)` locates FTS rowids for existence checks, replacements, result labels and last-save deletion.                                                                                     |
| Feed candidates and affinity                                                            | Recent shared saves have a partial time index excluding private/quoted copies. Affinity matches a deduplicated set of the viewer's saves/views rather than two correlated lookups per other save. Grouping and ranking still depend on history size.                 |
| Reactions                                                                               | Existing post/time and owner indexes. Rank narrow identity/time rows, page them, then read note/avatar payloads for the selected rows. Exact totals still inspect matching history.                                                                                  |
| Right now                                                                               | Recent shared-save index, exact-platform visibility/naming batches, explicit rowid tie order so index changes cannot reorder simultaneous saves before seeded grouping.                                                                                              |
| Member directory, channel rebuilds, progress and admin totals                           | Owner/post/status indexes help joins, but exact aggregate totals and rebuilds still read the matching set. These are not constant-time operations.                                                                                                                   |

`src/lib/db/query-indexes.ts` owns the startup index changes;
`src/lib/db/schema.ts` describes the same indexes for Drizzle. Shorter
indexes superseded by these prefix-compatible replacements and exact legacy
duplicate indexes are removed, limiting write/storage overhead. Constraints
and unique indexes are retained.

### Bounded point lookups

`src/lib/db/post-keys.ts` groups each platform with its own IDs. Separate
`platform IN (...)` and `id IN (...)` filters would create crossed matches.
Shared batches contain at most 400 keys; owner-scoped related-row batches
contain at most 250, leaving room below the historical 999-parameter limit.
Callers still apply ownership, visibility, ban and moderation filters. An
index is never a substitute for those filters.

### Keyword metadata

FTS5's `platform` and `post_id` columns are deliberately `UNINDEXED`.
Filtering those columns directly walks the virtual table. A normal B-tree
lookup now maps each post to its FTS rowid. Writes update both in one
transaction. Last-save deletion uses that lookup and removes both; another
network with the same ID and other savers' copies remain intact.

Startup creates and backfills this lookup once, preserving existing FTS
rowids, text and any historical duplicates. A migration receipt prevents
rescanning FTS on every restart. Trigger replacement and lookup creation
are atomic; startup fails if they cannot be completed safely. Later
replacements consolidate a post's old rows into its current document.

### Planner statistics

After schema/index changes, startup runs bounded `PRAGMA optimize=0x10002`.
Active connections defer another `PRAGMA optimize` at most once per six
hours of reuse, so bulk imports do not leave planner estimates stale
forever. This maintenance has a temporary 50 ms writer-lock wait, restores
the normal timeout, and skips failed/busy attempts. The 50 ms setting is a
lock-wait bound, not a total execution deadline. There is no idle timer or
new service. The bundled SQLite is newer than 3.46, which bounds the
analysis work done by this pragma.

## Reproduce the audit

The suite traces real production helpers, creates a disposable database
using the real startup migration, seeds synthetic data, runs each case
three times and records its median, statement count and `EXPLAIN QUERY
PLAN`. It never opens an existing library or downloads/runs models.

```bash
pnpm exec vitest run src/__tests__/db/query-performance.test.ts

# Larger fixture, including full-width vectors and reaction history.
ADHX_QUERY_ROWS=100000 ADHX_QUERY_USERS=100 ADHX_QUERY_VECTOR_DIMS=768 \
  ADHX_QUERY_REPORT=/tmp/adhx-query-report.json \
  pnpm exec vitest run src/__tests__/db/query-performance.test.ts
```

Default dimensions are two for fast query-plan regressions, not realistic
vector-processing timings. Supported fixture bounds are 2,000–200,000 saves,
4–1,000 users and 1–1,024 dimensions. The fixture has two networks, overlapping
savers, private copies, media, tags, views, yearly watch counts, sends, text and reaction history.
It is deliberately not a production workload distribution.

On 22 October 2026, a local Mac with SQLite 3.53.4, 100,000 saves and 100
synthetic users showed these changes under identical two-dimensional
fixtures:

| Operation                         | Before                          | After                           |
| --------------------------------- | ------------------------------- | ------------------------------- |
| Hydrate 40 posts from many savers | 86 statements; 8.25 ms median   | 8 statements; 4.48 ms median    |
| Fresh first feed page             | 95 statements; 200.62 ms median | 67 statements; 138.12 ms median |

The expanded full-width run (768 dimensions, the same 100,000 saves/100 users,
plus reaction and yearly-watch history) passed all 23 cases. Medians included
6.21 ms for hydration, 4.70 ms for processing status, 0.12 ms for own play
counts and 228.20 ms for a fresh feed page. The global reactions page still
took 252.18 ms: its exact ranking/count work remains a growth limit. Keyword
existence was 0.03 ms with the lookup versus 6.08 ms for the old unindexed
metadata query in that same fixture. These full-width numbers are not
directly comparable to the simpler before/after table above.

These are warm local helper timings, not HTTP latencies or NAS targets.
Individual sub-millisecond lookups varied in either direction; the reliable
improvements are bounded query counts, indexed point access and removal of
unindexed FTS metadata scans. The benchmark does not require fragile timing
thresholds in CI. It asserts lookup plans, batching, latest-history ordering,
failure-history indexes and the hydration statement budget instead.

Additional regressions verify cross-network and cross-owner isolation,
affinity equivalence, transactional keyword rollback, legacy FTS rowid
preservation, repeated upgrades and last-saver cleanup. The existing released
upgrade/rollback rehearsal still checks account, auth, queue and media data.

## Remaining growth limits

- Feed candidate grouping, affinity, member counts, channel rebuilds and
  exact reaction totals still inspect sets that grow with content. Narrower
  rows and indexes help but do not remove that work.
- Semantic scoring uses an in-memory reduced-dimension vector scan plus
  full-width reranking. A B-tree cannot accelerate similarity scoring. Very
  large libraries will need an ANN design with measured recall and privacy
  filtering, not another ordinary SQL index.
- Some lists retain exact totals and offset paging. Deep pages cost more;
  keyset pagination would require coordinated web/phone API changes.
- SQLite has one writer. Keep transactions short, retain WAL and worker
  leases, and measure lock waits under representative simultaneous imports,
  queue completions and reads. Do not run several server replicas against
  one shared network-filesystem database.
- Extra indexes use disk and add write work. Re-run the audit after changing
  query shape or scale. Measure end-to-end tail latency and event-loop delay
  before adding more indexes, aggregate caches or moving database engines.

For installation, follow the normal [backup and update procedure](../deploy/nas/README.md).
The first startup needs time and free disk to build indexes and the lookup;
it does not reset a library or require reprocessing media. No live database
is modified by running this audit or by opening the associated PR.
