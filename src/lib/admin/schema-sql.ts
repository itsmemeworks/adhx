/**
 * Tables behind the admin area's counts (docs/specs/admin.md). Shared by
 * `migrate.ts` and the test DDL, so both stay the same. Every statement is
 * idempotent.
 *
 * - `reaction_counts`: how many reactions each member sent per UTC day, by
 *   kind (an emoji's id, or `text` for words). Counts only: never the words,
 *   the post or the moment. User-linked (account guard; cleared with the
 *   account).
 * - `moment_log`: one row per live moment that formed: its slug, title, when
 *   it formed, how many members tuned in (first join each), the most watching
 *   at once, how many reactions were sent in it, and how many "it's live"
 *   alerts it sent and how many of those were opened. No user ids.
 */
export const ADMIN_COUNTS_DDL = `
  CREATE TABLE IF NOT EXISTS reaction_counts (
    day TEXT NOT NULL,
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, user_id, kind)
  );
  CREATE INDEX IF NOT EXISTS reaction_counts_user_idx ON reaction_counts(user_id, day);
  CREATE TABLE IF NOT EXISTS moment_log (
    slug TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    formed_at TEXT NOT NULL,
    tune_ins INTEGER NOT NULL DEFAULT 0,
    peak_watching INTEGER NOT NULL DEFAULT 0,
    reactions INTEGER NOT NULL DEFAULT 0,
    alerts INTEGER NOT NULL DEFAULT 0,
    alerts_opened INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS moment_log_formed_idx ON moment_log(formed_at);
`
