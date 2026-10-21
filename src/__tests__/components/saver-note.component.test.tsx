// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { Saver } from '@/lib/people/types'
import { bylineNote, SaverNote } from '@/components/next/SaverNote'
import { SaversButton } from '@/components/next/SaverFaces'
import { NoteField } from '@/components/next/NoteField'
import { SaveSheet } from '@/components/next/theater/TheaterSheets'

const saver = (username: string, extra: Partial<Saver> = {}): Saver => ({
  username,
  name: username[0].toUpperCase() + username.slice(1),
  avatarUrl: null,
  savedAt: '2026-10-18T10:00:00.000Z',
  isYou: false,
  ...extra,
})

describe('SaverNote', () => {
  it('renders nothing without a note', () => {
    const { container } = render(<SaverNote saver={saver('ana')} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('a bubble says whose note it is, as text', () => {
    render(<SaverNote saver={saver('mum', { note: '<b>making</b> this Sunday' })} />)
    const bubble = screen.getByRole('figure')
    expect(bubble).toHaveTextContent('Mum’s note: <b>making</b> this Sunday')
    expect(bubble.querySelector('b')).toBeNull()
  })

  it('the byline picks the newest friend’s note, else yours', () => {
    const you = saver('pete', { isYou: true, note: 'mine' })
    expect(bylineNote([you, saver('ana'), saver('ben', { note: 'theirs' })])?.username).toBe('ben')
    expect(bylineNote([you, saver('ana')])?.username).toBe('pete')
    expect(bylineNote([saver('ana')])).toBeUndefined()
  })
})

describe('SaversButton with notes', () => {
  const savers = [
    saver('ana', { note: 'the original and still the best' }),
    saver('ben'),
    saver('pete', { isYou: true }),
  ]

  it('shows the note as a bubble on the byline, and each note in Who saved it', () => {
    render(<SaversButton savers={savers} />)
    expect(screen.getByRole('figure')).toHaveTextContent('the original and still the best')
    fireEvent.click(screen.getByRole('button', { name: /saved this|others/ }))
    const dialog = screen.getByRole('dialog', { name: 'Who saved it' })
    expect(within(dialog).getByText('“the original and still the best”')).toBeInTheDocument()
    expect(within(dialog).getAllByText(/“/)).toHaveLength(1)
  })

  it('leaves the bubble off the top chips (popover still has it)', () => {
    render(<SaversButton savers={savers} placement="below" tone="plate" />)
    expect(screen.queryByRole('figure')).toBeNull()
  })

  it('no notes, no bubble', () => {
    render(<SaversButton savers={[saver('ben')]} />)
    expect(screen.queryByRole('figure')).toBeNull()
  })
})

describe('NoteField', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  const answer = (note: string | null) =>
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ note }) })

  it('saves your note on Enter, cleaned, and reports it', async () => {
    const onSaved = vi.fn()
    answer('this is so you, Ben')
    render(<NoteField platform="instagram" id="abc" initial={null} onSaved={onSaved} />)
    const input = screen.getByLabelText('Add a note')
    fireEvent.change(input, { target: { value: '  this is so you,   Ben ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('this is so you, Ben'))
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/bookmarks/abc/note',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ platform: 'instagram', note: 'this is so you, Ben' }),
      }),
    )
    expect(screen.getByText('Saved')).toBeInTheDocument()
  })

  it('clearing the words clears the note; unchanged words send nothing', async () => {
    const onSaved = vi.fn()
    answer(null)
    render(<NoteField platform="twitter" id="1" initial="you’re welcome" onSaved={onSaved} />)
    const input = screen.getByLabelText('Add a note')
    fireEvent.blur(input)
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.blur(input)
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(null))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ platform: 'twitter', note: null })
  })

  it('counts near the limit and stops at 140, an emoji counting once', () => {
    render(<NoteField platform="twitter" id="1" initial={null} />)
    const input = screen.getByLabelText('Add a note') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'x'.repeat(100) } })
    expect(screen.queryByText(/\/140/)).toBeNull()
    fireEvent.change(input, { target: { value: '👍'.repeat(125) } })
    expect(screen.getByText('125/140')).toBeInTheDocument()
    fireEvent.change(input, { target: { value: '👍'.repeat(150) } })
    expect(input.value).toBe('👍'.repeat(140))
    expect(screen.getByText('140/140')).toBeInTheDocument()
  })

  it('says so when it couldn’t save', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'nope' }) })
    render(<NoteField platform="twitter" id="1" initial={null} />)
    const input = screen.getByLabelText('Add a note')
    fireEvent.change(input, { target: { value: 'hi' } })
    await act(async () => {
      fireEvent.blur(input)
    })
    expect(await screen.findByText('Couldn’t save that. Try again.')).toBeInTheDocument()
  })
})

describe('SaveSheet', () => {
  const props = {
    channels: [],
    selected: new Set<string>(),
    busy: null,
    created: null,
    onToggle: vi.fn(),
    onCreate: vi.fn(),
    onCopy: vi.fn(),
    onClose: vi.fn(),
  }

  it('has an Add a note field for your save', () => {
    render(<SaveSheet {...props} note={{ platform: 'twitter', id: '1', value: 'hello' }} />)
    expect(screen.getByLabelText('Add a note')).toHaveValue('hello')
  })

  it('has none without a save to note', () => {
    render(<SaveSheet {...props} />)
    expect(screen.queryByLabelText('Add a note')).toBeNull()
  })
})
