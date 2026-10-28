import type { ReactNode } from 'react'
import { cn } from './cn'
import { Arrow, Download } from './icons'
import { Footer, GITHUB_URL, Header, Kicker, WRAP } from './ProductSite'

/**
 * adhx.com/install: putting the phone apps on a phone without a store. The
 * short version of docs/install-phone-apps.md, which has every step, the
 * reasons and the sources. Keep the two in step.
 */

const GUIDE = `${GITHUB_URL}/blob/main/docs/install-phone-apps.md`
const RELEASES = `${GITHUB_URL}/releases/latest`

const WAYS = [
  { href: '#android', phone: 'Android', where: 'Anywhere', how: 'The APK from GitHub' },
  { href: '#eu', phone: 'iPhone', where: 'In the EU', how: 'AltStore PAL' },
  { href: '#world', phone: 'iPhone', where: 'Everywhere else', how: 'SideStore' },
  { href: '#testflight', phone: 'iPhone', where: 'If your ADHX offers it', how: 'TestFlight' },
]

function Steps({ children }: { children: ReactNode[] }) {
  return (
    <ol className="m-0 flex list-none flex-col gap-3 p-0 md:gap-3.5">
      {children.map((step, i) => (
        <li key={i} className="flex gap-3 text-[15px] leading-[1.5] md:text-[17px]">
          <span
            aria-hidden
            className="mt-px flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-nx-accent text-[14px] font-extrabold text-black"
          >
            {i + 1}
          </span>
          <span className="min-w-0 pt-0.5">{step}</span>
        </li>
      ))}
    </ol>
  )
}

function B({ children }: { children: ReactNode }) {
  return <strong className="font-extrabold text-white">{children}</strong>
}

function Link({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="text-nx-accent underline underline-offset-2 hover:text-white">
      {children}
    </a>
  )
}

/** A short note under the steps: what it costs, what to watch for. */
function Note({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 rounded-[18px] border border-white/10 bg-nx-surface px-4 py-3 text-[14px] leading-[1.55] text-nx-soft md:px-5 md:text-[15px]">
      {children}
    </p>
  )
}

function Section({
  id,
  kicker,
  title,
  intro,
  children,
}: {
  id: string
  kicker: string
  title: string
  intro: ReactNode
  children: ReactNode
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-16 border-t border-white/10"
    >
      <div
        className={cn(
          WRAP,
          'grid gap-5 pb-10 pt-8 md:gap-10 md:py-14 lg:grid-cols-[minmax(0,420fr)_minmax(0,716fr)] lg:gap-16',
        )}
      >
        <div className="flex flex-col gap-2.5 md:gap-4">
          <Kicker>{kicker}</Kicker>
          <h2
            id={`${id}-title`}
            className="m-0 font-nx-serif text-[34px] font-normal leading-[0.95] tracking-[-0.01em] md:text-[48px]"
          >
            {title}
          </h2>
          <p className="m-0 text-[15px] leading-[1.5] text-nx-soft md:text-[17px]">{intro}</p>
        </div>
        <div className="flex min-w-0 flex-col gap-4 md:gap-5">{children}</div>
      </div>
    </section>
  )
}

export function InstallPage() {
  return (
    <div className="min-h-dvh overflow-x-clip bg-nx-ink font-nx-sans text-nx-cream">
      <Header home="/" />
      <main id="top">
        <section aria-labelledby="install-title" className="relative overflow-hidden bg-black">
          <div className="pointer-events-none absolute -left-[15%] top-[30%] h-[380px] w-[130%] rounded-full bg-[radial-gradient(rgba(255,210,63,0.1),rgba(255,210,63,0)_62%)] lg:left-[45%] lg:top-[-10%] lg:h-[520px] lg:w-[760px]" />
          <div className={cn(WRAP, 'relative flex flex-col gap-4 pb-10 pt-10 md:gap-6 md:py-16')}>
            <Kicker>Phone apps</Kicker>
            <h1
              id="install-title"
              className="m-0 max-w-[14ch] font-nx-serif text-[44px] font-normal leading-[0.95] tracking-[-0.015em] md:text-[72px]"
            >
              Get ADHX on your phone.
            </h1>
            <p className="m-0 max-w-[60ch] text-[15px] leading-[1.5] text-nx-soft md:text-[18px]">
              ADHX Share isn’t in the App Store or Google Play. You can still install it, for free.
              Pick your phone and where you are.
            </p>
            <ul className="m-0 mt-2 grid list-none gap-2.5 p-0 sm:grid-cols-2 lg:grid-cols-4">
              {WAYS.map((w) => (
                <li key={w.href}>
                  <a
                    href={w.href}
                    className="group flex h-full min-h-[88px] items-center justify-between gap-3 rounded-[20px] border border-white/10 bg-nx-surface px-4 py-3.5 hover:border-nx-accent/60"
                  >
                    <span className="flex flex-col gap-0.5">
                      <span className="text-[17px] font-extrabold text-white">{w.phone}</span>
                      <span className="text-[13px] text-nx-muted">{w.where}</span>
                      <span className="text-[14px] font-semibold text-nx-accent">{w.how}</span>
                    </span>
                    <Arrow size={20} className="shrink-0 text-nx-soft group-hover:text-white" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <Section
          id="android"
          kicker="Android"
          title="Five taps and it’s on."
          intro={
            <>
              <span>
                Every release comes with a signed app file. You need Android 8.0 or newer.
              </span>
            </>
          }
        >
          <Steps>
            {[
              <span key="1">
                <span>On your phone, open the </span>
                <Link href={RELEASES}>latest release</Link>
                <span>.</span>
              </span>,
              <span key="2">
                <span>Under </span>
                <B>Assets</B>
                <span>, tap </span>
                <B>adhx-&lt;version&gt;.apk</B>
                <span>, then </span>
                <B>Open</B>
                <span> when it’s downloaded.</span>
              </span>,
              <span key="3">
                <span>Android asks once: tap </span>
                <B>Settings</B>
                <span>, turn on </span>
                <B>Allow from this source</B>
                <span>, go back.</span>
              </span>,
              <span key="4">
                <span>Tap </span>
                <B>Install</B>
                <span>. If Play Protect doesn’t know the app, tap </span>
                <B>More details</B>
                <span>, then </span>
                <B>Install anyway</B>
                <span>.</span>
              </span>,
              <span key="5">
                <span>Open it and </span>
                <Link href="#connect">connect it to your ADHX</Link>
                <span>.</span>
              </span>,
            ]}
          </Steps>
          <a
            href={RELEASES}
            className="flex min-h-[52px] items-center justify-center gap-2.5 whitespace-nowrap rounded-full bg-nx-accent px-6 text-[16px] font-extrabold text-black hover:bg-white sm:self-start"
          >
            <Download size={20} />
            <span>Get the Android app</span>
          </a>
          <Note>
            <span>
              Updates: install the newer APK the same way. It goes over the old one and stays
              connected. Or let{' '}
            </span>
            <Link href="https://github.com/ImranR98/Obtainium">Obtainium</Link>
            <span> watch the releases for you.</span>
          </Note>
        </Section>

        <Section
          id="eu"
          kicker="iPhone in the EU"
          title="Installed like any app."
          intro={
            <>
              <span>In the EU, Apple allows other app marketplaces. </span>
              <Link href="https://altstore.io">AltStore PAL</Link>
              <span>
                {' '}
                is free and open to any developer. Apple still checks the app, so there’s no weekly
                refresh and the share card just works. Japan and Brazil too.
              </span>
            </>
          }
        >
          <Steps>
            {[
              <span key="1">
                <span>In Safari, open </span>
                <Link href="https://altstore.io/download">altstore.io/download</Link>
                <span> and install AltStore PAL.</span>
              </span>,
              <span key="2">
                <span>Read what iOS says about marketplaces and tap </span>
                <B>Allow</B>
                <span>.</span>
              </span>,
              <span key="3">
                <span>In AltStore PAL, go to </span>
                <B>Sources</B>
                <span>, tap </span>
                <B>+</B>
                <span> and paste the ADHX source address.</span>
              </span>,
              <span key="4">
                <span>Install </span>
                <B>ADHX Share</B>
                <span>, then </span>
                <Link href="#connect">connect it</Link>
                <span>.</span>
              </span>,
            ]}
          </Steps>
          <Note>
            <span>
              Not listed yet. Someone with a paid Apple developer account has to publish ADHX there
              once. You need an Apple Account set to an EU country, to be in the EU, and the latest
              iOS.{' '}
            </span>
            <Link href={`${GUIDE}#owner-eu`}>What the owner does</Link>
          </Note>
        </Section>

        <Section
          id="world"
          kicker="iPhone everywhere else"
          title="Your own Apple Account."
          intro={
            <>
              <Link href="https://sidestore.io">SideStore</Link>
              <span>
                {' '}
                installs apps signed with your free Apple Account, and re-signs them on the phone
                before Apple’s 7 days run out. You need a computer once, for the first step.
              </span>
            </>
          }
        >
          <Steps>
            {[
              <span key="1">
                <span>Set up SideStore with </span>
                <Link href="https://iloader.app">iloader</Link>
                <span> and </span>
                <B>LocalDevVPN</B>
                <span> (</span>
                <Link href="https://docs.sidestore.io/docs/installation/prerequisites">
                  their guide
                </Link>
                <span>, about 15 minutes).</span>
              </span>,
              <span key="2">
                <span>From the </span>
                <Link href={RELEASES}>latest release</Link>
                <span>, download </span>
                <B>adhx-&lt;version&gt;.ipa</B>
                <span> under Assets.</span>
              </span>,
              <span key="3">
                <span>In SideStore, </span>
                <B>My Apps</B>
                <span>, tap </span>
                <B>+</B>
                <span> and pick it. Asked about extensions? </span>
                <B>Keep All</B>
                <span>: that’s the share card.</span>
              </span>,
              <span key="4">
                <span>Open it and </span>
                <Link href="#connect">connect it</Link>
                <span>. SideStore refreshes it each week.</span>
              </span>,
            ]}
          </Steps>
          <Note>
            <span>
              The iPhone file comes with releases after 2.8.2. SideStore signs it as yours. A free
              Apple Account allows 3 sideloaded apps at once, SideStore included.{' '}
            </span>
            <Link href={`${GUIDE}#iphone-everywhere-else`}>Every step, and why SideStore</Link>
          </Note>
        </Section>

        <Section
          id="testflight"
          kicker="iPhone, anywhere"
          title="Or just TestFlight."
          intro={
            <span>
              If whoever runs your ADHX has set it up, Settings → Phone app shows an iPhone
              (TestFlight) link. Install TestFlight from the App Store, open the link, tap Install.
            </span>
          }
        >
          <Note>
            <span>
              It’s the easiest way, but the owner needs a paid Apple developer account. Releases
              upload to TestFlight on their own once it’s set up.{' '}
            </span>
            <Link href={`${GUIDE}#testflight`}>How</Link>
          </Note>
        </Section>

        <Section
          id="connect"
          kicker="Then"
          title="Connect it to your ADHX."
          intro={
            <span>The app opens on Connect to your ADHX. Either way works on both phones.</span>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              {
                title: 'With your email',
                text: 'Type your ADHX’s address and your email. Type the 6-digit code it sends you. It works once, for 15 minutes.',
              },
              {
                title: 'With a pairing code',
                text: 'On a computer, open your ADHX → Settings → Phone app → Show the code. Scan the QR code, or type the address and the code.',
              },
            ].map((c) => (
              <div
                key={c.title}
                className="flex flex-col gap-1.5 rounded-[20px] border border-white/10 bg-nx-surface px-4 py-4 md:px-5"
              >
                <span className="text-[17px] font-extrabold text-white">{c.title}</span>
                <span className="text-[15px] leading-[1.5] text-nx-soft">{c.text}</span>
              </div>
            ))}
          </div>
          <p className="m-0 text-[15px] leading-[1.5] text-nx-soft md:text-[17px]">
            Then share any post, pick ADHX, and it’s saved.
          </p>
          <a
            href={GUIDE}
            className="flex min-h-[52px] items-center justify-center gap-2.5 whitespace-nowrap rounded-full border border-white/15 bg-nx-surface px-6 text-[16px] font-extrabold text-white hover:border-nx-accent/60 sm:self-start"
          >
            <span>The full guide, with sources</span>
            <Arrow size={20} />
          </a>
        </Section>
      </main>
      <Footer />
    </div>
  )
}
