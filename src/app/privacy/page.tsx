import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy · ADHX',
  description:
    'What ADHX stores, what is public, and what is never exposed — including activity.userId.',
}

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl px-5 py-12 text-ink">
      <p className="text-sm text-ink-3">
        <Link href="/" className="underline-offset-2 hover:underline">
          <span>ADHX</span>
        </Link>
        <span> · Privacy</span>
      </p>
      <h1 className="font-serif mt-3 text-3xl">Privacy</h1>
      <p className="mt-4 text-ink-2">
        <span>
          This is the hosted service at adhx.com (and staging). If you self-host, you are the data
          controller — the software still stores the same kinds of rows.
        </span>
      </p>
      <p className="mt-2 text-sm text-ink-3">
        <span>Last updated 22 August 2026. The canonical copy is </span>
        <a
          href="https://github.com/itsmemeworks/adhx/blob/main/PRIVACY.md"
          className="underline-offset-2 hover:underline"
        >
          PRIVACY.md
        </a>
        <span> in the repo.</span>
      </p>

      <h2 className="font-serif mt-10 text-xl">Short version</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-2">
        <li>
          <span>Your collection (saves, archive, private tags, sign-in) is private to you.</span>
        </li>
        <li>
          <span>
            Preview pages, Live / trending, public playlists, and the leaderboard are public. They
            show posts and curator usernames, never account IDs.
          </span>
        </li>
        <li>
          <span>
            <code className="text-sm">activity.userId</code>
          </span>
          <span> and </span>
          <span>
            <code className="text-sm">collection_events.viewerId</code>
          </span>
          <span> exist only for moderation. No public query selects them.</span>
        </li>
        <li>
          <span>We do not sell data, run ads, or run metered AI on your library.</span>
        </li>
      </ul>

      <h2 className="font-serif mt-10 text-xl">Account and collection</h2>
      <p className="mt-3 text-ink-2">
        <span>
          Sign-in stores a username, optional display name and avatar, an email and/or X identity,
          and a signed httpOnly session cookie (30 days). X tokens are encrypted at rest. Bookmarks,
          tags, archive, and preferences are keyed by your account — other users cannot read them.
          Archive never writes a public pulse. A tag is private until you make it a public playlist.
        </span>
      </p>

      <h2 className="font-serif mt-10 text-xl">Community pulse</h2>
      <p className="mt-3 text-ink-2">
        <span>
          Preview, save, and send may append an anonymous activity row. Playlist view/clone may
          append a leaderboard event. Captions and thumbnails are resolved on the server; the client
          cannot invent what appears on the front page.
        </span>
      </p>

      <h2 className="font-serif mt-10 text-xl">Third parties</h2>
      <p className="mt-3 text-ink-2">
        <span>
          X (if you connect it), Resend (magic-link email), Sentry in production (user ids hashed
          before metrics), Fly.io (host + volume), and platform CDNs via allowlisted media proxies.
          No advertising pixels.
        </span>
      </p>

      <h2 className="font-serif mt-10 text-xl">Your choices</h2>
      <p className="mt-3 text-ink-2">
        <span>
          Watch without an account. Keep tags private. Archive without a public pulse. Disconnect X,
          clear data, or delete the account in Settings.
        </span>
      </p>
      <p className="mt-3 text-ink-2">
        <span>Questions: </span>
        <a href="mailto:security@adhx.com" className="underline-offset-2 hover:underline">
          security@adhx.com
        </a>
        <span>. Vulnerabilities: see </span>
        <a
          href="https://github.com/itsmemeworks/adhx/security"
          className="underline-offset-2 hover:underline"
        >
          SECURITY.md
        </a>
        <span>.</span>
      </p>
    </article>
  )
}
