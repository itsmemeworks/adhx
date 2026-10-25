package com.adhx.share.net

import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.*
import org.junit.Test
import java.util.UUID

class WatchDeliveryTest {
    private val json = AdhxApi.json

    @Test
    fun thePersistedRequestKeepsItsIdentityAndCounts() {
        val first = WatchedRequest(listOf(WatchedPost("twitter", "clip", 1, 1, 12)), UUID.randomUUID().toString())
        val restored = json.decodeFromString(WatchedRequest.serializer(), json.encodeToString(WatchedRequest.serializer(), first))
        assertEquals(first, restored)
        assertNotEquals(first.batchId, UUID.randomUUID().toString())
        // Older stored requests remain readable; new batches always supply a receipt.
        assertNull(json.decodeFromString(WatchedRequest.serializer(), """{"posts":[]}""").batchId)
    }

    @Test
    fun retriesCarryTheIdenticalReceiptOnTheWire() = runBlocking {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setResponseCode(503))
            server.enqueue(MockResponse().setResponseCode(204))
            val api = AdhxApi(server.url("/").toString(), "test-phone-key")
            val batch = WatchedRequest(listOf(WatchedPost("twitter", "clip", 1, 0, 8)), UUID.randomUUID().toString())
            api.watched(batch.posts, batch.batchId)
            api.watched(batch.posts, batch.batchId)
            val first = server.takeRequest()
            val second = server.takeRequest()
            assertEquals("/api/app/watched", first.path)
            assertEquals("Bearer test-phone-key", second.getHeader("Authorization"))
            val sent = first.body.readUtf8()
            assertEquals(sent, second.body.readUtf8())
            assertEquals(batch, json.decodeFromString(WatchedRequest.serializer(), sent))
        }
    }
}
