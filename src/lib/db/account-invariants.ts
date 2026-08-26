import type Database from 'better-sqlite3'

type AccountReference = {
  column: string
  nullable?: boolean
}

type AccountGuard = {
  table: string
  references: AccountReference[]
}

const ACCOUNT_GUARDS: AccountGuard[] = [
  { table: 'bookmarks', references: [{ column: 'user_id' }] },
  { table: 'bookmark_media', references: [{ column: 'user_id' }] },
  { table: 'bookmark_links', references: [{ column: 'user_id' }] },
  { table: 'bookmark_tags', references: [{ column: 'user_id' }] },
  { table: 'archived_posts', references: [{ column: 'user_id' }] },
  { table: 'sync_logs', references: [{ column: 'user_id' }] },
  { table: 'user_preferences', references: [{ column: 'user_id' }] },
  { table: 'oauth_tokens', references: [{ column: 'user_id' }] },
  { table: 'tag_shares', references: [{ column: 'user_id' }] },
  { table: 'user_identities', references: [{ column: 'user_id' }] },
  { table: 'username_aliases', references: [{ column: 'user_id' }] },
  { table: 'login_tokens', references: [{ column: 'user_id', nullable: true }] },
  { table: 'activity', references: [{ column: 'user_id', nullable: true }] },
  { table: 'analytics_events', references: [{ column: 'user_id', nullable: true }] },
  {
    table: 'collection_events',
    references: [{ column: 'owner_user_id' }, { column: 'viewer_id', nullable: true }],
  },
  { table: 'collection_aggregates', references: [{ column: 'owner_user_id' }] },
  { table: 'moderated_posts', references: [{ column: 'created_by' }] },
  {
    table: 'user_bans',
    references: [{ column: 'user_id' }, { column: 'created_by' }],
  },
  { table: 'admin_audit', references: [{ column: 'actor_user_id' }] },
]

const LEGACY_ADMIN_BOOTSTRAP_KEY = 'admin_roles_bootstrapped_v1'
const LEGACY_ADMIN_REJECTION_PREFIX = 'admin_roles_bootstrap_rejected_v1:'

function missingAccountCondition(reference: AccountReference, row = 'NEW'): string {
  const value = `${row}.${reference.column}`
  const missing = `NOT EXISTS (SELECT 1 FROM users WHERE id = ${value})`
  return reference.nullable ? `(${value} IS NOT NULL AND ${missing})` : `(${missing})`
}

function changedToMissingAccountCondition(reference: AccountReference): string {
  return `(NEW.${reference.column} IS NOT OLD.${reference.column} AND ${missingAccountCondition(reference)})`
}

/**
 * Installs database-enforced account references without rebuilding historical
 * tables or enabling cascading foreign keys. Existing rows are deliberately
 * untouched; every future insert, and every update that changes an account-id
 * column, must reference a live `users` row.
 */
export function installAccountWriteGuards(db: Database.Database): void {
  const install = db.transaction(() => {
    for (const guard of ACCOUNT_GUARDS) {
      const insertCondition = guard.references
        .map((reference) => missingAccountCondition(reference))
        .join(' OR ')
      const updateCondition = guard.references
        .map((reference) => changedToMissingAccountCondition(reference))
        .join(' OR ')
      const updateColumns = guard.references.map((reference) => reference.column).join(', ')

      db.exec(`
        CREATE TRIGGER IF NOT EXISTS guard_${guard.table}_account_insert
        BEFORE INSERT ON ${guard.table}
        WHEN ${insertCondition}
        BEGIN
          SELECT RAISE(ABORT, 'account reference does not exist');
        END;

        CREATE TRIGGER IF NOT EXISTS guard_${guard.table}_account_update
        BEFORE UPDATE OF ${updateColumns} ON ${guard.table}
        WHEN ${updateCondition}
        BEGIN
          SELECT RAISE(ABORT, 'account reference does not exist');
        END;
      `)
    }
  })
  install()
}

function parseCsv(value: string | undefined, lowercase: boolean): string[] {
  const values = (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => (lowercase ? entry.toLowerCase() : entry))
  return [...new Set(values)].sort()
}

function migrationState(db: Database.Database, key: string): string | null {
  const row = db.prepare('SELECT value FROM migration_state WHERE key = ?').get(key) as
    { value: string } | undefined
  return row?.value ?? null
}

function writeMigrationState(db: Database.Database, key: string, value: string): void {
  db.prepare(
    `INSERT INTO migration_state (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(key, value, new Date().toISOString())
}

function rejectionStateKey(usernames: string[]): string {
  return `${LEGACY_ADMIN_REJECTION_PREFIX}${JSON.stringify(usernames)}`
}

export class LegacyAdminBootstrapError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LegacyAdminBootstrapError'
  }
}

export type AdminBootstrapResult = {
  legacyPromoted: number
  idPromoted: number
}

/**
 * Converts the legacy username allowlist once, but only when every configured
 * username resolves in the same transaction. A failed configuration is
 * durably fingerprinted before startup aborts, so a later claimant of an
 * unresolved username cannot silently gain admin on a subsequent boot.
 *
 * Recovery is explicit: remove/fix ADMIN_USERNAMES and use immutable
 * ADMIN_USER_IDS. ID grants remain safe to retry on every startup.
 */
export function applyAdminRoleBootstrap(
  db: Database.Database,
  options: { adminUsernames?: string; adminUserIds?: string },
): AdminBootstrapResult {
  const usernames = parseCsv(options.adminUsernames, true)
  const userIds = parseCsv(options.adminUserIds, false)
  let legacyPromoted = 0

  if (migrationState(db, LEGACY_ADMIN_BOOTSTRAP_KEY) !== '1' && usernames.length > 0) {
    const rejectedKey = rejectionStateKey(usernames)
    if (migrationState(db, rejectedKey) === '1') {
      throw new LegacyAdminBootstrapError(
        'ADMIN_USERNAMES was previously rejected and will not be resolved again; remove it and grant immutable ADMIN_USER_IDS instead',
      )
    }

    const placeholders = usernames.map(() => '?').join(', ')
    const matchingUsers = db
      .prepare(
        `SELECT id, lower(username) AS username FROM users WHERE lower(username) IN (${placeholders})`,
      )
      .all(...usernames) as Array<{ id: string; username: string }>
    const matchedNames = new Set(matchingUsers.map((user) => user.username))
    const missingNames = usernames.filter((username) => !matchedNames.has(username))

    if (missingNames.length > 0) {
      writeMigrationState(db, rejectedKey, '1')
      throw new LegacyAdminBootstrapError(
        `ADMIN_USERNAMES bootstrap rejected; no roles changed because these usernames did not resolve: ${missingNames.join(', ')}`,
      )
    }

    const promote = db.prepare("UPDATE users SET role = 'admin' WHERE id = ?")
    db.transaction(() => {
      for (const user of matchingUsers) legacyPromoted += promote.run(user.id).changes
      writeMigrationState(db, LEGACY_ADMIN_BOOTSTRAP_KEY, '1')
    })()
  }

  const promoteById = db.prepare("UPDATE users SET role = 'admin' WHERE id = ?")
  const idPromoted = db.transaction(() =>
    userIds.reduce((count, userId) => count + promoteById.run(userId).changes, 0),
  )()

  return { legacyPromoted, idPromoted }
}
