package com.adhx.share.feed

import com.adhx.share.net.AdhxApi
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.*
import org.junit.Test
import java.io.IOException
import java.util.concurrent.TimeUnit

class LiveSubscriptionTest {
    @Test fun officialSseUsesBearerHeaderAndServerBasePath() = runBlocking {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setHeader("Content-Type", "text/event-stream").setBody("event: refresh\r\ndata: {}\r\n\r\n"))
            val signals = withTimeout(3_000) { AdhxApi(server.url("/adhx/").toString(), "synthetic-key").liveChanges("frogs").toList() }
            assertTrue(signals.isNotEmpty())
            val request = server.takeRequest(2, TimeUnit.SECONDS)!!
            assertEquals("/adhx/api/app/live/frogs/stream?notify=1", request.path)
            assertEquals("Bearer synthetic-key", request.getHeader("Authorization"))
            assertEquals("text/event-stream", request.getHeader("Accept"))
        }
    }

    @Test fun streamsNeverFollowRedirectsWithCredentials() = runBlocking {
        MockWebServer().use { origin -> MockWebServer().use { other ->
            origin.enqueue(MockResponse().setResponseCode(302).setHeader("Location", other.url("/steal")))
            try { withTimeout(3_000) { AdhxApi(origin.url("/").toString(), "synthetic-key").liveChanges().toList() }; fail("redirect accepted") }
            catch (_: IOException) { }
            assertNull(other.takeRequest(100, TimeUnit.MILLISECONDS))
        } }
    }

    @Test fun burstsCoalesceAndHealthyStreamsDoNotUseFallback() = runBlocking {
        var calls = 0; var inFlight = 0; var maximum = 0; var closed = false
        val following = launch {
            followLiveUpdates(stream = { flow { try { repeat(1000) { emit(Unit) }; awaitCancellation() } finally { closed = true } } },
                active = { true }, fallbackMs = 1, jitter = { 0 }, refresh = {
                    inFlight++; maximum = maxOf(maximum, inFlight); calls++; delay(30); inFlight--
                })
        }
        delay(1_500); val settled = calls; delay(1_100)
        assertEquals(settled, calls); assertTrue(calls <= 2); assertEquals(1, maximum)
        following.cancelAndJoin(); assertTrue(closed)
    }

    @Test fun offlineTransportKeepsRestRecoveryAndStopsWhenAccountChanges() = runBlocking {
        var calls = 0
        withTimeout(3_000) {
            followLiveUpdates(stream = { flow { throw IOException("offline") } }, active = { calls < 2 }, fallbackMs = 1,
                jitter = { 0 }, refresh = { calls++ })
        }
        assertEquals(2, calls)
    }

    @Test fun quietStreamStopsAfterPassiveAccountChange() = runBlocking {
        var current = true; var closed = false
        val following = launch {
            followLiveUpdates(stream = { flow { try { emit(Unit); awaitCancellation() } finally { closed = true } } },
                active = { current }, jitter = { 0 }, refresh = {})
        }
        delay(2_500) // Startup work has drained; the consumer is waiting for a new signal.
        current = false
        withTimeout(1_500) { following.join() }
        assertTrue(closed)
    }

    @Test fun reconnectAlwaysReconcilesState() = runBlocking {
        var starts = 0; var refreshes = 0
        val following = launch {
            followLiveUpdates(stream = { flow { starts++; emit(Unit); if (starts > 1) awaitCancellation() } },
                active = { true }, jitter = { 0 }, refresh = { refreshes++ })
        }
        delay(1_600); following.cancelAndJoin()
        assertTrue(starts >= 2); assertTrue(refreshes >= 2)
    }
}
