import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { postEmbeddings, type PostEmbedding } from '@/lib/db/schema'
import { SEMANTIC_DIMS, SEMANTIC_MODEL_VERSION, type UnderstandingKind } from './config'
import { toBlob } from './vectors'

export type EmbeddingStatus = 'ok' | 'none' | 'failed'

export async function getEmbedding(
  platform: string,
  postId: string,
  kind: UnderstandingKind,
): Promise<PostEmbedding | undefined> {
  const [row] = await db
    .select()
    .from(postEmbeddings)
    .where(
      and(
        eq(postEmbeddings.platform, platform),
        eq(postEmbeddings.postId, postId),
        eq(postEmbeddings.kind, kind),
      ),
    )
    .limit(1)
  return row
}

/** True when a stored row already reflects this exact content with the current model. */
export function isCurrent(row: PostEmbedding | undefined, contentHash: string | null): boolean {
  if (!row || row.model !== SEMANTIC_MODEL_VERSION) return false
  if (contentHash === null) return row.status === 'none'
  // `none` with a hash: the media existed but turned out not to be that kind.
  return row.contentHash === contentHash
}

export async function saveEmbedding(input: {
  platform: string
  postId: string
  kind: UnderstandingKind
  contentHash: string | null
  status: EmbeddingStatus
  vector?: Float32Array
  error?: string
}): Promise<void> {
  const values = {
    platform: input.platform,
    postId: input.postId,
    kind: input.kind,
    model: SEMANTIC_MODEL_VERSION,
    contentHash: input.contentHash ?? '',
    dims: input.vector ? SEMANTIC_DIMS : 0,
    vector: input.vector ? toBlob(input.vector) : null,
    status: input.status,
    error: input.error ? input.error.slice(0, 500) : null,
    createdAt: new Date().toISOString(),
  }
  await db
    .insert(postEmbeddings)
    .values(values)
    .onConflictDoUpdate({
      target: [postEmbeddings.platform, postEmbeddings.postId, postEmbeddings.kind],
      set: {
        model: values.model,
        contentHash: values.contentHash,
        dims: values.dims,
        vector: values.vector,
        status: values.status,
        error: values.error,
        createdAt: values.createdAt,
      },
    })
}
