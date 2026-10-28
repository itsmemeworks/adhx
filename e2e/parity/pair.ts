/**
 * A fresh phone pairing code for one of the test world's members, as Settings →
 * Phone app → Show the code would give them:
 *
 *   pnpm parity:pair ana        →  {"member":"ana","code":"7KQ4PAR1","server":"http://…"}
 *
 * Run it against the database `parity:serve` made (it only reads env.ts paths).
 * The code works once, for as long as a real one does.
 */
import fs from 'node:fs'
import { PARITY_CREDENTIALS, parityProcessEnv } from './env'

async function main() {
  const member = process.argv[2]
  const credentials = JSON.parse(fs.readFileSync(PARITY_CREDENTIALS, 'utf8')) as {
    server: string
    members: Record<string, { userId: string }>
  }
  const who = member ? credentials.members[member] : undefined
  if (!who) {
    console.error(
      `Usage: pnpm parity:pair <member>  (one of ${Object.keys(credentials.members).join(', ')})`,
    )
    process.exit(1)
  }
  // The database module reads its path when it's first imported.
  Object.assign(process.env, parityProcessEnv())
  const { createPairCode } = await import('../../src/lib/auth/phone-pairing')
  const { code, expiresAt } = createPairCode(who.userId)
  process.stdout.write(
    `${JSON.stringify({ member, code, expiresAt, server: credentials.server })}\n`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
