import { documentInput, queryInput, type SearchDocument } from './documents'

export type Embed = (texts: string[]) => Promise<number[][]>
export interface SearchMatch {
  key: string
  score: number
  text: string
  source: string
}
export interface VectorCache {
  get(key: string): Promise<number[] | undefined>
  put(key: string, vector: number[]): Promise<void>
  retain?(keys: Set<string>): Promise<void>
}

const STOP_WORDS = new Set(
  'a an and are as at be by for from how i in is it me my of on or that the this to was what with you your'.split(
    ' ',
  ),
)
const wordPattern = new RegExp('[\\p{L}\\p{N}]+', 'gu')
function words(text: string): string[] {
  return (text.toLocaleLowerCase().match(wordPattern) || [])
    .filter((word) => !STOP_WORDS.has(word))
    .map((word) =>
      word.length > 4 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word,
    )
}

/** BM25 supplies a small, bounded lexical boost; semantic retrieval still sees every passage. */
function lexicalScores(documents: SearchDocument[], query: string): number[] {
  const terms = [...new Set(words(query))]
  const tokens = documents.map((document) => words(`${document.title}\n${document.text}`))
  const averageLength = tokens.reduce((sum, row) => sum + row.length, 0) / (tokens.length || 1)
  const frequency = new Map(
    terms.map((term) => [term, tokens.filter((row) => row.includes(term)).length]),
  )
  return tokens.map((row) => {
    const coverage = terms.filter((term) => row.includes(term)).length / (terms.length || 1)
    return (
      coverage *
      coverage *
      terms.reduce((score, term) => {
        const tf = row.filter((word) => word === term).length
        if (!tf) return score
        const df = frequency.get(term) || 0
        const idf = Math.log(1 + (tokens.length - df + 0.5) / (df + 0.5))
        return (
          score +
          (idf * tf * 2.2) / (tf + 1.2 * (0.25 + (0.75 * row.length) / (averageLength || 1)))
        )
      }, 0)
    )
  })
}

export function normalizedVector(vector: number[]): number[] {
  if (vector.length !== 768 || vector.some((n) => !Number.isFinite(n))) {
    throw new Error('The search model returned an invalid embedding. Please retry.')
  }
  const norm = Math.sqrt(vector.reduce((sum, n) => sum + n * n, 0))
  if (!norm) throw new Error('The search model returned an empty embedding. Please retry.')
  return vector.map((n) => n / norm)
}

export function rankDocuments(
  documents: SearchDocument[],
  vectors: number[][],
  query: string,
  queryVector: number[],
  allowedKeys?: Set<string>,
): SearchMatch[] {
  const best = new Map<string, SearchMatch>()
  const phrase = query.trim().toLocaleLowerCase()
  const lexical = lexicalScores(documents, query)
  for (let i = 0; i < documents.length; i++) {
    const document = documents[i]
    if (allowedKeys && !allowedKeys.has(document.key)) continue
    const semantic = vectors[i].reduce((sum, n, j) => sum + n * queryVector[j], 0)
    // Preserve precise names and phrases alongside meaning matches. Never present scores as certainty.
    const exact = `${document.title}\n${document.text}`.toLocaleLowerCase().includes(phrase)
    const score = semantic + (0.12 * lexical[i]) / (lexical[i] + 3) + (exact ? 0.08 : 0)
    if (!exact && semantic < 0.3) continue
    const existing = best.get(document.key)
    if (!existing || existing.score < score) {
      best.set(document.key, {
        key: document.key,
        score,
        text: document.text,
        source: document.source,
      })
    }
  }
  return [...best.values()]
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))
    .slice(0, 40)
}

/** Cache only vectors and content hashes: no saved text is persisted by contextual search. */
export class SearchIndex {
  private vectors = new Map<string, number[]>()
  constructor(
    private embed: Embed,
    private cache?: VectorCache,
  ) {}

  async search(
    documents: SearchDocument[],
    query: string,
    progress: (done: number, total: number) => void = () => {},
    current: () => boolean = () => true,
    allowedKeys?: Set<string>,
  ): Promise<SearchMatch[]> {
    const inputs = documents.map(documentInput)
    const hashes = await Promise.all(
      inputs.map(async (input) => {
        const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
        return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('')
      }),
    )
    // Discard deleted/edited passages from both memory and this account's persistent cache.
    const live = new Set(hashes)
    for (const key of this.vectors.keys()) if (!live.has(key)) this.vectors.delete(key)
    await this.cache?.retain?.(live)
    let done = 0
    for (let i = 0; i < inputs.length; i++) {
      if (!current()) return []
      if (!this.vectors.has(hashes[i])) {
        const cached = await this.cache?.get(hashes[i])
        if (cached) this.vectors.set(hashes[i], normalizedVector(cached))
      }
      if (!this.vectors.has(hashes[i])) {
        const [vector] = await this.embed([inputs[i]])
        const normalized = normalizedVector(vector)
        this.vectors.set(hashes[i], normalized)
        await this.cache?.put(hashes[i], normalized)
      }
      progress(++done, inputs.length)
    }
    if (!current() || !query.trim()) return []
    const [queryVector] = await this.embed([queryInput(query)])
    if (!current()) return []
    return rankDocuments(
      documents,
      hashes.map((hash) => this.vectors.get(hash)!),
      query,
      normalizedVector(queryVector),
      allowedKeys,
    )
  }
}
