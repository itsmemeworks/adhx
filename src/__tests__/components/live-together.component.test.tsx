// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import type { FeedItem } from '@/components/feed/types'
import type { Saver } from '@/lib/people/types'
import {
  ArrivalToast,
  ReactButton,
  ReactionFloats,
  ReactionPicker,
  WatchersBar,
} from '@/components/next/moments/LiveTogether'
import {
  arrivalLine,
  namesOf,
  personColour,
  savingLine,
  tuneInLabel,
  watchingLine,
} from '@/components/next/moments/people'
import { applyEvent, type MomentsSnapshot } from '@/components/next/moments/live'
import { cleanReactionText, REACTION_EMOJI, reactionEmoji } from '@/lib/moments/reactions'

const saver = (username: string, extra: Partial<Saver> = {}): Saver => ({
  username,
  name: username[0].toUpperCase() + username.slice(1),
  avatarUrl: null,
  savedAt: '2026-10-19T10:00:00.000Z',
  isYou: false,
  ...extra,
})

const ana = saver('ana')
const ben = saver('ben')
const jo = saver('jo')

describe('live words', () => {
  it('lists names the way people say them', () => {
    expect(namesOf(['Ana'])).toBe('Ana')
    expect(namesOf(['Ana', 'Ben'])).toBe('Ana and Ben')
    expect(namesOf(['Ana', 'Ben', 'Jo'])).toBe('Ana, Ben and Jo')
    expect(namesOf(['Ana', 'Ben', 'Jo'], 5)).toBe('Ana, Ben and 3 others')
    expect(namesOf(['Ana'], 2)).toBe('Ana and 1 other')
  })

  it('says who is saving and who is watching', () => {
    expect(savingLine([ana, ben, jo])).toBe('Ana, Ben and Jo are saving these')
    expect(savingLine([ana])).toBe('Ana is saving these')
    expect(savingLine([ana, saver('pete', { isYou: true })])).toBe('You and Ana are saving these')
    expect(savingLine([ana, ben], 6)).toBe('Ana, Ben and 4 others are saving these')
    expect(savingLine([])).toBe('')
    expect(watchingLine([ana, ben])).toBe('Ana and Ben are watching')
    expect(watchingLine([ana], true)).toBe('Ana is watching with you')
    expect(tuneInLabel([ana, ben])).toBe('Tune in with Ana')
    expect(tuneInLabel([])).toBe('Tune in')
    expect(tuneInLabel(undefined)).toBe('Tune in')
    expect(arrivalLine(jo)).toBe('Jo just saved one')
  })
})

describe('WatchersBar', () => {
  it('names who is watching with you', () => {
    render(<WatchersBar watchers={[ana, ben]} />)
    const bar = screen.getByRole('status')
    expect(bar).toHaveAccessibleName('Ana and Ben are watching with you')
    expect(bar).toHaveTextContent('Ana and Ben are watching with you')
  })

  it('says nothing when nobody else is in', () => {
    const { container } = render(<WatchersBar watchers={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('the React picker', () => {
  it('opens from one React button', () => {
    const onToggle = vi.fn()
    const { rerender } = render(<ReactButton open={false} onToggle={onToggle} />)
    const button = screen.getByRole('button', { name: 'React' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(button)
    expect(onToggle).toHaveBeenCalled()
    rerender(<ReactButton open onToggle={onToggle} />)
    expect(button).toHaveAttribute('aria-expanded', 'true')
  })

  it('sends one of six emoji in a tap', () => {
    const onEmoji = vi.fn()
    render(<ReactionPicker onEmoji={onEmoji} onText={vi.fn()} onClose={vi.fn()} />)
    const row = screen.getByRole('group', { name: 'Quick reactions' })
    const buttons = within(row).getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['😂', '🔥', '😭', '👀', '💀', '❤️'])
    fireEvent.click(within(row).getByRole('button', { name: 'Skull' }))
    expect(onEmoji).toHaveBeenCalledWith('💀')
  })

  it('says a few words, cleaned, and never sends nothing', async () => {
    const onText = vi.fn()
    render(<ReactionPicker onEmoji={vi.fn()} onText={onText} onClose={vi.fn()} />)
    const field = screen.getByRole('textbox', { name: 'Say something' })
    expect(field).toHaveAttribute('placeholder', 'Say something to everyone watching')
    expect(field).toHaveAttribute('maxLength', '80')
    const send = screen.getByRole('button', { name: 'Send' })
    fireEvent.change(field, { target: { value: '   ' } })
    expect(send).toBeDisabled()
    fireEvent.change(field, { target: { value: '  who   sent this 💀 ' } })
    fireEvent.click(send)
    expect(onText).toHaveBeenCalledWith('who sent this 💀')
    await waitFor(() => expect(field).toHaveValue(''))
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(<ReactionPicker onEmoji={vi.fn()} onText={vi.fn()} onClose={onClose} />)
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'React' }), { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})

describe('reaction rules', () => {
  it('allows only the six emoji', () => {
    expect(REACTION_EMOJI).toHaveLength(6)
    expect(reactionEmoji('🔥')).toBe('🔥')
    expect(reactionEmoji('❤')).toBe('❤️')
    for (const bad of ['🍆', 'ha', '', '🔥🔥', 42, null]) expect(reactionEmoji(bad)).toBeNull()
  })

  it('drops control and direction characters from words', () => {
    expect(cleanReactionText('  who\u0007 sent\nthis\t💀  ')).toBe('who sent this 💀')
    expect(cleanReactionText('\u202eevil\u202c')).toBe('evil')
    expect(cleanReactionText('\u0000\u0001')).toBe('')
  })
})

describe('ReactionFloats and the arrival toast', () => {
  it('leads with the face: emoji as a sticker, words as a bubble, never HTML', () => {
    render(
      <ReactionFloats
        reactions={[
          { id: 'r1', saver: ben, emoji: '😂' },
          { id: 'r2', saver: jo, text: '<b>who sent this</b> 💀' },
          { id: 'r3', saver: saver('pete', { isYou: true }), emoji: '🔥' },
        ]}
      />,
    )
    const list = screen.getByRole('list', { name: 'Reactions from people watching' })
    const items = within(list).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Ben: Laughing')
    expect(items[0].querySelector('[data-shape="gob"]')).not.toBeNull()
    expect(items[1]).toHaveTextContent('Jo said:<b>who sent this</b> 💀')
    expect(items[1].querySelector('b')).toBeNull()
    expect(items[2]).toHaveTextContent('You: Fire')
    expect(personColour('jo')).toBe(personColour('jo'))
  })

  it('names who just saved one', () => {
    const onPlay = vi.fn()
    const post = { id: '1', platform: 'twitter', author: 'x', media: [] } as unknown as FeedItem
    render(<ArrivalToast saver={jo} post={post} hue="#c4a7ff" onPlay={onPlay} />)
    expect(screen.getByRole('status')).toHaveTextContent('Jo just saved one')
    expect(screen.getByRole('status')).toHaveTextContent('playing next')
    fireEvent.click(screen.getByRole('button', { name: 'Play now' }))
    expect(onPlay).toHaveBeenCalled()
  })
})

describe('the live client keeps names', () => {
  const moment = {
    slug: 'frog',
    title: 'Frog',
    hue: '#7ee08a',
    people: 2,
    posts: 6,
    lastAt: '2026-10-19T10:00:00.000Z',
    rising: false,
    watching: 1,
    covers: [],
  }
  const base: MomentsSnapshot = {
    label: 'Right now',
    hours: 24,
    moments: [{ ...moment, savers: [ana], watchers: [] }],
    forming: [],
    stream: [],
    stats: { today: 1, lastHour: 1 },
  }

  it('takes watchers from watching events and keeps savers through anonymous updates', () => {
    const watched = applyEvent(base, {
      type: 'watching',
      slug: 'frog',
      watching: 2,
      watchers: [ben],
    })
    expect(watched.moments[0]).toMatchObject({ watching: 2, watchers: [ben], savers: [ana] })
    const saved = applyEvent(watched, {
      type: 'save',
      item: { id: 'x', key: 'twitter:1', at: moment.lastAt, post: {} as never, to: null },
      moment: { ...moment, posts: 7 },
    })
    expect(saved.moments[0]).toMatchObject({ posts: 7, savers: [ana], watchers: [ben] })
    const reacted = applyEvent(saved, {
      type: 'reaction',
      slug: 'frog',
      id: 'r1',
      at: moment.lastAt,
      saver: ana,
      emoji: '😂',
      post: { platform: 'twitter', id: '1' },
    })
    expect(reacted).toBe(saved)
  })
})

it('retains a failed reaction draft and clears it only after an acknowledged retry', async () => {
  const onText = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
  const { rerender } = render(
    <ReactionPicker onEmoji={vi.fn()} onText={onText} onClose={vi.fn()} />,
  )
  const field = screen.getByRole('textbox', { name: 'Say something' })
  fireEvent.change(field, { target: { value: 'keep these words' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
  await waitFor(() => expect(onText).toHaveBeenCalledTimes(1))
  expect(field).toHaveValue('keep these words')
  rerender(
    <ReactionPicker
      onEmoji={vi.fn()}
      onText={onText}
      onClose={vi.fn()}
      error="That didn’t send."
    />,
  )
  expect(screen.getByRole('status')).toHaveTextContent('That didn’t send.')
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await waitFor(() => expect(field).toHaveValue(''))
  expect(onText.mock.calls.map(([text]) => text)).toEqual(['keep these words', 'keep these words'])
})

it('allows forty emoji code points and makes pending sends clear and non-interactive', () => {
  const { rerender } = render(
    <ReactionPicker onEmoji={vi.fn()} onText={vi.fn()} onClose={vi.fn()} />,
  )
  const field = screen.getByRole('textbox', { name: 'Say something' })
  fireEvent.change(field, { target: { value: '💀'.repeat(41) } })
  expect(field).toHaveValue('💀'.repeat(40))
  rerender(<ReactionPicker onEmoji={vi.fn()} onText={vi.fn()} onClose={vi.fn()} disabled />)
  expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled()
  expect(field).toBeDisabled()
  expect(screen.getByText('Live reactions disappear after a few seconds.')).toBeInTheDocument()
})
