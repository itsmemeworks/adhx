import { describe, expect, it } from 'vitest'
import {
  MAX_SPEECH_CHARS,
  acceptExtracted,
  cleanScreenText,
  cleanSpeechText,
  cleanTranscript,
  collapseRepeats,
  enoughWords,
  plausibleLine,
  type ScreenRead,
} from '@/lib/semantic/extract-clean'

const said = (text: string, language: string | null = 'en', noSpeech = 0.01) => ({
  text,
  language,
  noSpeech,
})

describe('speech junk filter', () => {
  it('keeps real speech and the language most windows spoke', () => {
    const out = cleanTranscript([
      said(' The cat screams at the cucumber.'),
      said('She jumped so high!'),
      said('Und dann hat sie geschrien.', 'de'),
    ])
    expect(out).toEqual({
      text: 'The cat screams at the cucumber. She jumped so high! Und dann hat sie geschrien.',
      language: 'en',
    })
  })

  it('drops silence, music and the lines Whisper invents on them', () => {
    expect(cleanTranscript([])).toBeNull()
    expect(cleanTranscript([said('', null, 1)])).toBeNull()
    // Music: a likely no-speech window is never kept, even with words.
    expect(cleanTranscript([said('I love you so much baby tonight', 'en', 0.8)])).toBeNull()
    expect(cleanTranscript([said('[Music]'), said('♪ ♪ ♪'), said('(applause)')])).toBeNull()
    expect(cleanTranscript([said(' Thank you for watching!')])).toBeNull()
    expect(cleanTranscript([said('Thanks for watching and see you next time.')])).toBeNull()
    expect(cleanTranscript([said('Subtitles by the Amara.org community')])).toBeNull()
    expect(cleanTranscript([said('Untertitel im Auftrag des ZDF, 2021', 'de')])).toBeNull()
    expect(cleanTranscript([said('........................................')])).toBeNull()
    expect(cleanTranscript([said('you')])).toBeNull()
  })

  it('keeps the speech around a music tag', () => {
    expect(cleanSpeechText('[MUSIC PLAYING] okay here we go, the frog is back')).toBe(
      'okay here we go, the frog is back',
    )
  })

  it('collapses loops and rejects transcripts that are only a loop', () => {
    expect(collapseRepeats('no no no no no no wait')).toBe('no wait')
    expect(collapseRepeats('I am sorry. I am sorry. I am sorry. I am sorry. okay')).toBe(
      'I am sorry. okay',
    )
    // Three in a row is ordinary speech.
    expect(collapseRepeats('ha ha ha')).toBe('ha ha ha')
    expect(cleanTranscript([said(Array(80).fill('you').join(' '))])).toBeNull()
  })

  it('needs a few real words, but understands scripts without spaces', () => {
    expect(enoughWords('ok cool')).toBe(false)
    expect(enoughWords('the frog is singing')).toBe(true)
    expect(enoughWords('猫がきゅうりに驚いた')).toBe(true)
    expect(cleanTranscript([said('猫がきゅうりに驚いた', 'ja')])?.language).toBe('ja')
  })

  it('caps very long transcripts at a word boundary', () => {
    const long = Array.from({ length: 3000 }, (_, i) => `word${i}`).join(' ')
    const out = cleanTranscript([said(long)])!
    expect(out.text.length).toBeLessThanOrEqual(MAX_SPEECH_CHARS)
    expect(out.text.endsWith(' ')).toBe(false)
    expect(long.startsWith(out.text)).toBe(true)
  })
})

function read(lines: [string, number[]][], width = 800, height = 800): ScreenRead {
  return { width, height, lines: lines.map(([text, box]) => ({ text, box })) }
}
const box = (x: number, y: number, w: number, h: number) => [x, y, x + w, y, x + w, y + h, x, y + h]

describe('on-screen text junk filter', () => {
  it('keeps a meme caption, line by line', () => {
    expect(
      cleanScreenText([
        read([
          ['WHEN THE WIFI', box(160, 25, 475, 74)],
          ['GOES DOWN FOR 5 SECONDS', box(52, 686, 697, 61)],
        ]),
      ]),
    ).toBe('WHEN THE WIFI\nGOES DOWN FOR 5 SECONDS')
  })

  it('drops what the reader invents on a blank picture', () => {
    // Florence-2 on a plain green square: "0" in a sliver of a box.
    expect(
      cleanScreenText([read([['0', [0.32, 0.32, 0.32, 0.96, 0.32, 18.88, 0.32, 17.6]]])]),
    ).toBe(null)
    expect(cleanScreenText([read([['0:00:00 PM - 0:00 AM', box(0, 0, 140, 10)]])])).toBeNull()
    expect(cleanScreenText([read([['iiiiiiii', box(10, 10, 300, 40)]])])).toBeNull()
    expect(cleanScreenText([])).toBeNull()
  })

  it('reads each subtitle once across frames and drops slivers', () => {
    const frame = (extra: [string, number[]][] = []) =>
      read([['she HATES the cucumber', box(74, 275, 492, 38)], ...extra], 640, 360)
    expect(
      cleanScreenText([
        frame(),
        frame([['SHE hates the cucumber!', box(74, 275, 492, 38)]]),
        frame([['tiny', box(1, 1, 2, 2)]]),
      ]),
    ).toBe('she HATES the cucumber')
  })

  it('judges a line by its letters and its box', () => {
    expect(plausibleLine('nobody:', box(56, 78, 191, 47), 1080, 1350)).toBe(true)
    expect(plausibleLine('12:45 · 3/4', box(56, 78, 191, 47), 1080, 1350)).toBe(false)
    expect(plausibleLine('a sliver', box(0, 0, 3, 40), 1080, 1350)).toBe(false)
    // Worker results carry no boxes: letters alone decide.
    expect(plausibleLine('what if frogs had pockets', [], 0, 0)).toBe(true)
  })
})

describe('server check on worker words', () => {
  it('applies the same filters and bounds to remote results', () => {
    expect(acceptExtracted('speech', 'Thank you for watching!')).toBeNull()
    expect(acceptExtracted('speech', 'the cat screams at the cucumber')).toBe(
      'the cat screams at the cucumber',
    )
    expect(acceptExtracted('screen', 'WHEN THE WIFI\nGOES DOWN\n0')).toBe(
      'WHEN THE WIFI\nGOES DOWN',
    )
    expect(acceptExtracted('screen', 42)).toBeNull()
    expect(acceptExtracted('speech', `bad\u0000control chars in the speech here`)).toBe(
      'bad control chars in the speech here',
    )
  })
})
