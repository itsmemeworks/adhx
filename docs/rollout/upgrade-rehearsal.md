# Database upgrade and recovery rehearsal

Run this before cutting a self-hosted release that changes SQLite storage or
background queues. It is an automated rehearsal using synthetic data in a fresh
temporary directory. It cannot accept a live database path and does not connect
to a running ADHX instance, fetch posts, download models or run inference.

```bash
pnpm install --frozen-lockfile
node scripts/verify-upgrade.mjs
```

The full rehearsal reads **v2.1.2's actual startup migration** from immutable
commit `f5d6b37d67df5354ad10e2c97fbf4291d9483094`, using `git archive` to extract
its source into the temporary directory. That Git object must be available
locally; if it is absent in a shallow checkout, fetch the `v2.1.2` tag first.
Released source runs against the installed SQLite runtime, which also checks
that the current runtime can read and migrate the older schema.

The command fails on any mismatch and prints one JSON result on success. All
temporary databases and files are removed on success or failure. Operator
credentials and admin grants are excluded from the child processes.

## What it verifies

1. Create the old schema by executing the released startup migration. Check
   that its schema matches the checked-in release fixture used by offline CI.
2. Seed two accounts, separate email identities, an X connection with synthetic
   tokens, paired-phone keys, preferences, account-owned tags and eight saves.
   A shared post has two independent savers. No actual user information is used.
3. Seed waiting, interrupted, failed and completed phone receipts; pending,
   leased, deferred and failed understanding work; pending, expired and failed
   video conversions; and partial video-index progress. Three tiny synthetic
   retained files exercise metadata and recovery without expensive decoding.
4. Take a SQLite online backup while committed data is still in WAL mode. Take
   a coordinated copy of the unchanged synthetic media directory.
5. Run current startup migrations twice. Compare all original columns and
   values, account approval/public-save defaults, SQLite integrity, actual
   foreign keys and complete post-upgrade snapshots. A second startup must
   neither duplicate data nor rewrite it.
6. Use real application APIs to authenticate the old paired-phone keys, reject
   cross-account receipts, recover an expired understanding lease and retry
   with backoff, preserve an active lease, recover a conversion lease with a
   bounded attempt count, preserve originals on terminal failure, and reset an
   interrupted phone save on startup. Network fetches are prohibited throughout
   this step.
7. Restore the backup into a separate destination, compare the exact old data
   and schema, and in the full-source form also run the released startup against
   it. Upgrade it again and compare the result with the first upgrade.
   Restored media sizes and contents must match their original files.

The rehearsal also verifies an existing signed session token against its
unchanged synthetic secret and checks that both account records remain approved.
Browser cookie storage and real-device login remain separate acceptance checks.

## Offline CI regression

```bash
pnpm exec vitest run --maxWorkers=2 src/__tests__/db/released-upgrade.test.ts
```

CI uses `src/__tests__/fixtures/upgrade-v2.1.2.sql`, generated from the actual
released migration, so shallow checkouts need no network or historical source
download. It runs the same seed, migrations, application queue checks, backup
and restore. To deliberately regenerate the fixture, run the full-source form:

```bash
node scripts/verify-upgrade.mjs --write-schema-fixture
```

Review any fixture change against the immutable release source. A new target
release requires deliberately changing the source commit and creating a new
versioned fixture; never substitute current test-schema DDL for a released
schema.

## Before a real update

This rehearsal checks representative synthetic data. It does not prove the
health of a particular installation or replace its backup. Follow the
[deployment backup and recovery procedure](../../deploy/nas/README.md#updates-backups-and-recovery):
stop ADHX or coordinate writers while backing up both SQLite and retained media,
keep the private configuration and unchanged session secret, and verify a
restore in an isolated destination before replacing production files. A database
backup alone is insufficient when media files can change concurrently.

Recovery uses the old application with the **pre-upgrade backup**. Starting an
older binary directly against an already-upgraded database is not a supported
downgrade. The automated rehearsal never changes or restarts an installed app.
