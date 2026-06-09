/**
 * GET /api/graph — the Knowledge Graph payload for the current user.
 *
 * Reads the user's most-recent saves (capped at NODE_CAP), infers themes
 * (hybrid: tags + keyword clusters), builds relations (topic/author/related/
 * user), and folds in per-user annotations (read/tags + graph_* overrides).
 * All computed locally at request time — zero AI / marginal cost. Dynamic
 * because it reads SQLite (migrated only at container start).
 */
import { inArray, and, eq, desc, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  bookmarks,
  bookmarkTags,
  bookmarkMedia,
  bookmarkLinks,
  readStatus,
  graphItemMeta,
  graphThemeMeta,
  graphLinks,
} from '@/lib/db/schema'
import { withAuth } from '@/lib/api/with-auth'
import { ok, handleRouteError } from '@/lib/api/response'
import { inferThemes, type ThemeInput } from '@/lib/graph/themes'
import { buildRelations, type RelationInput } from '@/lib/graph/relations'
import { degreeMap } from '@/components/graph/graph-sim'
import { nodeThumbnail } from '@/lib/graph/node-thumbnail'
import {
  NODE_CAP,
  saveKey,
  type ContentType,
  type GraphData,
  type GraphSave,
  type GraphTheme,
  type LinkEndpoint,
  type PlatformId,
} from '@/components/graph/types'

export const dynamic = 'force-dynamic'

const EMPTY: GraphData = {
  saves: [],
  themes: [],
  relations: [],
  annotations: { items: {}, themes: {}, links: [] },
  stats: { totalSaves: 0, shown: 0, themeCount: 0, connectionCount: 0, capped: false },
}

function deriveLabel(
  articleTitle: string | null,
  text: string | null,
  authorName: string | null,
  handle: string | null,
): string {
  if (articleTitle && articleTitle.trim()) return truncate(articleTitle.trim(), 60)
  const t = (text || '').replace(/\s+/g, ' ').trim()
  if (t) return truncate(t, 48)
  return authorName || handle || 'Saved post'
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…'
}

export const GET = withAuth(async (_req, userId) => {
  try {
    const [{ count: totalSaves }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(bookmarks)
      .where(eq(bookmarks.userId, userId))

    const rows = await db
      .select()
      .from(bookmarks)
      .where(eq(bookmarks.userId, userId))
      .orderBy(desc(bookmarks.processedAt))
      .limit(NODE_CAP)

    // theme/link overrides are user-wide (cheap), fetch even when no saves shown
    const themeMetaRows = await db
      .select()
      .from(graphThemeMeta)
      .where(eq(graphThemeMeta.userId, userId))
    const linkRows = await db.select().from(graphLinks).where(eq(graphLinks.userId, userId))

    const annotationThemes: Record<string, { name?: string; icon?: string }> = {}
    for (const r of themeMetaRows) {
      annotationThemes[r.themeId] = {
        ...(r.name != null ? { name: r.name } : {}),
        ...(r.icon != null ? { icon: r.icon } : {}),
      }
    }
    const annotationLinks: { a: LinkEndpoint; b: LinkEndpoint }[] = linkRows.map((r) => ({
      a: { platform: r.aPlatform as PlatformId, id: r.aId },
      b: { platform: r.bPlatform as PlatformId, id: r.bId },
    }))

    if (rows.length === 0) {
      return ok({
        ...EMPTY,
        annotations: { items: {}, themes: annotationThemes, links: annotationLinks },
        stats: { totalSaves, shown: 0, themeCount: 0, connectionCount: 0, capped: totalSaves > 0 },
      } satisfies GraphData)
    }

    const ids = rows.map((r) => r.id)

    // ---- batch-fetch related data for the shown set ----
    const [tagRows, mediaRows, linkPreviewRows, readRows, itemMetaRows] = await Promise.all([
      db
        .select({
          platform: bookmarkTags.platform,
          bookmarkId: bookmarkTags.bookmarkId,
          tag: bookmarkTags.tag,
        })
        .from(bookmarkTags)
        .where(and(eq(bookmarkTags.userId, userId), inArray(bookmarkTags.bookmarkId, ids))),
      db
        .select()
        .from(bookmarkMedia)
        .where(and(eq(bookmarkMedia.userId, userId), inArray(bookmarkMedia.bookmarkId, ids))),
      db
        .select()
        .from(bookmarkLinks)
        .where(and(eq(bookmarkLinks.userId, userId), inArray(bookmarkLinks.bookmarkId, ids))),
      db
        .select({ platform: readStatus.platform, bookmarkId: readStatus.bookmarkId })
        .from(readStatus)
        .where(and(eq(readStatus.userId, userId), inArray(readStatus.bookmarkId, ids))),
      db
        .select()
        .from(graphItemMeta)
        .where(and(eq(graphItemMeta.userId, userId), inArray(graphItemMeta.bookmarkId, ids))),
    ])

    const tagsByKey = new Map<string, string[]>()
    for (const r of tagRows) {
      const key = saveKey(r.platform, r.bookmarkId)
      const list = tagsByKey.get(key) || []
      list.push(r.tag)
      tagsByKey.set(key, list)
    }

    // first media row per key (for thumbnail + video flag)
    const mediaByKey = new Map<
      string,
      { type: string; previewUrl: string | null; durationMs: number | null }
    >()
    for (const m of mediaRows) {
      const key = saveKey(m.platform, m.bookmarkId)
      const existing = mediaByKey.get(key)
      if (!existing) {
        mediaByKey.set(key, {
          type: m.mediaType,
          previewUrl: m.previewUrl,
          durationMs: m.durationMs,
        })
      } else if (existing.type !== 'video' && m.mediaType === 'video') {
        // prefer a video row so the play badge + duration show
        mediaByKey.set(key, {
          type: m.mediaType,
          previewUrl: m.previewUrl,
          durationMs: m.durationMs,
        })
      }
    }

    const articleByKey = new Map<
      string,
      { title: string | null; description: string | null; imageUrl: string | null }
    >()
    for (const l of linkPreviewRows) {
      const key = saveKey(l.platform, l.bookmarkId)
      const isArticleLink =
        l.linkType === 'article' ||
        (l.expandedUrl &&
          (l.expandedUrl.includes('/article/') || l.expandedUrl.includes('/i/article/')))
      if (isArticleLink && !articleByKey.has(key)) {
        articleByKey.set(key, {
          title: l.previewTitle,
          description: l.previewDescription,
          imageUrl: l.previewImageUrl,
        })
      }
    }

    const readSet = new Set(readRows.map((r) => saveKey(r.platform, r.bookmarkId)))
    const itemMetaByKey = new Map<string, { title: string | null; note: string | null }>()
    for (const r of itemMetaRows) {
      itemMetaByKey.set(saveKey(r.platform, r.bookmarkId), { title: r.title, note: r.note })
    }

    const keySet = new Set(rows.map((r) => saveKey(r.platform, r.id)))

    // ---- theme inference ----
    const themeInputs: ThemeInput[] = rows.map((b) => {
      const key = saveKey(b.platform, b.id)
      return {
        key,
        text: b.text || '',
        articleTitle: articleByKey.get(key)?.title || null,
        tags: tagsByKey.get(key) || [],
      }
    })
    const { themes: themeDescriptors, themeIdsByKey } = inferThemes(themeInputs)

    // ---- relations ----
    const relationInputs: RelationInput[] = rows.map((b) => {
      const key = saveKey(b.platform, b.id)
      const quotedKey =
        b.platform === 'twitter' && b.quotedTweetId ? saveKey('twitter', b.quotedTweetId) : null
      return {
        key,
        handle: b.author,
        themeIds: themeIdsByKey.get(key) || [],
        quotedKey: quotedKey && keySet.has(quotedKey) ? quotedKey : null,
      }
    })
    const relations = buildRelations(relationInputs, annotationLinks)
    const degrees = degreeMap(relations)

    // ---- assemble saves ----
    const saves: GraphSave[] = rows.map((b) => {
      const key = saveKey(b.platform, b.id)
      const platform = b.platform as PlatformId
      const media = mediaByKey.get(key) || null
      const article = articleByKey.get(key) || null
      const isArticle = b.category === 'article' || !!article
      const type: ContentType = isArticle
        ? 'article'
        : b.isQuote
          ? 'quote'
          : b.category === 'video'
            ? 'video'
            : b.category === 'photo'
              ? 'photo'
              : 'text'
      const handle = `@${b.author}`
      const articleTitle = article?.title || null
      const thumb = nodeThumbnail({
        platform,
        id: b.id,
        author: b.author,
        mediaType: media?.type || null,
        previewUrl: media?.previewUrl || null,
        articleImageUrl: article?.imageUrl || null,
        avatarUrl: b.authorProfileImageUrl,
      })
      const isVideo = media?.type === 'video' || media?.type === 'animated_gif'

      let quote: { handle: string | null; text: string | null } | null = null
      if (b.isQuote && b.quoteContext) {
        try {
          const q = JSON.parse(b.quoteContext)
          quote = { handle: q.author ? `@${q.author}` : null, text: q.text || null }
        } catch {
          // ignore malformed quote context
        }
      }

      return {
        key,
        id: b.id,
        platform,
        type,
        authorName: b.authorName,
        handle,
        label: deriveLabel(articleTitle, b.text, b.authorName, handle),
        thumbnailUrl: thumb,
        openUrl: b.tweetUrl,
        createdAt: b.createdAt,
        degree: degrees.get(key) || 0,
        card: {
          type,
          platform,
          authorName: b.authorName,
          handle,
          avatarUrl: b.authorProfileImageUrl,
          body: b.text || null,
          heroUrl: thumb && media ? thumb : article?.imageUrl || null,
          isVideo,
          durationMs: media?.durationMs ?? null,
          articleTitle,
          articleDescription: article?.description || null,
          quote,
        },
      }
    })

    const themes: GraphTheme[] = themeDescriptors.map((t) => ({
      ...t,
      degree: degrees.get(t.id) || 0,
    }))

    // ---- annotations.items ----
    const items: GraphData['annotations']['items'] = {}
    for (const b of rows) {
      const key = saveKey(b.platform, b.id)
      const tags = tagsByKey.get(key)
      const meta = itemMetaByKey.get(key)
      const read = readSet.has(key)
      if (!tags && !meta && !read) continue
      items[key] = {
        ...(read ? { read: true } : {}),
        ...(tags && tags.length ? { tags } : {}),
        ...(meta?.title != null ? { title: meta.title } : {}),
        ...(meta?.note != null ? { note: meta.note } : {}),
      }
    }

    const data: GraphData = {
      saves,
      themes,
      relations,
      annotations: { items, themes: annotationThemes, links: annotationLinks },
      stats: {
        totalSaves,
        shown: saves.length,
        themeCount: themes.length,
        connectionCount: relations.length,
        capped: totalSaves > saves.length,
      },
    }
    return ok(data)
  } catch (error) {
    return handleRouteError(error, { endpoint: '/api/graph', userId })
  }
})
