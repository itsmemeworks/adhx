import { SearchIndex, type SearchMatch } from './engine'
import { loadSearchModel } from './model'
import { openVectorCache } from './cache'
import type { SearchDocument } from './documents'

export interface SearchRequest {
  id: number
  accountId: string
  documents: SearchDocument[]
  query: string
  allowedKeys?: string[]
}
export type SearchResponse =
  | { id: number; type: 'download'; progress: number | null }
  | { id: number; type: 'index'; done: number; total: number }
  | { id: number; type: 'results'; matches: SearchMatch[] }
  | { id: number; type: 'error'; message: string; detail?: string }

let pending: SearchRequest | null = null
let latest = 0
let running = false
let index: SearchIndex | null = null
let account: string | null = null
let cache: Awaited<ReturnType<typeof openVectorCache>> | undefined
const send = (message: SearchResponse) => self.postMessage(message)

async function pump() {
  if (running) return
  running = true
  try {
    while (pending) {
      const request: SearchRequest = pending
      pending = null
      const current = () => latest === request.id
      try {
        if (request.documents.length === 0 && index) await index.search([], '', undefined, current)
        if (!request.query.trim() || request.documents.length === 0) {
          if (current()) send({ id: request.id, type: 'results', matches: [] })
          continue
        }
        if (account !== request.accountId || !index) {
          cache?.close()
          cache = await openVectorCache(request.accountId).catch(() => undefined)
          const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } })
            .gpu
          const adapter = await gpu?.requestAdapter().catch(() => null)
          const device = adapter ? 'webgpu' : 'wasm'
          const embed = await loadSearchModel(device, (progress) => {
            if (current()) send({ id: request.id, type: 'download', progress })
          })
          index = new SearchIndex(embed, cache)
          account = request.accountId
        }
        const matches = await index.search(
          request.documents,
          request.query,
          (done, total) => {
            if (current() && (done === total || done === 1 || done % 20 === 0))
              send({ id: request.id, type: 'index', done, total })
          },
          current,
          request.allowedKeys ? new Set(request.allowedKeys) : undefined,
        )
        if (current()) send({ id: request.id, type: 'results', matches })
      } catch (error) {
        index = null
        if (current())
          send({
            id: request.id,
            type: 'error',
            detail: error instanceof Error ? error.message : String(error),
            message: 'Context search could not start on this device. Retry, or use keyword search.',
          })
      }
    }
  } finally {
    running = false
  }
}

self.onmessage = (event: MessageEvent<SearchRequest>) => {
  latest = event.data.id
  pending = event.data
  void pump()
}
