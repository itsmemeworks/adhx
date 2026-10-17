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
          This is the hosted service at adhx.com (and staging). If you self-host, you are the data
          controller. The software still stores the same kinds of rows.
        </p>
        <p className="m-0 text-[14px] text-white/55">
          <span>Last updated 17 October 2026. The canonical copy is </span>
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
            <li>Your saves, archive, private channels and sign-in are private to you.</li>
            <li>
              Shared post pages, Right now, public channels and Top channels are public. They show
              posts and curator usernames, never account IDs. Right now shows how many people saved
              something, never who.
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
          channels, archive and preferences are keyed by your account, and other people cannot read
          them. Archive never writes a public pulse. A channel stays private until you make it
          public on its page, and you can make it private again there. Keeping a “Made for you”
          channel keeps it private.
        </Section>

        <Section title="Search by meaning">
          So you can find saves by what is in them, each post’s words, picture and video frames are
          turned into numbers by a model that runs on our own servers. These describe the post,
          never who saved it. “Everyone” search, and the posts that play after a shared post, cover
          posts anyone has saved and never show who saved them. “Made for you” channels are private
          to you. When a search is refined, your search text and the public words of the top results
          are sent to TypeSafe (Jev) to put them in a better order; your channels and who saved a
          post are never sent.
        </Section>

        <Section title="Right now and the community pulse">
          Previewing, saving and sending a post may add an anonymous activity row. Right now groups
          recent saves from everyone into moments by what they’re about and counts the people behind
          them; account ids never leave the server. Views and saves of a public channel may add an
          event for Top channels. Captions and thumbnails are resolved on the server; your browser
          cannot invent what appears there.
        </Section>

        <Section title="Third parties">
          X (if you connect it), Resend (magic-link email), Sentry in production (user ids hashed
          before metrics), Fly.io (host and storage), TypeSafe (search refinement, as above),
          Hugging Face (where our search model is downloaded from; nothing about you is sent), and
          platform CDNs through allowlisted media proxies. No advertising pixels.
        </Section>

        <Section title="Your choices">
          Watch shared posts, Right now and Tune in without an account. Keep channels private.
          Archive without a public pulse. Disconnect X, clear data, or delete the account in
          Settings.
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
