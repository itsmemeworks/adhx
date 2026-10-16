/**
 * Measure search quality on labelled queries against a local database.
 *
 *   SEMANTIC_CACHE_DIR=… tsx scripts/eval-search.ts --user <userId> queries.json [more.json]
 *
 * Each file is `[{ "query": "...", "expected": ["twitter:123", ...] }]`.
 * Prints hit@1, hit@5 and MRR for the fused order and, when TYPESAFE_API_KEY
 * is set, after the Jev rerank. Loads the model in-process (dev tool only).
 * Used to choose `TUNING` in src/lib/semantic/search.ts and `RERANK_TUNING`.
 */
import { readFileSync } from 'node:fs'
import { embedTexts } from '../src/lib/semantic/model'
import { searchPosts } from '../src/lib/semantic/search'
import { loadSearchItems } from '../src/lib/semantic/items'
import { rerank, rerankAvailable } from '../src/lib/semantic/rerank'
import { backfillKeywordIndex } from '../src/lib/semantic/worker'

type Labelled = { query: string; expected: string[] }

const args = process.argv.slice(2)
const userAt = args.indexOf('--user')
const userId = userAt >= 0 ? args[userAt + 1] : undefined
const files = args.filter((a, i) => a !== '--user' && i !== userAt + 1)
if (!userId || files.length === 0) {
  console.error('usage: tsx scripts/eval-search.ts --user <userId> queries.json [...]')
  process.exit(1)
}

const embed = async (prompt: string) => (await embedTexts([prompt]))[0]
const totals = { fused: { h1: 0, h5: 0, mrr: 0 }, refined: { h1: 0, h5: 0, mrr: 0 } }
let n = 0

function tally(into: { h1: number; h5: number; mrr: number }, rank: number) {
  if (rank === 1) into.h1++
  if (rank > 0 && rank <= 5) into.h5++
  if (rank > 0) into.mrr += 1 / rank
}

await backfillKeywordIndex()
for (const file of files) {
  for (const q of JSON.parse(readFileSync(file, 'utf8')) as Labelled[]) {
    n++
    const { hits } = await searchPosts(
      {
        q: `${q.query} `,
        scope: 'mine',
        type: 'all',
        wordsOnly: false,
        userId,
        limit: 50,
        offset: 0,
      },
      { embed },
    )
    const fusedRank = hits.findIndex((h) => q.expected.includes(h.key)) + 1
    tally(totals.fused, fusedRank)
    let refinedRank = fusedRank
    if (rerankAvailable()) {
      const items = await loadSearchItems(hits, userId)
      const reranked = await rerank(
        q.query,
        items.map((i) => ({
          key: `${i.post.platform}:${i.post.id}`,
          item: i.post,
          visual: i.matched[0] === 'picture' || i.matched[0] === 'video',
        })),
      )
      if (reranked) refinedRank = reranked.order.findIndex((c) => q.expected.includes(c.key)) + 1
      tally(totals.refined, refinedRank)
    }
    console.log(
      String(fusedRank || '-').padStart(3),
      String(refinedRank || '-').padStart(3),
      q.query,
    )
  }
}
const fmt = (t: { h1: number; h5: number; mrr: number }) =>
  `hit@1=${(t.h1 / n).toFixed(2)} hit@5=${(t.h5 / n).toFixed(2)} mrr=${(t.mrr / n).toFixed(3)}`
console.log(`\nfused   ${fmt(totals.fused)}`)
if (rerankAvailable()) console.log(`refined ${fmt(totals.refined)}`)
process.exit(0)
