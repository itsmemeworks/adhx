/** Local-only evaluation: never commit the corpus, questions, vectors, or reports. */
import { readFileSync, writeFileSync } from 'node:fs'
import { env } from '@huggingface/transformers'
import { buildSearchDocuments } from '../src/lib/search/documents'
import { SearchIndex } from '../src/lib/search/engine'
import { loadSearchModel, SEARCH_MODEL, SEARCH_REVISION } from '../src/lib/search/model'
import type { FeedItem } from '../src/components/feed/types'

const [corpusPath, questionsPath, outputPath] = process.argv.slice(2)
if (!corpusPath || !questionsPath || !outputPath) {
  throw new Error(
    'Usage: pnpm search:evaluate <private-corpus.json> <private-questions.json> <report.json>',
  )
}
const input = JSON.parse(readFileSync(corpusPath, 'utf8'))
const items: FeedItem[] = Array.isArray(input) ? input : input.items
const questions: Array<{ query: string; expected: string[] }> = JSON.parse(
  readFileSync(questionsPath, 'utf8'),
)
if (!Array.isArray(items) || !questions.length)
  throw new Error('A corpus and labelled queries are required')
const keys = new Set(items.map((item) => `${item.platform || 'twitter'}:${item.id}`))
for (const question of questions) {
  if (!question.expected.length || question.expected.some((key) => !keys.has(key))) {
    throw new Error(`Expected bookmark is missing for query: ${question.query}`)
  }
}
env.cacheDir = process.env.SEARCH_MODEL_CACHE || '../model-cache'
const started = performance.now()
const embed = await loadSearchModel('cpu')
const loaded = performance.now()
const documents = buildSearchDocuments(items)
const index = new SearchIndex(embed)
const results = []
for (const [i, question] of questions.entries()) {
  const start = performance.now()
  const matches = await index.search(documents, question.query, (done, total) => {
    if (i === 0 && (done === total || done % 100 === 0))
      console.log(`Indexed ${done}/${total} passages`)
  })
  const phrase = question.query.toLowerCase()
  // Match the existing /api/feed literal baseline, including preview metadata.
  const literal = items
    .filter((item) =>
      [
        item.text,
        item.author,
        item.authorName,
        item.articlePreview?.title,
        item.articlePreview?.description,
        ...(item.links || []).flatMap((link) => [link.previewTitle, link.previewDescription]),
      ].some((text) => text?.toLowerCase().includes(phrase)),
    )
    .map((item) => `${item.platform || 'twitter'}:${item.id}`)
  const rank = matches.findIndex((match) => question.expected.includes(match.key)) + 1
  results.push({
    ...question,
    rank: rank || null,
    literalMatches: literal.length,
    literalHit: literal.some((key) => question.expected.includes(key)),
    elapsedMs: Math.round(performance.now() - start),
    top5: matches.slice(0, 5).map((match) => ({ ...match, text: match.text.slice(0, 320) })),
  })
  console.log(`${i + 1}/${questions.length}: rank=${rank || 'not in top 40'} ${question.query}`)
}
const report = {
  model: SEARCH_MODEL,
  revision: SEARCH_REVISION,
  dtype: 'q4',
  device: 'cpu',
  source: input.source || 'Provided FeedItem corpus',
  bookmarks: items.length,
  passages: documents.length,
  queries: questions.length,
  modelLoadMs: Math.round(loaded - started),
  hitAt1: results.filter((r) => r.rank === 1).length / results.length,
  hitAt5: results.filter((r) => r.rank && r.rank <= 5).length / results.length,
  literalHitRate: results.filter((r) => r.literalHit).length / results.length,
  results,
}
writeFileSync(outputPath, JSON.stringify(report, null, 2))
console.log(
  JSON.stringify({
    bookmarks: report.bookmarks,
    passages: report.passages,
    hitAt1: report.hitAt1,
    hitAt5: report.hitAt5,
    literalHitRate: report.literalHitRate,
  }),
)
