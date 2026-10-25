/**
 * How many times each member watched each post (`post_watch_counts`): plays,
 * finishes and seconds watched, added up per calendar year (UTC) so a year's
 * Wrapped reads one year's rows. Shared by `migrate.ts` and the test DDL, so
 * both stay the same. Every statement is idempotent. Never pruned: counting
 * started the day this shipped, and Wrapped needs the whole year.
 * User-linked: the account guard covers `user_id`, and account delete / clear
 * remove the rows.
 */
export const POST_WATCH_COUNTS_DDL = `
  CREATE TABLE IF NOT EXISTS post_watch_counts (
    user_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    post_id TEXT NOT NULL,
    year INTEGER NOT NULL,
    plays INTEGER NOT NULL DEFAULT 0,
    finishes INTEGER NOT NULL DEFAULT 0,
    seconds INTEGER NOT NULL DEFAULT 0,
    first_at TEXT NOT NULL,
    last_at TEXT NOT NULL,
    PRIMARY KEY (user_id, platform, post_id, year)
  );
  CREATE INDEX IF NOT EXISTS post_watch_counts_post_idx ON post_watch_counts(platform, post_id);
  CREATE INDEX IF NOT EXISTS post_watch_counts_user_year_idx ON post_watch_counts(user_id, year);
  -- Receipts contain no post ids or viewing history. Kept with the account
  -- so an offline retry never starts counting again after a receipt TTL.
  CREATE TABLE IF NOT EXISTS watch_batch_receipts (
    user_id TEXT NOT NULL,
    batch_id TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    PRIMARY KEY (user_id, batch_id)
  ) WITHOUT ROWID;
`
