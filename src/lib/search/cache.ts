import type { VectorCache } from './engine'
import { SEARCH_CACHE_VERSION } from './model'

/** Each account/model gets a separate store. Raw text and result lists never go into IndexedDB. */
export async function openVectorCache(accountId: string): Promise<VectorCache & { close(): void }> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${accountId}:${SEARCH_CACHE_VERSION}`),
  )
  const scope = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(`adhx-context-search-${scope}`, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('vectors')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Search storage is unavailable'))
  })
  // Storage is an optimization; private browsing/quota failures must not break search.
  return {
    async retain(keys) {
      try {
        await new Promise<void>((resolve) => {
          const tx = database.transaction('vectors', 'readwrite')
          const cursor = tx.objectStore('vectors').openCursor()
          cursor.onsuccess = () => {
            const entry = cursor.result
            if (!entry) return
            if (!keys.has(String(entry.key))) entry.delete()
            entry.continue()
          }
          tx.oncomplete = () => resolve()
          tx.onerror = tx.onabort = () => resolve()
        })
      } catch {
        /* memory-only search remains available */
      }
    },
    async get(key) {
      try {
        return await new Promise<number[] | undefined>((resolve) => {
          const request = database.transaction('vectors').objectStore('vectors').get(key)
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => resolve(undefined)
        })
      } catch {
        return undefined
      }
    },
    async put(key, vector) {
      try {
        await new Promise<void>((resolve) => {
          const tx = database.transaction('vectors', 'readwrite')
          tx.objectStore('vectors').put(vector, key)
          tx.oncomplete = () => resolve()
          tx.onerror = tx.onabort = () => resolve()
        })
      } catch {
        /* memory-only search remains available */
      }
    },
    close() {
      database.close()
    },
  }
}
