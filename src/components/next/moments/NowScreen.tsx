'use client'

import { NxHeader } from '../channels/ChannelParts'
import { SaveTools } from '../onboarding/SaveTools'
import { RightNow } from './RightNow'

/** The Right now page: the live moments, under the same header as everywhere else. */
export function NowScreen() {
  return (
    <div className="min-h-dvh bg-black font-nx-sans text-white">
      <NxHeader current="now">
        <SaveTools />
      </NxHeader>
      <main className="mx-auto max-w-[1600px] px-4 pb-16 pt-2 md:px-7 md:pt-4">
        <RightNow />
      </main>
    </div>
  )
}
