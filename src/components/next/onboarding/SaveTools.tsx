'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuthMe } from '@/components/auth'
import { recentPlayHref } from '../theater/queue'
import { LEARNING_IN_HEADER, LearningPill, LearningSheet, useLearningStatus } from './learning'
import { PasteButton, usePasteToSave } from './usePasteToSave'

/**
 * Header tools for saving: how learning is going, and Paste. Their toast and
 * sheet go to the end of the page (a blurred header would trap fixed
 * elements). Nothing while signed out; the header shows Sign in instead.
 */
export function SaveTools() {
  const { me, loading } = useAuthMe()
  if (loading || !me?.authenticated) return null
  return <Tools />
}

function Tools() {
  const [learningOpen, setLearningOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const learning = useLearningStatus({ fast: learningOpen })
  const paste = usePasteToSave({
    savedAction: (post) => ({
      label: 'Play',
      onClick: () => window.location.assign(recentPlayHref(post.key)),
    }),
  })
  return (
    <>
      <LearningPill
        status={learning.status}
        onOpen={() => setLearningOpen(true)}
        className={LEARNING_IN_HEADER}
      />
      {/* Desktop pastes anywhere on the page (⌘V), the pill kept for keyboards; phones need it. */}
      <PasteButton onClick={paste.pasteFromClipboard} keyboardOnlyFrom="md" />
      {mounted &&
        createPortal(
          <>
            {paste.toast}
            {learningOpen && (
              <LearningSheet status={learning.status} onClose={() => setLearningOpen(false)} />
            )}
          </>,
          document.body,
        )}
    </>
  )
}
