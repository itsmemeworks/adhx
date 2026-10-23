'use client'

import { NxHeader } from '../channels/ChannelParts'
import { SaveTools } from '../onboarding/SaveTools'
import { RightNow } from './RightNow'
import { SharedSavesNotice } from './SharedSavesNotice'

/** The Right now page: the live moments, under the same header as everywhere else. */
export function NowScreen() {
  return (
    <div className="min-h-dvh bg-nx-bg font-nx-sans text-nx-cream">
      <NxHeader current="now">
        <SaveTools />
      </NxHeader>
      <main className="mx-auto max-w-[1600px] px-4 pb-16 pt-4 md:px-10 md:pt-[18px]">
        <SharedSavesNotice />
        <RightNow headingLevel="h1" />
      </main>
    </div>
  )
}
