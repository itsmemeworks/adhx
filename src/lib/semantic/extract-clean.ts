/**
 * Junk filters for words read out of media: what Whisper heard in a video
 * and what Florence-2 read on screen. Pure (no database, no model), so the
 * jobs child, the native Mac worker and the server's result check all apply
 * the same rules.
 *
 * Speech models invent words on silence and music ("Thank you for
 * watching", "[Music]", a word repeated 200 times); OCR models read noise as
 * a stray "0". Nothing is better than a wrong caption: these results would
 * otherwise match searches they have nothing to do with.
 */

/** One 30-second window as the speech model heard it. */
export interface SpeechWindow {
  text: string
  /** Detected language code (`en`, `de`, …). */
  language: string | null
  /** The model's probability that the window has no speech at all (0–1). */
  noSpeech: number
}

/** One picture or frame as the text reader saw it. */
export interface ScreenRead {
  lines: { text: string; box: number[] }[]
  width: number
  height: number
}

/** Stored words are capped: the post's own words come first in its document. */
export const MAX_SPEECH_CHARS = 6000
export const MAX_SCREEN_CHARS = 1500
/** Whisper's own cut-off: above this, a window is treated as silence or music. */
export const NO_SPEECH_MAX = 0.6

const NON_SPEECH_TAG =
  /[[(（【][^\])）】]{0,40}(music|musique|musik|música|applause|laugh|silence|noise|inaudible|blank|sound|sigh|cough|static|beep|instrumental|singing)[^\])）】]{0,40}[\])）】]/giu

/** Whole-window outputs Whisper is known to invent on silence, music or an outro. */
const HALLUCINATED = [
  /^(and )?(thanks|thank you)( (so|very) much)?( for (watching|listening|viewing))?( and see you( next time)?)?$/i,
  /^(please )?(like (and|&) )?subscribe( to (my|the|our) channel)?$/i,
  /^see you (next time|in the next (one|video))$/i,
  /^(bye|bye bye|you|oh|uh|um|hmm|okay|ok|so)$/i,
  /subtitles? (by|from|made by)/i,
  /\bamara\.org\b/i,
  /^(transcribed|transcription|captions?) by/i,
  /^untertitel (der|von|im auftrag)/i,
  /^sous-titr(es|age)/i,
  /^subtítulos (realizados )?por/i,
  /^ご視聴ありがとうございました$/u,
  /^字幕/u,
]

/** Scripts written without spaces between words. */
const UNSPACED =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}]/u

function letters(text: string): number {
  return text.match(/\p{L}/gu)?.length ?? 0
}

function words(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
}

/** "no no no no no no" and "I'm sorry. I'm sorry. I'm sorry. I'm sorry." become one. */
export function collapseRepeats(text: string): string {
  let out = text
  for (let i = 0; i < 3; i++) {
    const next = out.replace(/(\S(?:.{0,60}?\S)?)(?:[\s,.!?;:-]+\1(?![\p{L}\p{N}])){3,}/giu, '$1')
    if (next === out) break
    out = next
  }
  return out
}

/** One window's words without non-speech tags, notes or loops; '' when it's an invented line. */
export function cleanSpeechText(raw: string): string {
  const text = collapseRepeats(
    raw
      .replace(NON_SPEECH_TAG, ' ')
      .replace(/[♪♫♬🎵🎶]+/gu, ' ')
      .replace(/\*[^*]{0,40}\*/g, ' ')
      .replace(/(^|\s)[.…·•\-–—_~]{2,}(?=\s|$)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  )
  const bare = text
    .replace(/[\s.,!?;:…"'“”‘’()[\]-]+$/u, '')
    .replace(/^[\s.,!?;:…"'“”‘’()[\]-]+/u, '')
  if (!bare || HALLUCINATED.some((pattern) => pattern.test(bare))) return ''
  return letters(bare) ? text : ''
}

/** Enough real words to be worth searching: not a lone "okay", a stray symbol or a loop. */
export function enoughWords(text: string, minWords = 3): boolean {
  const all = words(text)
  if (letters(text) < (UNSPACED.test(text) ? 4 : 10)) return false
  if (!UNSPACED.test(text) && all.length < minWords) return false
  if (all.length >= 12 && new Set(all).size / all.length < 0.25) return false
  return true
}

function cap(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return (space > max * 0.8 ? cut.slice(0, space) : cut).toWellFormed()
}

/**
 * The transcript worth keeping from a video's windows, or null for silence,
 * music, an outro line or noise. Language is the one most windows spoke.
 */
export function cleanTranscript(
  windows: SpeechWindow[],
): { text: string; language: string | null } | null {
  const kept: { text: string; language: string | null }[] = []
  for (const window of windows) {
    if (!(window.noSpeech <= NO_SPEECH_MAX)) continue
    const text = cleanSpeechText(window.text ?? '')
    if (text) kept.push({ text, language: window.language })
  }
  const text = collapseRepeats(kept.map((w) => w.text).join(' '))
  if (!enoughWords(text)) return null
  const counts = new Map<string, number>()
  for (const w of kept) if (w.language) counts.set(w.language, (counts.get(w.language) ?? 0) + 1)
  const language = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  return { text: cap(text, MAX_SPEECH_CHARS), language }
}

function keyOf(line: string): string {
  return line
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

/** A line the reader is sure of: big enough to be real text, mostly letters, not one repeated mark. */
export function plausibleLine(text: string, box: number[], width: number, height: number): boolean {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (letters(clean) < 2) return false
  const visible = clean.replace(/\s/g, '')
  if (letters(clean) / visible.length < 0.5) return false
  if (/^(.)\1*$/u.test(visible)) return false
  if (box.length >= 8 && width > 0 && height > 0) {
    const xs = [box[0], box[2], box[4], box[6]]
    const ys = [box[1], box[3], box[5], box[7]]
    const w = Math.max(...xs) - Math.min(...xs)
    const h = Math.max(...ys) - Math.min(...ys)
    // A sliver in a corner is the reader making something up.
    if (w < 4 || h < 4 || (w * h) / (width * height) < 0.0005) return false
  }
  return true
}

/**
 * Text on screen across a post's pictures and frames: plausible lines only,
 * each kept once (subtitles and watermarks repeat across frames), in reading
 * order. Null when nothing readable is left.
 */
export function cleanScreenText(reads: ScreenRead[]): string | null {
  const seen = new Set<string>()
  const lines: string[] = []
  for (const read of reads) {
    for (const line of read.lines ?? []) {
      if (typeof line?.text !== 'string') continue
      const text = collapseRepeats(
        line.text
          .replace(/<\/?[a-z_]+>/gi, ' ')
          .replace(/\s+/g, ' ')
          .trim(),
      )
      if (!plausibleLine(text, Array.isArray(line.box) ? line.box : [], read.width, read.height))
        continue
      const key = keyOf(text)
      if (!key || seen.has(key)) continue
      seen.add(key)
      lines.push(text)
    }
  }
  const text = lines.join('\n')
  if (!enoughWords(text, 2) && !lines.some((l) => /\p{L}{3,}/u.test(l) && letters(text) >= 4))
    return null
  return cap(text, MAX_SCREEN_CHARS)
}

/**
 * The server's check on words a worker sends back: bounded, well-formed and
 * passed through the same filter, so a remote result can't add junk.
 */
export function acceptExtracted(kind: 'speech' | 'screen', text: unknown): string | null {
  if (typeof text !== 'string') return null
  const bounded = text.slice(0, 4 * (kind === 'speech' ? MAX_SPEECH_CHARS : MAX_SCREEN_CHARS))
  const wellFormed = bounded.toWellFormed().replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ')
  if (kind === 'speech') {
    return cleanTranscript([{ text: wellFormed, language: null, noSpeech: 0 }])?.text ?? null
  }
  return cleanScreenText([
    {
      lines: wellFormed.split('\n').map((line) => ({ text: line, box: [] })),
      width: 0,
      height: 0,
    },
  ])
}
