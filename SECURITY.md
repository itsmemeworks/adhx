# Security policy

ADHX holds the saves, notes, faces and viewing habits of people's closest
friends and family. We treat a weakness in it as seriously as that sounds.

## Reporting a vulnerability

**Please don't report security problems in public issues, discussions or pull
requests.**

1. **Preferred:** open a
   [private vulnerability report on GitHub](https://github.com/itsmemeworks/adhx/security/advisories/new).
   Only the maintainers can see it.
2. **Or email** [security@adhx.com](mailto:security@adhx.com).

Please include:

- what the problem is and which part of ADHX it affects (web app, phone app,
  Mac helper, extension, container image);
- the version or commit you tested;
- steps to reproduce it, or a proof of concept;
- what an attacker could do with it;
- a suggested fix, if you have one.

Test only against a server you run yourself. Don't access, change or delete
other people's data, and don't run tests that degrade someone else's
instance.

### What happens next

| When                 | What we do                                           |
| -------------------- | ---------------------------------------------------- |
| Within 2 days        | Confirm we received your report.                     |
| Within 7 days        | Share our first assessment and severity.             |
| Within 30 to 90 days | Release a fix, depending on severity and complexity. |

We'll keep you updated, agree a disclosure date with you, and credit you in
the advisory and release notes unless you'd rather stay anonymous. We won't
take legal action against good-faith research that follows this policy.

## Supported versions

Security fixes go into the most recent release. Self-hosted servers should
run the latest release image from `ghcr.io/itsmemeworks/adhx`; older releases
don't receive backported fixes.

## Scope

In scope:

- authentication or authorization bypass, including sessions, invite and
  sign-in links, phone keys and the Mac helper's machine token;
- one account reading or changing another account's data;
- anything that reveals who saved a post to someone who isn't a member, or
  reveals a Just for me save to anyone but its owner;
- server-side request forgery through the media proxies, link previews or
  downloads;
- cross-site scripting, cross-site request forgery and injection (SQL, shell,
  FFmpeg or yt-dlp arguments);
- secrets or personal data written to logs, error reports or client bundles;
- dependencies with known vulnerabilities that are reachable in ADHX.

Out of scope:

- social engineering and physical attacks;
- denial of service by sheer volume;
- problems that need an already-compromised server, device or admin account;
- behaviour documented as intentional, such as kept files and preview pages
  of shared posts being reachable by anyone who can reach the server (see
  [`PRIVACY.md`](PRIVACY.md));
- vulnerabilities in a network's own app or website.

## Running ADHX safely

These apply to anyone hosting an instance.

- **Use HTTPS** in front of ADHX, through a reverse proxy you control.
- **Set a strong `SESSION_SECRET`** (`openssl rand -base64 32`) and keep it
  private. It signs sessions and private file links.
- **Choose your network boundary deliberately.** Preview pages and the kept
  files of shared posts don't require sign-in, by design. If your server
  shouldn't be reachable from the internet, keep it on a private network or
  behind a VPN such as Tailscale.
- **Treat `PROCESSING_WORKER_TOKEN` as a machine secret.** It grants
  processing access to the whole instance. Put it only on a Mac you trust,
  and never reuse an account or phone key for it.
- **Set `TRUST_PROXY_IP_HEADERS=true` only** behind a proxy that overwrites
  `X-Forwarded-For` and `X-Real-IP`. Otherwise anyone can fake their address
  and dodge rate limits.
- **Keep `ALLOWED_EMAILS` and invite settings tight** if you don't want
  strangers making accounts.
- **Remove phones you no longer use** in Settings → Phone app; a removed key
  stops working at once.
- **Back up** the data folder (SQLite file and media) regularly, and keep
  the backups as private as the server.
- **Update** to new releases promptly. The container runs as a non-root user;
  keep it that way.
- **Know what leaves your server.** With `TYPESAFE_API_KEY` set, search words
  and public post text go to TypeSafe for reranking and naming. With
  `TYPESAFE_CHANNEL_IMAGES=on`, selected public-post thumbnails go too.
  Sentry, when configured, receives scrubbed and pseudonymized error reports.
  [`PRIVACY.md`](PRIVACY.md) lists everything.

## Security measures in ADHX

- Signed, `httpOnly` session cookies; every request also checks that the
  account exists, is approved and isn't banned.
- Sign-in links, invite links, pairing codes and phone keys are stored only as
  hashes, expire, and are spent by a single conditional write. Link previews
  can't spend them.
- X OAuth uses PKCE, state bound to the account that started it, and tokens
  encrypted at rest with AES-256-GCM.
- Every query over saves is scoped to its account; database triggers reject
  writes for deleted accounts.
- Outbound requests use exact host allowlists, revalidate every redirect, pin
  DNS for link previews, and always time out.
- A production Content Security Policy without `unsafe-eval`, and
  clickjacking protection.
- Moderation fails closed: if the server can't read moderation state, it
  hides content rather than shows it.
- Anonymous public surfaces never select who saved a post; error reports
  remove secrets and pseudonymize identifiers.
