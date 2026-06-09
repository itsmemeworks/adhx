import { describe, it, expect } from 'vitest'
import { inferThemes, type ThemeInput } from '@/lib/graph/themes'

/**
 * Knowledge Graph — theme inference tests.
 *
 * Verifies the hybrid (tag + keyword) clustering in `lib/graph/themes.ts`:
 * tag themes, keyword document-frequency themes, dedupe-against-tags,
 * ordering (tags before keywords), orphan-hub pruning, and determinism.
 */

describe('inferThemes — tag themes', () => {
  it('turns each user tag into a tag:<slug> theme with kind "tag" and #<tag> label', () => {
    const inputs: ThemeInput[] = [
      { key: 'a', text: 'hello world', tags: ['Reading'] },
      { key: 'b', text: 'something else', tags: ['reading'] },
    ]
    const { themes, themeIdsByKey } = inferThemes(inputs)

    const tagTheme = themes.find((t) => t.id === 'tag:reading')
    expect(tagTheme).toBeDefined()
    expect(tagTheme!.kind).toBe('tag')
    // label keeps the first-seen original casing of the tag
    expect(tagTheme!.label).toBe('#Reading')

    // both saves are members of the (slug-deduped) tag theme
    expect(themeIdsByKey.get('a')).toContain('tag:reading')
    expect(themeIdsByKey.get('b')).toContain('tag:reading')
  })

  it('does not create themes for blank/whitespace tags', () => {
    const inputs: ThemeInput[] = [{ key: 'a', text: 'x', tags: ['   ', ''] }]
    const { themes, themeIdsByKey } = inferThemes(inputs)
    expect(themes).toHaveLength(0)
    expect(themeIdsByKey.has('a')).toBe(false)
  })
})

describe('inferThemes — keyword themes', () => {
  it('promotes a word seen in >= minSupport saves to a kw:<slug> theme (Title-cased)', () => {
    const inputs: ThemeInput[] = [
      { key: 's1', text: 'agents reshape automation', tags: [] },
      { key: 's2', text: 'building agents at scale', tags: [] },
      { key: 's3', text: 'random unrelated content', tags: [] },
    ]
    const { themes, themeIdsByKey } = inferThemes(inputs)

    const kw = themes.find((t) => t.id === 'kw:agents')
    expect(kw).toBeDefined()
    expect(kw!.kind).toBe('keyword')
    expect(kw!.label).toBe('Agents') // titleCase of a >3-char word

    expect(themeIdsByKey.get('s1')).toContain('kw:agents')
    expect(themeIdsByKey.get('s2')).toContain('kw:agents')
    // s3 mentions none of the shared words → no keyword membership
    expect(themeIdsByKey.has('s3')).toBe(false)
  })

  it('does NOT promote a word appearing in only one save (below minSupport)', () => {
    const inputs: ThemeInput[] = [
      { key: 's1', text: 'kubernetes orchestration', tags: [] },
      { key: 's2', text: 'completely different topic words', tags: [] },
    ]
    const { themes } = inferThemes(inputs)
    expect(themes.find((t) => t.id === 'kw:kubernetes')).toBeUndefined()
    expect(themes).toHaveLength(0)
  })

  it('pulls salient terms from articleTitle as well as text', () => {
    const inputs: ThemeInput[] = [
      { key: 's1', text: 'short note', articleTitle: 'Understanding Embeddings', tags: [] },
      { key: 's2', text: 'embeddings explained simply', tags: [] },
    ]
    const { themes, themeIdsByKey } = inferThemes(inputs)
    expect(themes.find((t) => t.id === 'kw:embeddings')).toBeDefined()
    expect(themeIdsByKey.get('s1')).toContain('kw:embeddings')
    expect(themeIdsByKey.get('s2')).toContain('kw:embeddings')
  })

  it('respects a custom minSupport', () => {
    const inputs: ThemeInput[] = [
      { key: 's1', text: 'claude is helpful', tags: [] },
      { key: 's2', text: 'claude writes code', tags: [] },
      { key: 's3', text: 'claude reads docs', tags: [] },
    ]
    // default minSupport=2 → promoted
    expect(inferThemes(inputs).themes.find((t) => t.id === 'kw:claude')).toBeDefined()
    // minSupport=4 → not enough saves mention it
    expect(
      inferThemes(inputs, { minSupport: 4 }).themes.find((t) => t.id === 'kw:claude'),
    ).toBeUndefined()
  })
})

describe('inferThemes — keyword does not duplicate an existing tag slug', () => {
  it('skips a keyword theme whose slug collides with a tag slug', () => {
    const inputs: ThemeInput[] = [
      // "claude" is a tag here...
      { key: 's1', text: 'claude is the topic', tags: ['claude'] },
      // ...and also a high-frequency word across these saves
      { key: 's2', text: 'claude again here', tags: [] },
      { key: 's3', text: 'more claude talk', tags: [] },
    ]
    const { themes, themeIdsByKey } = inferThemes(inputs)

    // tag theme exists
    expect(themes.find((t) => t.id === 'tag:claude')).toBeDefined()
    // but NO competing keyword theme for the same slug
    expect(themes.find((t) => t.id === 'kw:claude')).toBeUndefined()

    // saves without the tag don't get a phantom kw:claude membership
    expect(themeIdsByKey.get('s2') ?? []).not.toContain('kw:claude')
    expect(themeIdsByKey.get('s3') ?? []).not.toContain('kw:claude')
  })
})

describe('inferThemes — ordering', () => {
  it('lists tag themes before keyword themes for a save', () => {
    const inputs: ThemeInput[] = [
      { key: 's1', text: 'agents power automation', tags: ['favorite'] },
      { key: 's2', text: 'more agents discussion', tags: [] },
    ]
    const { themeIdsByKey } = inferThemes(inputs)
    const ids = themeIdsByKey.get('s1')!
    const tagIdx = ids.indexOf('tag:favorite')
    const kwIdx = ids.indexOf('kw:agents')
    expect(tagIdx).toBeGreaterThanOrEqual(0)
    expect(kwIdx).toBeGreaterThanOrEqual(0)
    expect(tagIdx).toBeLessThan(kwIdx)
  })
})

describe('inferThemes — orphan-hub pruning via maxKeywordPerSave', () => {
  it('drops keyword themes that end up with zero members after the per-save cap', () => {
    // Each save shares two distinct high-frequency words. With maxKeywordPerSave=1,
    // only the strongest keyword per save is assigned, so the weaker (lower-df)
    // keyword may become a candidate theme yet have no member → must be pruned.
    const inputs: ThemeInput[] = [
      // "agents" appears in 3 saves (df=3), "robotics" appears in 2 (df=2)
      { key: 's1', text: 'agents robotics future', tags: [] },
      { key: 's2', text: 'agents robotics demo', tags: [] },
      { key: 's3', text: 'agents everywhere now', tags: [] },
    ]
    const { themes, themeIdsByKey } = inferThemes(inputs, { maxKeywordPerSave: 1 })

    // "agents" (higher df) wins the single slot in s1 and s2; "robotics" gets none.
    expect(themes.find((t) => t.id === 'kw:agents')).toBeDefined()
    expect(themes.find((t) => t.id === 'kw:robotics')).toBeUndefined()

    // every returned theme has at least one member (no orphan hubs)
    const used = new Set<string>()
    for (const ids of themeIdsByKey.values()) for (const id of ids) used.add(id)
    for (const t of themes) expect(used.has(t.id)).toBe(true)

    // each save got at most one keyword theme
    for (const ids of themeIdsByKey.values()) {
      const kwCount = ids.filter((id) => id.startsWith('kw:')).length
      expect(kwCount).toBeLessThanOrEqual(1)
    }
  })

  it('caps the number of keyword themes surfaced via maxKeywordThemes', () => {
    const inputs: ThemeInput[] = [
      { key: 's1', text: 'alpha bravo charlie', tags: [] },
      { key: 's2', text: 'alpha bravo charlie', tags: [] },
    ]
    // 3 shared words qualify, but cap to 1 keyword theme
    const { themes } = inferThemes(inputs, { maxKeywordThemes: 1, maxKeywordPerSave: 5 })
    const kwThemes = themes.filter((t) => t.kind === 'keyword')
    expect(kwThemes).toHaveLength(1)
  })
})

describe('inferThemes — determinism', () => {
  it('produces identical output across repeated runs on the same input', () => {
    const inputs: ThemeInput[] = [
      { key: 's1', text: 'claude agents reshape automation', tags: ['Reading', 'work'] },
      { key: 's2', text: 'building claude agents at scale', tags: ['work'] },
      {
        key: 's3',
        text: 'embeddings and claude together',
        articleTitle: 'Embeddings 101',
        tags: [],
      },
      { key: 's4', text: 'embeddings explained for agents', tags: ['reading'] },
    ]
    const run1 = inferThemes(inputs)
    const run2 = inferThemes(inputs)

    expect(run1.themes).toEqual(run2.themes)
    expect([...run1.themeIdsByKey.entries()]).toEqual([...run2.themeIdsByKey.entries()])

    // and stable membership ordering within a save
    for (const [key, ids] of run1.themeIdsByKey) {
      expect(run2.themeIdsByKey.get(key)).toEqual(ids)
    }
  })

  it('orders keyword themes deterministically by support then alphabetically on ties', () => {
    const inputs: ThemeInput[] = [
      // "zebra" and "apple" both appear twice (tie on df=2) → alphabetical: apple before zebra
      { key: 's1', text: 'zebra apple', tags: [] },
      { key: 's2', text: 'zebra apple', tags: [] },
    ]
    const { themes } = inferThemes(inputs, { maxKeywordPerSave: 5 })
    const kwIds = themes.filter((t) => t.kind === 'keyword').map((t) => t.id)
    expect(kwIds).toEqual(['kw:apple', 'kw:zebra'])
  })
})
