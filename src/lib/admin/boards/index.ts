import { analyticsBoard } from './analytics'
import { channelsBoard, liveBoard } from './live'
import { invitesBoard, moderationBoard } from './moderation'
import { overviewBoard } from './overview'
import { peopleBoard } from './people'
import { postsBoard } from './posts'
import { processingBoard } from './processing'
import { systemBoard } from './system'
import { parseAdminRange, type AdminRange } from '../shared'

/**
 * The admin area's sections, each a function of the range (and the admin
 * looking, for "you"). Shared by the pages (server-rendered) and
 * `GET /api/admin/boards/{board}`.
 */
export const ADMIN_BOARDS = [
  'overview',
  'people',
  'posts',
  'channels',
  'live',
  'analytics',
  'processing',
  'system',
  'moderation',
  'invites',
] as const

export type AdminBoardId = (typeof ADMIN_BOARDS)[number]

export function isAdminBoard(value: unknown): value is AdminBoardId {
  return typeof value === 'string' && (ADMIN_BOARDS as readonly string[]).includes(value)
}

/** Each board's range when none is asked for (as the design opens them). */
export const DEFAULT_RANGE: Record<AdminBoardId, AdminRange> = {
  overview: 'week',
  people: 'week',
  posts: 'all',
  channels: 'week',
  live: 'week',
  analytics: 'month',
  processing: 'week',
  system: 'week',
  moderation: 'week',
  invites: 'week',
}

export async function loadAdminBoard(
  board: AdminBoardId,
  rawRange: unknown,
  viewerId: string,
): Promise<unknown> {
  const range = parseAdminRange(rawRange, DEFAULT_RANGE[board])
  switch (board) {
    case 'overview':
      return overviewBoard(range)
    case 'people':
      return peopleBoard(viewerId)
    case 'posts':
      return postsBoard(range)
    case 'channels':
      return channelsBoard(range)
    case 'live':
      return liveBoard(range, viewerId)
    case 'analytics':
      return analyticsBoard(range)
    case 'processing':
      return processingBoard(viewerId)
    case 'system':
      return systemBoard()
    case 'moderation':
      return moderationBoard()
    case 'invites':
      return invitesBoard()
  }
}

export {
  analyticsBoard,
  channelsBoard,
  invitesBoard,
  liveBoard,
  moderationBoard,
  overviewBoard,
  peopleBoard,
  postsBoard,
  processingBoard,
  systemBoard,
}
