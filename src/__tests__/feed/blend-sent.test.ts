import { describe, expect, it } from 'vitest'
import {
  blend,
  scoreCandidate,
  sentLine,
  type BlendCandidate,
  type BlendContext,
  type BlendSave,
} from '@/lib/feed/blend'
import { reconcileForming } from '@/lib/moments/group'

/**
 * Pure rules behind the board features: a post someone sent you leads New
 * with who sent it; "Like … you kept" names the kept post; a forming group's
 * bell follows its posts through merges and regroups.
 */

const NOW = Date.parse('2026-10-20T12:00:00Z')
const H = 3_600_000
const ME = 'me'

function save(userId: string, username: string, hoursAgo: number): BlendSave {
  return {
    userId,
    username,
    name: username[0].toUpperCase() + username.slice(1),
    savedAt: NOW - hoursAgo * H,
  }
}

function post(
  key: string,
  saves: BlendSave[],
  extra: Partial<BlendCandidate> = {},
): BlendCandidate {
  return { key, saves, similarity: null, seen: false, ...extra }
}

const ctx: BlendContext = { viewerId: ME, now: NOW, closeness: new Map(), weights: {}, seed: 's1' }

describe('sent to you', () => {
  it('says who sent it', () => {
    expect(sentLine(['Pete'])).toBe('Pete sent you this')
    expect(sentLine(['Pete', 'Ana'])).toBe('Pete and Ana sent you this')
    expect(sentLine(['Pete', 'Ana', 'Jo'])).toBe('Pete and 2 others sent you this')
  })

  it('leads with the sender, carries the note, and plays first in New', () => {
    const sent = post('x:old', [save('u-ana', 'ana', 200), save('u-pete', 'pete', 300)], {
      sent: [{ username: 'pete', name: 'Pete', at: NOW - H, note: 'this is so you' }],
    })
    const fresh = [1, 2, 3].map((i) => post(`x:f${i}`, [save('u-ben', 'ben', 0.1 * i)]))
    const scored = scoreCandidate(sent, ctx, 'new')!
    expect(scored.reasons[0]).toEqual({
      kind: 'sent',
      text: 'Pete sent you this',
      username: 'pete',
      note: 'this is so you',
    })
    const order = blend([...fresh, sent], ctx, 'new').map((p) => p.key)
    expect(order[0]).toBe('x:old')
    // Elsewhere it keeps its place; in Mine there's no "sent".
    expect(blend([...fresh, sent], ctx, 'everyone')[0].key).not.toBe('x:old')
    const mine = post('x:old', [save(ME, 'me', 1)], { sent: sent.sent })
    expect(scoreCandidate(mine, ctx, 'mine')!.reasons.some((r) => r.kind === 'sent')).toBe(false)
  })

  it('names the kept post on a like reason', () => {
    const like = post('x:frog', [save('u-ana', 'ana', 1)], {
      similarity: 0.9,
      like: { label: 'the frog videos', topic: 'frogs', post: { platform: 'x', id: 'k1' } },
    })
    const reasons = scoreCandidate(like, ctx, 'everyone', 1)!.reasons
    expect(reasons.find((r) => r.kind === 'like')).toEqual({
      kind: 'like',
      text: 'Like the frog videos you kept',
      post: { platform: 'x', id: 'k1' },
    })
  })
})

describe('bells across regroups', () => {
  it('carries to the group holding most posts, alerts on a moment, drops the rest', () => {
    const out = reconcileForming(
      [
        { id: 'f1', keys: ['a', 'b', 'c'] },
        { id: 'f2', keys: ['d', 'e'] },
        { id: 'f3', keys: ['x'] },
        { id: 'f4', keys: ['q'] },
      ],
      [
        { id: 'f4', keys: ['q'] },
        { id: 'f5', keys: ['a', 'b', 'z'] },
        { id: 'f6', keys: ['c'] },
      ],
      [{ slug: 'm-1', title: 'Moment', keys: ['d', 'e', 'k'] }],
    )
    expect(out).toEqual({
      carry: [{ from: 'f1', to: 'f5' }],
      formed: [{ from: 'f2', slug: 'm-1', title: 'Moment' }],
      dropped: ['f3'],
    })
  })
})
