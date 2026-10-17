'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ClipboardPaste } from 'lucide-react'
import { detectPlatformPost } from '@/lib/platform/url'
import { navigateToAppPath } from '@/lib/theater/navigate-app-path'
import { NxHeader } from '../channels/ChannelParts'
import { RightNow } from './RightNow'

/**
 * The signed-out home: what ADHX is in a sentence, a way in, and Right now
 * running live underneath (anyone can watch and Tune in).
 */
export function PublicHome() {
  // "Connect X" needs an account first (the X sign-in sends you back here).
  const [xFirst, setXFirst] = useState(false)
  useEffect(() => {
    setXFirst(new URLSearchParams(window.location.search).get('auth_error') === 'x_link_only')
  }, [])
  return (
    <div className="min-h-dvh bg-black font-nx-sans text-white">
      <NxHeader current="now" />
      {xFirst && (
        <p
          role="alert"
          className="mx-4 mt-2 rounded-2xl bg-[#2a1d14] px-4 py-3 text-[15px] text-[#ffb59a] md:mx-7"
        >
          Sign in with your email first, then connect X in Settings.
        </p>
      )}
      <main className="mx-auto flex max-w-[1600px] flex-col gap-10 px-4 pb-16 pt-4 md:px-7 md:pt-8">
        <section
          aria-labelledby="nx-home-title"
          className="flex flex-col gap-5 rounded-[28px] bg-[#12110f] px-5 py-8 md:flex-row md:items-end md:justify-between md:px-10 md:py-12"
        >
          <div className="flex max-w-[760px] flex-col gap-4">
            <h1
              id="nx-home-title"
              className="m-0 font-nx-serif text-[44px] font-normal leading-[0.98] md:text-[76px]"
            >
              <span>Save it. Lose it. </span>
              <span className="text-nx-accent">Find it.</span>
            </h1>
            <p className="m-0 max-w-[600px] text-[17px] leading-snug text-white/75 md:text-[19px]">
              Keep posts from X, Instagram and TikTok in one place, then find them by describing
              what you remember. Below, what everyone’s saving, live.
            </p>
            <WatchALink />
          </div>
          <div className="flex shrink-0 flex-wrap gap-2.5">
            <Link
              href="/start"
              className="flex h-[52px] items-center rounded-full bg-nx-accent px-7 text-base font-extrabold text-black"
            >
              Start saving
            </Link>
            <a
              href="#nx-rightnow"
              className="flex h-[52px] items-center rounded-full border border-white/30 px-6 text-base font-bold"
            >
              Watch what’s live
            </a>
          </div>
        </section>
        <RightNow />
      </main>
    </div>
  )
}

/** Paste any X, Instagram or TikTok link to watch it here, no account needed. */
function WatchALink() {
  const [url, setUrl] = useState('')
  const [bad, setBad] = useState(false)
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const post = detectPlatformPost(url.trim())
        if (!post) return setBad(true)
        navigateToAppPath(post.previewPath)
      }}
      className="mt-2 flex max-w-[560px] flex-col gap-2"
    >
      <span className="flex h-[52px] items-center gap-2 rounded-full bg-black pl-4 pr-1.5 ring-1 ring-white/15 focus-within:ring-2 focus-within:ring-nx-accent">
        <ClipboardPaste aria-hidden className="h-[18px] w-[18px] shrink-0 text-white/60" />
        <label htmlFor="nx-watch-link" className="sr-only">
          Paste a link to watch it
        </label>
        <input
          id="nx-watch-link"
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder="Paste a link from X, Instagram or TikTok"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value)
            setBad(false)
          }}
          className="h-full min-w-0 flex-1 bg-transparent text-base text-white outline-none placeholder:text-white/45"
        />
        <button
          type="submit"
          className="h-10 shrink-0 rounded-full bg-white px-4 text-sm font-extrabold text-black"
        >
          Watch
        </button>
      </span>
      {bad && (
        <span role="alert" className="pl-4 text-sm text-[#ff8a7a]">
          That isn’t a post link we can play yet.
        </span>
      )}
    </form>
  )
}
