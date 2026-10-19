import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { NxHeader } from '@/components/next/channels/ChannelParts'

export const metadata: Metadata = {
  title: 'Privacy · ADHX',
  description:
    'What ADHX stores, what is public, and what is never exposed — including activity.userId.',
}

/** Privacy, in the new design. The canonical copy is PRIVACY.md in the repo; keep them in step. */
export default function PrivacyPage() {
  return (
    <div className="min-h-dvh bg-black font-nx-sans text-white">
      <NxHeader current={null} />
      <article className="mx-auto flex max-w-[720px] flex-col gap-4 px-5 pb-20 pt-6 text-[17px] leading-[1.65] text-white/80 md:pt-10">
        <h1 className="m-0 font-nx-serif text-[52px] font-normal leading-none text-white md:text-[64px]">
          Privacy
        </h1>
        <p className="m-0">
          Whoever runs this ADHX is the data controller for it. Every ADHX stores the same kinds of
          rows, on its own server.
        </p>
        <p className="m-0 text-[14px] text-white/55">
          <span>Last updated 19 October 2026. The canonical copy is </span>
          <a
            href="https://github.com/itsmemeworks/adhx/blob/main/PRIVACY.md"
            className="text-white underline underline-offset-2"
          >
            PRIVACY.md
          </a>
          <span> in the repo.</span>
        </p>

        <Section title="Short version">
          <ul className="m-0 flex list-disc flex-col gap-2 pl-5">
            <li>
              Named to friends, never to strangers. Your saves are shared with the people on this
              server: they see what you saved, with your username, name and picture. Mark a save
              “Just for me” and nobody else sees it, counts it or is told you saved it.
            </li>
            <li>Your archive, private channels and sign-in are private to you.</li>
            <li>
              Shared post pages, Right now, public channels and Top channels are public. They show
              posts and curator usernames, never account IDs. People who aren’t signed in see how
              many people saved something, never who.
            </li>
            <li>
              <code className="text-[15px]">activity.userId</code>
              <span> and </span>
              <code className="text-[15px]">collection_events.viewerId</code>
              <span> exist only for moderation. No public query selects them.</span>
            </li>
            <li>We do not sell data or run ads.</li>
          </ul>
        </Section>

        <Section title="Account and saves">
          Sign-in stores a username, optional display name and avatar, an email and/or X identity,
          and a signed httpOnly session cookie (30 days). X tokens are encrypted at rest. Saves,
          channels, archive and preferences are keyed by your account. Other members can see which
          posts you saved and when, unless you mark a save “Just for me”; they never see your tags,
          archive or preferences. A “Just for me” save never writes a public pulse, and nor does
          archive. Members also get a channel of everything you saved for them, and your saves are
          grouped with everyone’s into channels from everyone; “Just for me” saves are in neither. A
          channel stays private until you make it public on its page, and you can make it private
          again there; a public channel never shows a post you saved “Just for me”, even if you
          tagged it. Keeping a “Made for you” channel keeps it private. If X is connected, we check
          it for new bookmarks about every hour. An access key (for searching from Claude) is stored
          only as a hash, can only search your own saves, and stops working as soon as you remove
          it.
        </Section>

        <Section title="Retained media and phones">
          Successfully downloaded media stays on this server and can be played without sign-in by
          anyone who can reach its URL. Those URLs contain source post IDs, not secret tokens. The
          email allowlist restricts accounts, not playback; private access also needs a private
          network boundary. Hidden posts are not served. Phone keys are stored as hashes and can
          save links and read/search only their owner’s saves. Remove a key in Settings to revoke
          it.
        </Section>

        <Section title="Search by meaning">
          So you can find saves by what is in them, each post’s words, picture and video frames are
          turned into numbers by a model that runs on this instance’s server. These describe the
          post, never who saved it. Signed in, “Everyone’s saves” search covers what everyone on
          this server saved and names who saved each post; “Just for me” saves are left out except
          your own. The posts that play after a shared post never show who saved them. “Made for
          you” channels are private to you. When the operator enables optional refinement, your
          search text and the public words of the top results are sent to TypeSafe (Jev) to put them
          in a better order; it also receives public text from small samples of grouped posts to
          choose automatic channel and moment names. Media files, private tags and account
          identities are never sent.
        </Section>

        <Section title="Right now and the community pulse">
          Previewing, saving and sending a post may add an anonymous activity row; a “Just for me”
          save never does. Right now groups recent saves from everyone into moments by what they’re
          about and counts the people behind them, never counting “Just for me” saves; account ids
          never leave the server. Views and saves of a public channel may add an event for Top
          channels. Captions and thumbnails are resolved on the server; your browser cannot invent
          what appears there.
        </Section>

        <Section title="Third parties">
          Depending on the operator’s settings: X for optional bookmark sync, SMTP or Resend for
          email, Sentry for optional error reporting, the chosen hosting provider, and TypeSafe for
          optional refinement and automatic channel/moment naming. Hugging Face sees the model
          download request, not your saved library. Networks and public preview providers supply
          saved posts and media. No advertising pixels.
        </Section>

        <Section title="Your choices">
          Watch shared posts, Right now and Tune in without an account. Keep any save just for you
          from its ⋯ menu. Keep channels private. Archive without a public pulse. Turn off automatic
          X sync, remove access keys, disconnect X, clear data, or delete the account in Settings.
        </Section>

        <p className="m-0 mt-2">
          <span>Questions: </span>
          <a href="mailto:security@adhx.com" className="text-white underline underline-offset-2">
            security@adhx.com
          </a>
          <span>. Vulnerabilities: see </span>
          <a
            href="https://github.com/itsmemeworks/adhx/security"
            className="text-white underline underline-offset-2"
          >
            SECURITY.md
          </a>
          <span>.</span>
        </p>
      </article>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6 flex flex-col gap-3">
      <h2 className="m-0 font-nx-serif text-[30px] font-normal leading-tight text-white">
        {title}
      </h2>
      <div className="m-0">{children}</div>
    </section>
  )
}
