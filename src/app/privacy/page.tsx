import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { NxHeader } from '@/components/next/channels/ChannelParts'

export const metadata: Metadata = {
  title: 'Privacy · ADHX',
  description: 'What ADHX stores, who sees it, what is public, and what is never exposed.',
}

/** Privacy, in the new design. The canonical copy is PRIVACY.md in the repo; keep them in step. */
export default function PrivacyPage() {
  return (
    <div className="min-h-dvh bg-nx-ink font-nx-sans text-nx-cream">
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
          <span>Last updated 20 October 2026. The canonical copy is </span>
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
              Named to friends, never to strangers. A member is anyone who can sign in here
              (approved and not banned). Your saves are shared with members: they see the post, your
              name, picture, when you saved it and your note.
            </li>
            <li>
              “Just for me” keeps a save out of everyone else’s feed, channels, search, Right now
              and counts, and its kept files are yours alone. One exception: admins’ counts include
              it.
            </li>
            <li>
              People who aren’t signed in see posts and counts, never who saved them. Right now,
              previews, public channels and the sitemap do show which posts people here shared.
            </li>
            <li>
              Kept media files of shared posts are not behind sign-in. Anyone who can reach this
              server and knows a post’s network and ID can fetch them. A post only saved “Just for
              me” is served to its owner alone.
            </li>
            <li>
              Your archive, tags (until you make a channel public), what you’ve watched, Show more
              or less, bells and alerts are yours alone. A send is seen by you and the person you
              sent it to.
            </li>
            <li>No ads, no advertising pixels, nothing sold.</li>
          </ul>
        </Section>

        <Section title="Account and saves">
          You join with an invite link or a one-time email link. Your account stores a username, an
          optional display name and picture, your email if you use one, the invite you joined with,
          an X identity if you connect X (its tokens encrypted at rest) and a signed httpOnly
          session cookie (30 days). Sign-in links are stored as a hash; when the server holds them
          for an admin to pass on, admins can see the link and the email it was asked for, and
          admins’ own links (or any before there is an admin) are also printed in the server’s log.
          An uploaded picture is re-made as a 512-pixel JPEG without its photo metadata, shown only
          to members, and deleted when you change it or delete your account. Saves, notes, tags,
          archive and preferences are keyed by your account. A “Just for me” save writes no public
          pulse, and making a save private removes its earlier ones. “Just for me by default” covers
          every new save: the web, the phone apps, X bookmark sync and Keep this channel. If X is
          connected, we check it for new bookmarks about every hour.
        </Section>

        <Section title="Notes, sends and what you watch">
          A note on a save (140 characters, text only) is shown to members next to your face, and on
          a “Just for me” save only to you; it is never shown signed out, copied to anyone else or
          sent to an outside service. Admins can clear notes. A send stores who sent what to whom,
          the note and when it was seen, and only the two of you see it; while choosing, the sender
          sees who already has a shared save of the post, never a “Just for me” one. What you’ve
          watched is stored so New can leave it out and say whose saves you watch most; nobody else
          sees it, and it is deleted after 180 days. Show more and Show less are your preferences
          and only you see them.
        </Section>

        <Section title="Right now and watching together">
          Right now groups recent shared saves into moments in the server’s memory; “Just for me”
          saves are never counted or named, not even to you. Members see who is saving a moment and
          who is watching, and can react; who is watching and reactions are never stored and reach
          only members watching that moment. Signed out, moments show counts only. “Tell me when
          it’s live” stores your bell and the alert it fires (listed for 24 hours), for you alone.
        </Section>

        <Section title="Kept media and phones">
          Each saved post’s files are downloaded once and kept on this server. A shared post’s files
          play without sign-in for anyone who can reach the server and knows the post’s network and
          ID, and may be cached for up to 7 days. Those IDs are not secret, and invites restrict
          accounts, not playback: private access needs a private network. A post only saved “Just
          for me” is served only to the people who saved it, never cached, and to anyone else looks
          like a post nobody saved; why a file is missing is only told to members. Hidden posts are
          not served, and files go within the hour once nobody has the post saved. Pairing codes and
          phone keys are stored only as hashes; a phone key acts as you in the phone app until you
          remove it in Settings. Access keys for searching from Claude can only search your own
          saves.
        </Section>

        <Section title="Search by meaning">
          Each post’s words, pictures, video frames, speech and on-screen text are turned into
          numbers and words by models on this server, or on the operator’s own Mac helper, which
          gets the post’s words and kept files but never who saved anything, notes or tags. Signed
          in, “Everyone’s saves” covers what members shared and names who saved each post; “Just for
          me” saves are left out except your own. “Made for you” channels are private to you. With
          optional refinement, your search text and the public words of the top results go to
          TypeSafe (Jev) to reorder them, and public words from small samples of posts are used to
          name channels and moments. Media files, transcripts, text read off pictures, savers,
          notes, tags and account details are never sent. Search data made from a post is deleted
          when the last person removes it.
        </Section>

        <Section title="Public pages and logs">
          Previews, Right now, Tune in, public channels, curator and author pages, the sitemap and
          public JSON work without an account and never name savers. Once you have a public channel,
          your username, display name, picture and join date are public on your curator page. Three
          older logs remain: an anonymous post pulse (30 days, on the signed-out home page without
          account ids), public-channel views (90 days of detail) and product analytics (90 days,
          totals for admins only). Removing a save removes its “saved” pulse. Captions and
          thumbnails are resolved on the server; your browser cannot invent what appears there.
        </Section>

        <Section title="Admins">
          Admins can invite, approve or decline join requests, see sign-in links held for them, look
          up a post or a member (counts include private saves; never an email address), hide posts,
          clear notes and ban accounts. Every admin action is logged. No admin page shows another
          member’s private saves, notes, viewing history, sends or alerts.
        </Section>

        <Section title="Third parties">
          Depending on the operator’s settings: the networks posts come from (through yt-dlp, public
          preview data and public mirrors), X for optional bookmark sync, SMTP or Resend for email,
          TypeSafe for optional refinement and naming, Sentry for optional error reporting
          (pseudonymised), and the chosen hosting provider. Hugging Face sees the model download
          request, not your saves. No advertising pixels.
        </Section>

        <Section title="Clearing and deleting">
          Clear data deletes your saves, notes, tags, archive, preferences, viewing history, sends,
          bells and alerts, X sync history, queued phone shares, Made for you channels and your
          “saved” pulses, and keeps your account, keys and invites. Delete account also removes your
          account, sign-in methods, tokens, keys, invites, picture and public channel statistics;
          other pulse and analytics rows stay without your account id, and the admin log remains.
          Search data made from a post goes once nobody has it saved.
        </Section>

        <Section title="Your choices">
          Watch shared posts, Right now and Tune in without an account. Keep any save just for you
          from its ⋯ menu, or by default. Keep channels private. Archive without a public pulse.
          Turn off a bell. Remove phones and access keys, turn off automatic X sync, disconnect X,
          clear data, or delete the account in Settings.
        </Section>

        <p className="m-0 mt-2">
          <span>Questions about this server: ask whoever runs it. About the software: </span>
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
