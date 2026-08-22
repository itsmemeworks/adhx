'use client'

/**
 * The leaderboard's burger/avatar menu (round 8, owner: the theater's other
 * public surfaces have the burger, /leaderboard had no menu at all for
 * signed-out visitors). Wraps the shared `TheaterAvatarMenu` (same slot,
 * same geometry as everywhere else) and supplies the sign-in modal its
 * signed-out "Sign in" entry needs — `CollectionsBoard` is a server
 * component, so the interactive pair lives in this thin client wrapper.
 *
 * Only mounted in the board's signed-out header: signed-in visitors get the
 * global app Header (with its own avatar menu) as their chrome instead.
 */

import { useState } from 'react'
import { SignInModal } from '@/components/auth'
import { TheaterAvatarMenu } from '@/components/theater/TheaterAvatarMenu'

export function LeaderboardMenu() {
  const [showSignIn, setShowSignIn] = useState(false)

  return (
    <>
      <TheaterAvatarMenu allowSignedOut onRequestSignIn={() => setShowSignIn(true)} />
      <SignInModal
        open={showSignIn}
        onClose={() => setShowSignIn(false)}
        subtitle="Save posts into playlists and get them on this leaderboard."
      />
    </>
  )
}
