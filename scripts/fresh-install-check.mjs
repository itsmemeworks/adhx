// A fresh install with nothing configured, checked from inside the running
// container (scripts/container-smoke.sh). Never publishes or deploys anything.
//   claim <code>       home opens setup; the code makes an owner; prints the cookie
//   signed-in <cookie> after a restart: still the owner, setup is closed
const base = 'http://127.0.0.1:3000'
const [mode, value] = process.argv.slice(2)

function fail(message) {
  console.error(`fresh install: ${message}`)
  process.exit(1)
}

if (mode === 'claim') {
  const home = await fetch(`${base}/`, { redirect: 'manual' })
  if (!home.headers.get('location')?.endsWith('/setup')) fail('home did not open setup')
  const wrong = await fetch(`${base}/api/setup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ code: 'WRNG-WRNG-WRNG', email: 'stranger@example.com' }),
  })
  if (wrong.status !== 403) fail(`a wrong code answered ${wrong.status}`)
  const res = await fetch(`${base}/api/setup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ code: value, email: 'owner@example.com' }),
  })
  if (res.status !== 200) fail(`setup answered ${res.status}: ${await res.text()}`)
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith('adhx_session='))
  if (!cookie) fail('setup set no session')
  // Plain HTTP: a Secure cookie would never come back from a browser.
  if (/;\s*secure/i.test(cookie)) fail('the session cookie is Secure over plain HTTP')
  console.log(cookie.split(';')[0])
} else if (mode === 'signed-in') {
  const me = await fetch(`${base}/api/auth/me`, { headers: { cookie: value } }).then((r) =>
    r.json(),
  )
  if (!me.authenticated || !me.isAdmin) fail('the owner is not signed in after a restart')
  const setup = await fetch(`${base}/setup`, { redirect: 'manual' })
  if (setup.status < 300 || setup.status >= 400) fail('setup is still open after it was done')
  console.log('fresh install: set up, signed in and kept across a restart')
} else {
  fail(`unknown mode ${mode}`)
}
