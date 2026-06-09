/**
 * Knowledge Graph — hybrid theme inference (zero marginal cost, fully local).
 *
 * Themes come from two sources, per the product decision:
 *   1. **Tag themes** — every user tag becomes a named theme hub (`tag:<slug>`).
 *   2. **Keyword themes** — auto clusters from salient keywords/hashtags in post
 *      text + article titles (`kw:<slug>`), for topics the user hasn't tagged.
 *
 * No embeddings, no LLM — just term frequency over the user's own saves. Stable,
 * deterministic theme ids so per-user renames/icons survive a recompute. A
 * future "ADHX Pro" tier could swap in semantic clustering behind this same
 * interface without touching the UI.
 */
import type { ThemeKind } from '@/components/graph/types'
import { salientTerms, slugify, titleCase, TOPIC_ACRONYMS } from './text'

export interface ThemeInput {
  key: string
  text: string
  articleTitle?: string | null
  tags: string[]
}

export interface ThemeDescriptor {
  id: string
  label: string
  kind: ThemeKind
}

export interface ThemeResult {
  themes: ThemeDescriptor[]
  /** save key → ordered theme ids (tag themes first, then keyword themes). */
  themeIdsByKey: Map<string, string[]>
}

export interface InferThemesOptions {
  /** Min number of distinct saves a keyword must appear in to become a theme. */
  minSupport?: number
  /** Cap on how many keyword themes to surface (top by support). */
  maxKeywordThemes?: number
  /** Cap on keyword themes assigned to a single save (avoids hairballs). */
  maxKeywordPerSave?: number
}

export function inferThemes(inputs: ThemeInput[], options: InferThemesOptions = {}): ThemeResult {
  const minSupport = options.minSupport ?? 2
  const maxKeywordThemes = options.maxKeywordThemes ?? 10
  const maxKeywordPerSave = options.maxKeywordPerSave ?? 2

  // ---- 1. Tag themes ----
  const tagThemes = new Map<string, ThemeDescriptor>() // themeId → descriptor
  const tagIdsByKey = new Map<string, string[]>()
  const reservedSlugs = new Set<string>() // tag slugs — keyword themes must not duplicate
  for (const input of inputs) {
    const ids: string[] = []
    for (const rawTag of input.tags) {
      const tag = rawTag.trim()
      if (!tag) continue
      const slug = slugify(tag)
      if (!slug) continue
      const id = `tag:${slug}`
      reservedSlugs.add(slug)
      if (!tagThemes.has(id)) tagThemes.set(id, { id, label: `#${tag}`, kind: 'tag' })
      if (!ids.includes(id)) ids.push(id)
    }
    if (ids.length) tagIdsByKey.set(input.key, ids)
  }

  // ---- 2. Keyword document-frequency across the collection ----
  const termsByKey = new Map<string, string[]>()
  const df = new Map<string, number>()
  for (const input of inputs) {
    const blob = `${input.text || ''} ${input.articleTitle || ''}`
    const terms = salientTerms(blob)
    termsByKey.set(input.key, terms)
    for (const term of terms) df.set(term, (df.get(term) || 0) + 1)
  }

  // candidate keyword themes: support ≥ minSupport, not already a tag, and
  // either a real word (≥4 chars) or a known topical acronym (drops noisy
  // 3-letter fragments like "pas"/"don"). Top N by support.
  const candidates = [...df.entries()]
    .filter(
      ([term, count]) =>
        count >= minSupport &&
        !reservedSlugs.has(slugify(term)) &&
        (term.length >= 4 || TOPIC_ACRONYMS.has(term)),
    )
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, maxKeywordThemes)

  const keywordThemeId = new Map<string, string>() // term → themeId
  const keywordThemes: ThemeDescriptor[] = []
  for (const [term] of candidates) {
    const id = `kw:${slugify(term)}`
    if (keywordThemeId.has(term)) continue
    keywordThemeId.set(term, id)
    keywordThemes.push({ id, label: titleCase(term), kind: 'keyword' })
  }

  // ---- 3. Assign themes per save ----
  const themeIdsByKey = new Map<string, string[]>()
  for (const input of inputs) {
    const ids = [...(tagIdsByKey.get(input.key) || [])]
    const terms = termsByKey.get(input.key) || []
    // the save's keyword themes, ranked by global support, capped
    const kw = terms
      .filter((t) => keywordThemeId.has(t))
      .sort((a, b) => (df.get(b) || 0) - (df.get(a) || 0) || (a < b ? -1 : 1))
      .slice(0, maxKeywordPerSave)
      .map((t) => keywordThemeId.get(t)!)
    for (const id of kw) if (!ids.includes(id)) ids.push(id)
    if (ids.length) themeIdsByKey.set(input.key, ids)
  }

  // ---- 4. Final theme list (tag themes by usage, then keyword themes by support) ----
  // Only include themes that actually have at least one member after the
  // per-save cap, so the graph never shows an orphan hub with no saves.
  const used = new Set<string>()
  for (const ids of themeIdsByKey.values()) for (const id of ids) used.add(id)

  const tagUsage = new Map<string, number>()
  for (const ids of tagIdsByKey.values())
    for (const id of ids) tagUsage.set(id, (tagUsage.get(id) || 0) + 1)
  const sortedTagThemes = [...tagThemes.values()]
    .filter((t) => used.has(t.id))
    .sort(
      (a, b) =>
        (tagUsage.get(b.id) || 0) - (tagUsage.get(a.id) || 0) || (a.label < b.label ? -1 : 1),
    )
  const usedKeywordThemes = keywordThemes.filter((t) => used.has(t.id))

  return { themes: [...sortedTagThemes, ...usedKeywordThemes], themeIdsByKey }
}
