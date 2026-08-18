'use client'

/**
 * STUB — implemented by the theater-embed agent (spec §3/§6).
 * Article stage: cover splash → in-stage reader. The article body comes from
 * the public tweet JSON API (`/api/share/tweet/{author}/{id}`, 5-min cache),
 * which already serves the X Article content as markdown. A reading-progress
 * bar replaces the video time bar.
 */

import type { TheaterItem } from './types'

export interface StageArticleProps {
  item: TheaterItem
}

export function StageArticle(_props: StageArticleProps) {
  return null
}
