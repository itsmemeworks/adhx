'use client'

import { useState, type ReactNode } from 'react'
import { NxHeader } from '../channels/ChannelParts'
import { LearningPill, LearningSheet, useLearningStatus } from '../onboarding/learning'
import { PasteButton, usePasteToSave } from '../onboarding/usePasteToSave'
import { recentPlayHref } from '../theater/queue'
import { RightNow } from './RightNow'

/** The Right now page: the live moments, under the same header as everywhere else. */
export function NowScreen({ signedIn }: { signedIn: boolean }) {
  return signedIn ? <SignedIn /> : <Layout />
}

function Layout({ tools, children }: { tools?: ReactNode; children?: ReactNode }) {
  return (
    <div className="min-h-dvh bg-black font-nx-sans text-white">
      <NxHeader current="now">{tools}</NxHeader>
      <main className="mx-auto max-w-[1600px] px-4 pb-16 pt-2 md:px-7 md:pt-4">
        <RightNow />
      </main>
      {children}
    </div>
  )
}

/** Signed in: the header also has saving (paste a link) and how learning is going. */
function SignedIn() {
  const [learningOpen, setLearningOpen] = useState(false)
  const learning = useLearningStatus({ fast: learningOpen })
  const paste = usePasteToSave({
    savedAction: (post) => ({
      label: 'Play',
      onClick: () => window.location.assign(recentPlayHref(post.key)),
    }),
  })
  return (
    <Layout
      tools={
        <>
          <LearningPill status={learning.status} onOpen={() => setLearningOpen(true)} />
          <PasteButton onClick={paste.pasteFromClipboard} />
        </>
      }
    >
      {paste.toast}
      {learningOpen && (
        <LearningSheet status={learning.status} onClose={() => setLearningOpen(false)} />
      )}
    </Layout>
  )
}
