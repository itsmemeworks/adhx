package com.adhx.share.library

import java.io.File
import java.io.IOException
import java.nio.file.Files
import org.junit.Assert.*
import org.junit.Test

class ShareCacheTest {
    private fun withCache(test: (File) -> Unit) {
        val root = Files.createTempDirectory("adhx-share-cache-").toFile()
        try { test(root) } finally { root.deleteRecursively() }
    }

    @Test
    fun subsequentSharesKeepFreshRecipientFilesAndUseDistinctBatches() = withCache { root ->
        val first = ShareCache.create(root)
        val media = File(first, "video.mp4").apply { writeText("kept") }
        ShareCache.finish(first)
        val second = ShareCache.create(root)
        try {
            assertNotEquals(first, second)
            assertEquals("kept", media.readText())
        } finally { ShareCache.discard(second) }
    }

    @Test
    fun sweepsAbandonedBatchesAndLegacyFilesWithoutDeletingAnActiveBatch() = withCache { root ->
        val old = System.currentTimeMillis() - ShareCache.MAX_AGE_MS - 10_000
        val active = ShareCache.create(root)
        val abandoned = ShareCache.create(root)
        ShareCache.finish(abandoned)
        val legacy = File(root, "adhx-twitter-123.mp4").apply { writeText("old") }
        val unrelated = File(root, "unrelated").apply { writeText("leave") }
        for (entry in listOf(active, abandoned, legacy, unrelated)) entry.setLastModified(old)
        val next = ShareCache.create(root)
        try {
            assertTrue(active.exists())
            assertFalse(abandoned.exists())
            assertFalse(legacy.exists())
            assertTrue(unrelated.exists())
        } finally {
            ShareCache.discard(active)
            ShareCache.discard(next)
        }
    }

    @Test
    fun failureRemovesOnlyItsPartialBatch() = withCache { root ->
        val first = ShareCache.create(root)
        File(first, "video.mp4").writeText("ready")
        ShareCache.finish(first)
        val failed = ShareCache.create(root)
        File(failed, "partial.mp4").writeText("partial")
        ShareCache.discard(failed)
        assertFalse(failed.exists())
        assertTrue(File(first, "video.mp4").exists())
    }

    @Test
    fun rejectsTransfersThatCannotFitWithoutAllocatingLargeFiles() = withCache { root ->
        try {
            ShareCache.requireSpace(root, Long.MAX_VALUE)
            fail("Expected insufficient space")
        } catch (_: IOException) { /* expected */ }
        assertTrue(root.listFiles().orEmpty().isEmpty())
    }
}
