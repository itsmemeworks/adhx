/**
 * Knowledge Graph — shared types + constants.
 *
 * These are the contract between the server (`/api/graph`, `lib/graph/*`) and
 * the client (canvas, detail panel, meta store). A graph node is either a
 * **save** (one bookmark) or a **theme** hub; edges (`GraphRelation`) connect
 * them. Node identity uses a string `key`: `saveKey(platform, id)` for saves
 * and the `themeId` (`tag:…` / `kw:…`) for hubs — never collide because a
 * platform is never literally `tag`/`kw`.
 */
import type { ContentType, PlatformId } from '@/components/matter'

export type { ContentType, PlatformId }

/** Content-type ring/dot colors — fixed across light/dark (matches Tailwind `type-*`). */
export const TYPE_COLORS: Record<ContentType, string> = {
  video: '#7C4BE0',
  photo: '#1E94CF',
  text: '#D98A24',
  article: '#179E73',
  quote: '#CB52C8',
}

/** Read-badge green (fixed across themes). */
export const READ_GREEN = '#15A06B'

/** Curated theme-icon keys the user can assign to a hub (keys into graph `icons.ts`). */
export const THEME_ICON_KEYS = [
  'sparkle',
  'zap',
  'flame',
  'heart',
  'layers',
  'grid',
  'bookmark',
  'image',
  'quote',
  'fileText',
  'sun',
  'moon',
  'tag',
  'search',
  'play',
  'link',
] as const
export type ThemeIcon = (typeof THEME_ICON_KEYS)[number]

/** Default number of item nodes rendered (most-recent first); surfaced in the UI. */
export const NODE_CAP = 280

export type RelationKind = 'topic' | 'author' | 'related' | 'user'
export type ThemeKind = 'tag' | 'keyword'

/** Stable node key for a save — `${platform}:${id}`. */
export function saveKey(platform: string, id: string): string {
  return `${platform}:${id}`
}

/** Compact post data for the detail-panel card (GraphPostCard). */
export interface GraphCardData {
  type: ContentType
  platform: PlatformId
  authorName: string | null
  handle: string | null
  avatarUrl: string | null
  /** Body text / caption (already URL-expanded server-side). */
  body: string | null
  /** Large image for media/article cards (media thumbnail or article cover). */
  heroUrl: string | null
  isVideo: boolean
  durationMs: number | null
  articleTitle: string | null
  articleDescription: string | null
  /** Quoted-tweet context, when this is a quote. */
  quote: { handle: string | null; text: string | null } | null
}

/** One saved post = one item node. */
export interface GraphSave {
  /** Stable node key: `${platform}:${id}`. */
  key: string
  /** Source-native id (tweet id, reel shortcode, tiktok id). */
  id: string
  platform: PlatformId
  type: ContentType
  authorName: string | null
  handle: string | null
  /** Default short label for the node + relation rows (user can override). */
  label: string
  /** Node thumbnail: media → article hero → author avatar. */
  thumbnailUrl: string | null
  /** Source URL for "Open on {platform}". */
  openUrl: string
  createdAt: string | null
  /** Graph degree (links touching this node) — drives node radius. */
  degree: number
  card: GraphCardData
}

/** A theme hub node. */
export interface GraphTheme {
  /** Stable id + node key: `tag:<slug>` or `kw:<slug>`. */
  id: string
  /** Default label (`#tag` or a Title-cased keyword); user can override. */
  label: string
  kind: ThemeKind
  degree: number
}

/** An edge. `from`/`to` are node keys (saveKey) or theme ids. */
export interface GraphRelation {
  from: string
  to: string
  kind: RelationKind
}

/** A canonicalized endpoint of a user-drawn link. */
export interface LinkEndpoint {
  platform: PlatformId
  id: string
}

/** Per-user edits, seeded into the client meta store. */
export interface GraphAnnotations {
  /** Keyed by saveKey. */
  items: Record<string, { read?: boolean; tags?: string[]; title?: string; note?: string }>
  /** Keyed by themeId. */
  themes: Record<string, { name?: string; icon?: string }>
  /** User-drawn links (canonicalized, undirected). */
  links: { a: LinkEndpoint; b: LinkEndpoint }[]
}

export interface GraphStats {
  /** Total saves the user has. */
  totalSaves: number
  /** How many item nodes are actually in this graph (after the cap). */
  shown: number
  themeCount: number
  connectionCount: number
  /** True when `totalSaves > shown` (we capped). */
  capped: boolean
}

/** The full `GET /api/graph` payload. */
export interface GraphData {
  saves: GraphSave[]
  themes: GraphTheme[]
  relations: GraphRelation[]
  annotations: GraphAnnotations
  stats: GraphStats
}
