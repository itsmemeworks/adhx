package com.adhx.share.library

import java.io.File
import java.io.IOException
import java.util.UUID

/** Private batches keep previously granted share URIs valid while another share downloads. */
internal object ShareCache {
    const val MAX_AGE_MS = 24 * 60 * 60 * 1_000L
    const val MIN_FREE_BYTES = 64 * 1024 * 1024L
    private val batches = Regex("batch-[a-f0-9-]{36}")
    private val active = mutableSetOf<String>()

    @Synchronized
    fun create(root: File, now: Long = System.currentTimeMillis()): File {
        if (!root.isDirectory && !root.mkdirs()) throw IOException("No share cache directory")
        for (entry in root.listFiles().orEmpty()) {
            val owned = batches.matches(entry.name) || (entry.isFile && entry.name.startsWith("adhx-"))
            if (owned && entry.absolutePath !in active && now - entry.lastModified() > MAX_AGE_MS) {
                entry.deleteRecursively()
            }
        }
        requireSpace(root)
        val batch = File(root, "batch-${UUID.randomUUID()}")
        if (!batch.mkdir()) throw IOException("No share batch directory")
        active.add(batch.absolutePath)
        return batch
    }

    /** A known-length transfer must fit; streamed transfers recheck this reserve as they grow. */
    fun requireSpace(directory: File, incoming: Long = 0) {
        val available = directory.usableSpace
        if (incoming < 0 || available < MIN_FREE_BYTES || incoming > available - MIN_FREE_BYTES) {
            throw IOException("Not enough space for this share")
        }
    }

    @Synchronized
    fun finish(batch: File) {
        // Retain the grant for a day from completion, including a long download.
        batch.setLastModified(System.currentTimeMillis())
        active.remove(batch.absolutePath)
    }

    @Synchronized
    fun discard(batch: File) {
        batch.deleteRecursively()
        active.remove(batch.absolutePath)
    }
}
