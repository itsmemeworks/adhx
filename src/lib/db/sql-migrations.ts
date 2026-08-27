import type Database from 'better-sqlite3'

const STATEMENT_BREAKPOINT = '--> statement-breakpoint'
const PLATFORM_MIGRATION_TAG = '0003_add_platform_column'
const PLATFORM_TABLES = [
  'bookmark_links',
  'bookmark_media',
  'bookmark_tags',
  'bookmarks',
  'collection_tweets',
  'read_status',
] as const
const PLATFORM_TEMP_TABLES = [
  '__new_bookmark_media',
  '__new_bookmark_tags',
  '__new_bookmarks',
  '__new_collection_tweets',
  '__new_read_status',
] as const
const PLATFORM_PRIMARY_KEYS: Record<string, string[]> = {
  bookmark_media: ['user_id', 'platform', 'id'],
  bookmark_tags: ['user_id', 'platform', 'bookmark_id', 'tag'],
  bookmarks: ['user_id', 'platform', 'id'],
  collection_tweets: ['user_id', 'collection_id', 'platform', 'bookmark_id'],
  read_status: ['user_id', 'platform', 'bookmark_id'],
}
const PLATFORM_INDEXES: Record<
  string,
  Array<{ name: string; columns: string[]; unique: boolean }>
> = {
  bookmark_links: [
    {
      name: 'bookmark_links_user_bookmark_idx',
      columns: ['user_id', 'platform', 'bookmark_id'],
      unique: false,
    },
  ],
  bookmark_media: [
    {
      name: 'bookmark_media_user_bookmark_idx',
      columns: ['user_id', 'platform', 'bookmark_id'],
      unique: false,
    },
  ],
  bookmark_tags: [
    {
      name: 'bookmark_tags_user_id_idx',
      columns: ['user_id'],
      unique: false,
    },
  ],
  bookmarks: [
    { name: 'bookmarks_user_id_idx', columns: ['user_id'], unique: false },
    { name: 'bookmarks_processed_at_idx', columns: ['processed_at'], unique: false },
    {
      name: 'bookmarks_user_processed_at_idx',
      columns: ['user_id', 'processed_at'],
      unique: false,
    },
    {
      name: 'bookmarks_user_category_idx',
      columns: ['user_id', 'category'],
      unique: false,
    },
    {
      name: 'bookmarks_user_platform_idx',
      columns: ['user_id', 'platform'],
      unique: false,
    },
    {
      name: 'bookmarks_user_quoted_tweet_idx',
      columns: ['user_id', 'quoted_tweet_id'],
      unique: false,
    },
  ],
  read_status: [
    {
      name: 'read_status_user_id_idx',
      columns: ['user_id'],
      unique: false,
    },
  ],
}

export interface SqlMigration {
  tag: string
  sql: string
}

export interface MigrationStatementContext {
  tag: string
  statement: string
  statementIndex: number
}

export interface RunSqlMigrationsOptions {
  beforeStatement?: (context: MigrationStatementContext) => void
  now?: () => number
}

export interface SqlMigrationResult {
  tag: string
  status: 'adopted' | 'applied' | 'skipped'
}

export class SqlMigrationError extends Error {
  readonly tag: string

  constructor(tag: string, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'SqlMigrationError'
    this.tag = tag
  }
}

export class PartialSqlMigrationError extends SqlMigrationError {
  constructor(tag: string, details: string[]) {
    super(
      tag,
      `Detected a likely partial ${tag} migration without a journal row (${details.join(
        ', ',
      )}). Automatic replay is unsafe because this legacy table-rebuild migration is not idempotent. Restore the database from a pre-migration backup, or verify and repair the schema manually before recording the migration as applied.`,
    )
    this.name = 'PartialSqlMigrationError'
  }
}

export class ForeignKeysPragmaError extends SqlMigrationError {
  constructor(tag: string, message: string) {
    super(tag, message)
    this.name = 'ForeignKeysPragmaError'
  }
}

export function ensureDrizzleMigrationsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY,
      hash TEXT NOT NULL,
      created_at INTEGER
    );
  `)
}

function splitMigrationSql(
  tag: string,
  sql: string,
): {
  statements: string[]
  changesForeignKeys: boolean
} {
  const statements: string[] = []
  const foreignKeysDirectives: Array<{ position: number; value: 'OFF' | 'ON' }> = []
  const chunks = sql
    .split(STATEMENT_BREAKPOINT)
    .map((chunk) => chunk.trim())
    .filter(Boolean)

  chunks.forEach((statement, position) => {
    if (/\bPRAGMA\s+foreign_keys\b/i.test(statement)) {
      const match = statement.match(/^PRAGMA\s+foreign_keys\s*=\s*(OFF|ON)\s*;?$/i)
      if (!match) {
        throw new ForeignKeysPragmaError(
          tag,
          `${tag} contains a foreign_keys PRAGMA mixed with other SQL or using an unsupported form`,
        )
      }
      foreignKeysDirectives.push({
        position,
        value: match[1].toUpperCase() as 'OFF' | 'ON',
      })
      return
    }

    statements.push(statement)
  })

  if (
    foreignKeysDirectives.length !== 0 &&
    (foreignKeysDirectives.length !== 2 ||
      foreignKeysDirectives[0].value !== 'OFF' ||
      foreignKeysDirectives[0].position !== 0 ||
      foreignKeysDirectives[1].value !== 'ON' ||
      foreignKeysDirectives[1].position !== chunks.length - 1)
  ) {
    throw new ForeignKeysPragmaError(
      tag,
      `${tag} must contain either no foreign_keys PRAGMA or exactly one OFF/ON pair bracketing all SQL`,
    )
  }

  return {
    statements,
    changesForeignKeys: foreignKeysDirectives.length === 2,
  }
}

function tableNames(db: Database.Database): Set<string> {
  return new Set(
    (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{
        name: string
      }>
    ).map((row) => row.name),
  )
}

interface TableInfoRow {
  name: string
  type: string
  notnull: number
  dflt_value: string | null
  pk: number
}

interface IndexListRow {
  name: string
  unique: number
}

interface IndexInfoRow {
  seqno: number
  name: string
}

function tableInfo(db: Database.Database, table: string): TableInfoRow[] {
  return db.prepare(`PRAGMA table_info("${table}")`).all() as TableInfoRow[]
}

function sameOrderedColumns(actual: string[], expected: string[]): boolean {
  return (
    actual.length === expected.length && actual.every((column, index) => column === expected[index])
  )
}

/**
 * The old runner committed each statement in 0003 separately. Once its first
 * ADD COLUMN or table rebuild committed, replaying 0003 would fail or overwrite
 * the only surviving copy of a table. A complete fingerprint can be adopted
 * without replay; every other artifact-bearing state must stop.
 */
function platformMigrationState(
  db: Database.Database,
): { state: 'complete' | 'partial'; mismatches: string[] } | { state: 'pristine' } {
  const tables = tableNames(db)
  const mismatches: string[] = []
  const missingTables: string[] = []
  let hasArtifacts = false

  for (const table of PLATFORM_TEMP_TABLES) {
    if (tables.has(table)) {
      hasArtifacts = true
      mismatches.push(`temporary table ${table} still exists`)
    }
  }

  for (const table of PLATFORM_TABLES) {
    if (!tables.has(table)) {
      mismatches.push(`table ${table} is missing`)
      missingTables.push(table)
      continue
    }

    const columns = tableInfo(db, table)
    const platform = columns.find((column) => column.name === 'platform')
    if (!platform) {
      mismatches.push(`${table}.platform is missing`)
    } else {
      hasArtifacts = true
      if (platform.type.trim().toUpperCase() !== 'TEXT') {
        mismatches.push(`${table}.platform type is ${platform.type || '(empty)'}, expected TEXT`)
      }
      if (platform.notnull !== 1) {
        mismatches.push(`${table}.platform is nullable, expected NOT NULL`)
      }
      if (platform.dflt_value !== "'twitter'") {
        mismatches.push(
          `${table}.platform default is ${platform.dflt_value ?? 'NULL'}, expected 'twitter'`,
        )
      }
    }

    const expectedPrimaryKey = PLATFORM_PRIMARY_KEYS[table]
    if (expectedPrimaryKey) {
      const actualPrimaryKey = columns
        .filter((column) => column.pk > 0)
        .sort((left, right) => left.pk - right.pk)
        .map((column) => column.name)
      if (!sameOrderedColumns(actualPrimaryKey, expectedPrimaryKey)) {
        mismatches.push(
          `${table} primary key is (${actualPrimaryKey.join(', ')}), expected (${expectedPrimaryKey.join(', ')})`,
        )
      }
    }

    const indexes = db.prepare(`PRAGMA index_list("${table}")`).all() as IndexListRow[]
    for (const expectedIndex of PLATFORM_INDEXES[table] ?? []) {
      const actualIndex = indexes.find((index) => index.name === expectedIndex.name)
      if (!actualIndex) {
        mismatches.push(`index ${expectedIndex.name} is missing`)
        continue
      }

      const actualColumns = (
        db.prepare(`PRAGMA index_info("${expectedIndex.name}")`).all() as IndexInfoRow[]
      )
        .sort((left, right) => left.seqno - right.seqno)
        .map((column) => column.name)
      if (!sameOrderedColumns(actualColumns, expectedIndex.columns)) {
        mismatches.push(
          `index ${expectedIndex.name} columns are (${actualColumns.join(', ')}), expected (${expectedIndex.columns.join(', ')})`,
        )
      }
      if (Boolean(actualIndex.unique) !== expectedIndex.unique) {
        mismatches.push(
          `index ${expectedIndex.name} uniqueness is ${Boolean(actualIndex.unique)}, expected ${expectedIndex.unique}`,
        )
      }
    }
  }

  if (!hasArtifacts) {
    // The old statement-at-a-time runner could crash immediately after
    // DROP INDEX. With every source table still present and no platform/temp
    // artifacts, replay is safe: the drop is idempotent and the new runner
    // wraps every later statement plus the journal insert in one transaction.
    if (missingTables.length === 0) {
      return { state: 'pristine' }
    }
  }

  return mismatches.length > 0
    ? { state: 'partial', mismatches }
    : { state: 'complete', mismatches: [] }
}

function foreignKeysEnabled(db: Database.Database): boolean {
  return Number(db.pragma('foreign_keys', { simple: true })) === 1
}

function setForeignKeys(db: Database.Database, enabled: boolean): void {
  db.pragma(`foreign_keys = ${enabled ? 'ON' : 'OFF'}`)
  if (foreignKeysEnabled(db) !== enabled) {
    throw new Error(`SQLite refused to set foreign_keys=${enabled ? 'ON' : 'OFF'}`)
  }
}

function applyMigration(
  db: Database.Database,
  migration: SqlMigration,
  options: RunSqlMigrationsOptions,
): void {
  const { statements, changesForeignKeys } = splitMigrationSql(migration.tag, migration.sql)

  if (db.inTransaction) {
    throw new SqlMigrationError(
      migration.tag,
      `Cannot apply ${migration.tag} while the connection is already in a transaction`,
    )
  }

  const originalForeignKeys = foreignKeysEnabled(db)
  let executionError: unknown

  try {
    if (changesForeignKeys) setForeignKeys(db, false)

    db.transaction(() => {
      statements.forEach((statement, statementIndex) => {
        options.beforeStatement?.({
          tag: migration.tag,
          statement,
          statementIndex,
        })
        db.exec(statement)
      })

      db.prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)').run(
        migration.tag,
        (options.now ?? Date.now)(),
      )
    })()
  } catch (error) {
    executionError = error
  }

  let restoreError: unknown
  try {
    if (changesForeignKeys) setForeignKeys(db, originalForeignKeys)
  } catch (error) {
    restoreError = error
  }

  if (executionError || restoreError) {
    const cause =
      executionError && restoreError
        ? new AggregateError(
            [executionError, restoreError],
            'Migration failed and foreign_keys restoration also failed',
          )
        : (executionError ?? restoreError)
    throw new SqlMigrationError(migration.tag, `Failed to apply SQL migration ${migration.tag}`, {
      cause,
    })
  }
}

function adoptMigration(
  db: Database.Database,
  migration: SqlMigration,
  options: RunSqlMigrationsOptions,
): void {
  if (db.inTransaction) {
    throw new SqlMigrationError(
      migration.tag,
      `Cannot adopt ${migration.tag} while the connection is already in a transaction`,
    )
  }

  try {
    db.transaction(() => {
      db.prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)').run(
        migration.tag,
        (options.now ?? Date.now)(),
      )
    })()
  } catch (error) {
    throw new SqlMigrationError(
      migration.tag,
      `Failed to adopt completed SQL migration ${migration.tag}`,
      { cause: error },
    )
  }
}

/**
 * Applies migrations in the caller-provided journal order. Every migration's
 * SQL and journal insert commit together or roll back together.
 */
export function runSqlMigrations(
  db: Database.Database,
  migrations: SqlMigration[],
  options: RunSqlMigrationsOptions = {},
): SqlMigrationResult[] {
  ensureDrizzleMigrationsTable(db)

  const applied = new Set(
    (db.prepare('SELECT hash FROM __drizzle_migrations').all() as Array<{ hash: string }>).map(
      (row) => row.hash,
    ),
  )
  const results: SqlMigrationResult[] = []

  for (const migration of migrations) {
    if (applied.has(migration.tag)) {
      results.push({ tag: migration.tag, status: 'skipped' })
      continue
    }

    if (migration.tag === PLATFORM_MIGRATION_TAG) {
      const state = platformMigrationState(db)
      if (state.state === 'partial') {
        throw new PartialSqlMigrationError(migration.tag, state.mismatches)
      }
      if (state.state === 'complete') {
        adoptMigration(db, migration, options)
        applied.add(migration.tag)
        results.push({ tag: migration.tag, status: 'adopted' })
        continue
      }
    }

    applyMigration(db, migration, options)
    applied.add(migration.tag)
    results.push({ tag: migration.tag, status: 'applied' })
  }

  return results
}
