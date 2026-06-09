'use client'

/**
 * Knowledge Graph — per-user annotation store (client).
 *
 * Seeded from `GET /api/graph` annotations, then mutated optimistically with
 * fire-and-forget persistence to the server (replacing the prototype's
 * localStorage). The SAME store instance feeds the canvas (read badges, hub
 * icons/names, label overrides, user-link edges) and the detail panel (editing)
 * so edits reflect live. read/tags persist through the existing bookmark
 * endpoints so they also show in the feed; title/note/theme/links use the
 * graph endpoints. Title/note/hub-name persistence is debounced (typed input).
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import { sanitizeTag } from '@/lib/utils/tag'
import type { GraphAnnotations, GraphRelation, LinkEndpoint } from './types'
import { saveKey } from './types'

type ItemMeta = { read?: boolean; tags?: string[]; title?: string; note?: string }
type HubMeta = { name?: string; icon?: string }

export interface GraphMetaStore {
  itemMeta: (key: string) => ItemMeta
  hubMeta: (themeId: string) => HubMeta
  links: { a: LinkEndpoint; b: LinkEndpoint }[]
  /** User links as renderable graph edges (both endpoints as saveKeys). */
  userRelations: GraphRelation[]
  hasLink: (aKey: string, bKey: string) => boolean
  setRead: (key: string, read: boolean) => void
  addTag: (key: string, tag: string) => void
  removeTag: (key: string, tag: string) => void
  setTitle: (key: string, title: string) => void
  setNote: (key: string, note: string) => void
  setHub: (themeId: string, patch: HubMeta) => void
  addLink: (aKey: string, bKey: string) => void
  removeLink: (aKey: string, bKey: string) => void
}

/** Split a saveKey (`platform:id`) back into endpoint parts (id may not contain ':'). */
function parseKey(key: string): LinkEndpoint {
  const i = key.indexOf(':')
  return { platform: key.slice(0, i) as LinkEndpoint['platform'], id: key.slice(i + 1) }
}

function canonicalPair(a: string, b: string): [string, string] {
  return a <= b ? [a, b] : [b, a]
}

async function send(url: string, method: string, body?: unknown): Promise<void> {
  try {
    await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (err) {
    // Optimistic UI already updated; a failed persist shouldn't break the view.
    console.error(`[graph] persist failed: ${method} ${url}`, err)
  }
}

export function useGraphMeta(initial: GraphAnnotations): GraphMetaStore {
  const [items, setItems] = useState<Record<string, ItemMeta>>(() => ({ ...initial.items }))
  const [hubs, setHubs] = useState<Record<string, HubMeta>>(() => ({ ...initial.themes }))
  const [links, setLinks] = useState<{ a: LinkEndpoint; b: LinkEndpoint }[]>(() =>
    initial.links.map((l) => ({ a: l.a, b: l.b })),
  )
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const debounced = useCallback((id: string, fn: () => void, ms = 350) => {
    const t = timers.current
    const existing = t.get(id)
    if (existing) clearTimeout(existing)
    t.set(id, setTimeout(fn, ms))
  }, [])

  const patchItem = useCallback((key: string, patch: ItemMeta) => {
    setItems((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }))
  }, [])

  const setRead = useCallback(
    (key: string, read: boolean) => {
      patchItem(key, { read })
      const { platform, id } = parseKey(key)
      send(
        `/api/bookmarks/${encodeURIComponent(id)}/read?platform=${encodeURIComponent(platform)}`,
        read ? 'POST' : 'DELETE',
      )
    },
    [patchItem],
  )

  const addTag = useCallback((key: string, raw: string) => {
    const tag = sanitizeTag(raw.replace(/^#/, ''))
    if (!tag) return
    setItems((prev) => {
      const cur = prev[key]?.tags || []
      if (cur.includes(tag)) return prev
      return { ...prev, [key]: { ...prev[key], tags: [...cur, tag] } }
    })
    const { platform, id } = parseKey(key)
    send(
      `/api/bookmarks/${encodeURIComponent(id)}/tags?platform=${encodeURIComponent(platform)}`,
      'POST',
      { tag },
    )
  }, [])

  const removeTag = useCallback((key: string, tag: string) => {
    setItems((prev) => {
      const cur = prev[key]?.tags || []
      return { ...prev, [key]: { ...prev[key], tags: cur.filter((t) => t !== tag) } }
    })
    const { platform, id } = parseKey(key)
    send(
      `/api/bookmarks/${encodeURIComponent(id)}/tags?platform=${encodeURIComponent(platform)}`,
      'DELETE',
      { tag },
    )
  }, [])

  const setTitle = useCallback(
    (key: string, title: string) => {
      patchItem(key, { title })
      const { platform, id } = parseKey(key)
      debounced(`title:${key}`, () =>
        send(
          `/api/graph/items/${encodeURIComponent(id)}?platform=${encodeURIComponent(platform)}`,
          'PATCH',
          { title },
        ),
      )
    },
    [patchItem, debounced],
  )

  const setNote = useCallback(
    (key: string, note: string) => {
      patchItem(key, { note })
      const { platform, id } = parseKey(key)
      debounced(`note:${key}`, () =>
        send(
          `/api/graph/items/${encodeURIComponent(id)}?platform=${encodeURIComponent(platform)}`,
          'PATCH',
          { note },
        ),
      )
    },
    [patchItem, debounced],
  )

  const setHub = useCallback(
    (themeId: string, patch: HubMeta) => {
      setHubs((prev) => ({ ...prev, [themeId]: { ...prev[themeId], ...patch } }))
      // icon is discrete (persist now); name is typed (debounce)
      if ('icon' in patch) {
        send('/api/graph/themes', 'PATCH', { themeId, icon: patch.icon ?? '' })
      }
      if ('name' in patch) {
        debounced(`hub:${themeId}`, () =>
          send('/api/graph/themes', 'PATCH', { themeId, name: patch.name ?? '' }),
        )
      }
    },
    [debounced],
  )

  const hasLink = useCallback(
    (aKey: string, bKey: string) => {
      const [x, y] = canonicalPair(aKey, bKey)
      return links.some((l) => {
        const [lx, ly] = canonicalPair(saveKey(l.a.platform, l.a.id), saveKey(l.b.platform, l.b.id))
        return lx === x && ly === y
      })
    },
    [links],
  )

  const addLink = useCallback((aKey: string, bKey: string) => {
    if (aKey === bKey) return
    const a = parseKey(aKey)
    const b = parseKey(bKey)
    setLinks((prev) => {
      const [x, y] = canonicalPair(aKey, bKey)
      const exists = prev.some((l) => {
        const [lx, ly] = canonicalPair(saveKey(l.a.platform, l.a.id), saveKey(l.b.platform, l.b.id))
        return lx === x && ly === y
      })
      return exists ? prev : [...prev, { a, b }]
    })
    send('/api/graph/links', 'POST', { a, b })
  }, [])

  const removeLink = useCallback((aKey: string, bKey: string) => {
    const a = parseKey(aKey)
    const b = parseKey(bKey)
    const [x, y] = canonicalPair(aKey, bKey)
    setLinks((prev) =>
      prev.filter((l) => {
        const [lx, ly] = canonicalPair(saveKey(l.a.platform, l.a.id), saveKey(l.b.platform, l.b.id))
        return !(lx === x && ly === y)
      }),
    )
    send('/api/graph/links', 'DELETE', { a, b })
  }, [])

  const userRelations = useMemo<GraphRelation[]>(
    () =>
      links.map((l) => ({
        from: saveKey(l.a.platform, l.a.id),
        to: saveKey(l.b.platform, l.b.id),
        kind: 'user' as const,
      })),
    [links],
  )

  const itemMeta = useCallback((key: string): ItemMeta => items[key] || {}, [items])
  const hubMeta = useCallback((themeId: string): HubMeta => hubs[themeId] || {}, [hubs])

  return {
    itemMeta,
    hubMeta,
    links,
    userRelations,
    hasLink,
    setRead,
    addTag,
    removeTag,
    setTitle,
    setNote,
    setHub,
    addLink,
    removeLink,
  }
}
