/**
 * Reactions kept on posts (`post_reactions`): an emoji from `REACTION_EMOJI`
 * or a few words (≤40 characters), one per row, exactly one of `emoji` /
 * `text`. Shared by `migrate.ts` and the test DDL, so both stay the same.
 * Every statement is idempotent. User-linked: the account guard covers
 * `user_id`, and account delete / clear remove the rows.
 */
export const POST_REACTIONS_DDL = `
  CREATE TABLE IF NOT EXISTS post_reactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    post_id TEXT NOT NULL,
    emoji TEXT,
    text TEXT,
    created_at TEXT NOT NULL,
    CHECK ((emoji IS NULL) != (text IS NULL))
  );
  CREATE INDEX IF NOT EXISTS post_reactions_post_idx ON post_reactions(platform, post_id, created_at);
  CREATE INDEX IF NOT EXISTS post_reactions_user_idx ON post_reactions(user_id);
`
