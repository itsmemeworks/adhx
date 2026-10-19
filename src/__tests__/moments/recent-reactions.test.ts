import { describe, it, expect, beforeEach } from 'vitest'
import { __resetPresence, recentReactions, sendReaction } from '@/lib/moments/presence'

describe('recent reactions for phones that poll', () => {
  beforeEach(() => __resetPresence())

  const post = { platform: 'reddit', id: 'abc' }

  it('keeps the last few seconds of a moment, oldest first', () => {
    const first = sendReaction({ slug: 'babies', userId: 'u_ana', emoji: '😂', post })
    const second = sendReaction({ slug: 'babies', userId: 'u_ben', text: 'again', post })
    sendReaction({ slug: 'synths', userId: 'u_jo', emoji: '🔥', post })

    expect(recentReactions('babies').map((r) => r.id)).toEqual([first.id, second.id])
    expect(recentReactions('synths')).toHaveLength(1)
    expect(recentReactions('nothing-here')).toEqual([])
  })

  it('forgets reactions after 15 seconds', () => {
    sendReaction({ slug: 'babies', userId: 'u_ana', emoji: '😂', post })
    expect(recentReactions('babies', Date.now() + 14_000)).toHaveLength(1)
    expect(recentReactions('babies', Date.now() + 16_000)).toEqual([])
  })
})
