import { queryPrompt } from '@/lib/semantic/documents'
import { askJev, jevAvailable } from '@/lib/semantic/jev'
import { embedQueries } from '@/lib/semantic/supervisor'
import { truncate } from '@/lib/semantic/vector-index'
import { MOMENT_TOPICS } from './topics'

/**
 * A short name for a group of posts: the closest topics from
 * `MOMENT_TOPICS` plus the group's most telling word, with Jev picking the
 * best fit for a few sample posts. Every step degrades: no Jev → closest
 * topic (or the telling word when most posts share it); no model → the word,
 * else "Something new".
 */

const CANDIDATE_TOPICS = 5
const SAMPLE_POSTS = 6
const NAMING_TIMEOUT_MS = 4_000

// One string, then split: `.split` must apply to the whole list, not just the
// second half (that made a Set of characters, so no word was ever a stopword).
const STOP = new Set(
  (
    'the and for you are but not was app apps all any can had her his one our out get has him how its may new now old see two way who did let say she too use lol omg wtf idk yes why got put own off via per lot bit big day man men guy ' +
    'about after again also been before being both could does doing down each even ever every from have here into just like look made make many more most much must only other over really same should since some such than that their them then there these they this those through very want were what when where which while with would your yours just thats dont cant wont youre im ive its it’s http https www com status video photo post posts thread today going gonna watch every still never always thing things people time year years good great best first last know need think right make well back ' +
    'across along among around against above below behind beside between beyond inside outside onto upon under within without toward towards near'
  ).split(' '),
)

export interface NamingDeps {
  embedTopics?: (prompts: string[]) => Promise<Float32Array[]>
  choose?: (candidates: string[], samples: string[]) => Promise<string | null>
}

const g = globalThis as unknown as { __adhxMomentTopics?: Float32Array[] | null }

async function topicVectors(deps: NamingDeps): Promise<Float32Array[] | null> {
  if (g.__adhxMomentTopics) return g.__adhxMomentTopics
  try {
    const embed = deps.embedTopics ?? embedQueries
    const full = await embed(MOMENT_TOPICS.map((t) => queryPrompt(t)))
    g.__adhxMomentTopics = full.map((v) => truncate(v))
    return g.__adhxMomentTopics
  } catch {
    return null
  }
}

/** The word most of these posts share (as a title), and how many share it. */
export function tellingWord(texts: string[]): { word: string; share: number } | null {
  const counts = new Map<string, number>()
  for (const text of texts) {
    const words = new Set(
      text
        .toLowerCase()
        .replace(/https?:\/\/\S+/g, ' ')
        .replace(/[#@]/g, ' ')
        .split(/[^\p{L}\p{N}]+/u)
        .filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w)),
    )
    for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1)
  }
  let best: { word: string; n: number } | null = null
  for (const [word, n] of counts) {
    if (n >= 2 && (!best || n > best.n)) best = { word, n }
  }
  if (!best) return null
  return {
    word: best.word.charAt(0).toUpperCase() + best.word.slice(1),
    share: best.n / texts.length,
  }
}

function dot(a: Float32Array, b: Float32Array): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

async function chooseWithJev(candidates: string[], samples: string[]): Promise<string | null> {
  if (!jevAvailable() || candidates.length < 2) return null
  const ids = candidates.map((_, i) => `n${i + 1}`)
  try {
    const answers = await askJev(
      { posts: samples },
      {
        name: {
          type: 'choice',
          instructions:
            'Lots of people are saving posts like these right now. Which short name best says what they are about?',
          criteria: Object.fromEntries(candidates.map((c, i) => [ids[i], c])),
        },
      },
      NAMING_TIMEOUT_MS,
    )
    const pick = answers['name']?.choice
    const i = pick ? ids.indexOf(pick) : -1
    return i >= 0 ? candidates[i] : null
  } catch {
    return null
  }
}

/** Name a group. `taken` names are skipped so two moments never share one. */
export async function nameMoment(
  centroid: Float32Array,
  texts: string[],
  taken: ReadonlySet<string>,
  deps: NamingDeps = {},
  opts: { useJev?: boolean } = {},
): Promise<string> {
  const word = tellingWord(texts)
  const vectors = await topicVectors(deps)
  const topics = vectors
    ? MOMENT_TOPICS.map((t, i) => ({ t, s: dot(centroid, vectors[i]) }))
        .sort((a, b) => b.s - a.s)
        .map((x) => x.t)
        .filter((t) => !taken.has(t))
        .slice(0, CANDIDATE_TOPICS)
    : []
  const candidates = [...topics]
  if (word && word.share >= 0.4 && !taken.has(word.word) && !candidates.includes(word.word)) {
    candidates.push(word.word)
  }
  if (candidates.length === 0) return 'Something new'

  if (opts.useJev !== false) {
    const samples = texts.filter(Boolean).slice(0, SAMPLE_POSTS)
    const choose = deps.choose ?? chooseWithJev
    const picked = samples.length ? await choose(candidates, samples) : null
    if (picked) return picked
  }
  if (word && word.share >= 0.5 && !taken.has(word.word)) return word.word
  return candidates[0]
}
