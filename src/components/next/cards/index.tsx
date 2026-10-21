'use client'

import { nextPostKind } from '../post'
import { ArticleTile } from './ArticleTile'
import { GifTile } from './GifTile'
import { PhotoTile } from './PhotoTile'
import { PostTile } from './PostTile'
import { VideoTile } from './VideoTile'
import type { TileProps } from './TileFrame'

export { ArticleTile, ArticleKicker } from './ArticleTile'
export { GifTile } from './GifTile'
export { PhotoTile } from './PhotoTile'
export { PostTile, postTileTypeScale } from './PostTile'
export { VideoTile, PlayGlyph, type VideoTileProps } from './VideoTile'
export { TileFrame, type TileProps } from './TileFrame'

/** The right tile for any saved post. */
export function NextTile({ playing, ...props }: TileProps & { playing?: boolean }) {
  switch (nextPostKind(props.item)) {
    case 'video':
      return <VideoTile {...props} playing={playing} />
    case 'gif':
      return <GifTile {...props} />
    case 'photo':
      return <PhotoTile {...props} />
    case 'article':
      return <ArticleTile {...props} />
    default:
      return <PostTile {...props} />
  }
}
