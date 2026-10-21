package com.adhx.share.feed

import com.adhx.share.net.AdhxApi
import com.adhx.share.net.ApiResult
import com.adhx.share.net.LiveSaverUpdate
import com.adhx.share.net.PhonePost
import com.adhx.share.net.Reaction
import com.adhx.share.net.Saver
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.*
import org.junit.Test

class LiveReliabilityTest {
    @Test fun refreshesNamesWithoutDroppingOlderPostsOrMovingPlayback() {
        val ana = Saver(username = "ana")
        val ben = Saver(username = "ben")
        val original = listOf(PhonePost(platform = "x", id = "old", savers = listOf(ana, ben)), PhonePost(platform = "x", id = "playing"), PhonePost(platform = "x", id = "gone"), PhonePost(platform = "x", id = "older"))
        val fresh = listOf(PhonePost(platform = "x", id = "new"))
        val merged = mergeLivePosts(original, fresh, setOf("x:gone"), "x:playing", mapOf("x:old" to LiveSaverUpdate("x:old", listOf(ben), isPrivate = true)))
        assertEquals(listOf("x:old", "x:playing", "x:older", "x:new"), merged.map { it.key })
        assertEquals(listOf("ben"), merged[0].savers.map { it.username })
        assertTrue(merged[0].isPrivate)
    }

    @Test fun cacheBoundKeepsThePlayingIdentity() {
        val cached = (0 until 200).map { PhonePost(platform = "x", id = "$it") }
        val arrivals = (200 until 260).map { PhonePost(platform = "x", id = "$it") }
        val merged = mergeLivePosts(cached, arrivals, emptySet(), "x:190")
        assertEquals(200, merged.size)
        assertTrue(merged.any { it.key == "x:190" })
        assertTrue(mergeLivePosts(cached, emptyList(), cached.map { it.key }.toSet(), "x:190").isEmpty())
    }

    @Test fun textUsesServerCodePointLimitWithoutSplittingEmoji() {
        val text = "😀".repeat(42)
        assertEquals("😀".repeat(40), Reaction.clip(text))
        assertEquals(40, Reaction.length(Reaction.clip(text)))
        assertEquals("a".repeat(39) + "😀", Reaction.clip("a".repeat(39) + "😀extra"))
    }

    @Test fun foregroundHeartbeatAndLeaveAreScopedToTheScreenAndKnownPostBody() = runBlocking {
        MockWebServer().use { server ->
            val api = AdhxApi(server.url("/").toString(), "phone-key")
            server.enqueue(MockResponse().setBody("""{"items":[],"watchers":[],"removedKeys":["x:gone"],"saverUpdates":[{"key":"x:old","savers":[]}]}"""))
            val response = api.liveMoment("frogs", "screen-session-1234", listOf("x:old", "x:gone")) as ApiResult.Ok
            assertEquals(listOf("x:gone"), response.value.removedKeys)
            assertEquals("x:old", response.value.saverUpdates.first().key)
            val poll = server.takeRequest()
            assertEquals("POST", poll.method)
            assertEquals("/api/app/live/frogs", poll.path)
            assertEquals("screen-session-1234", poll.getHeader("X-ADHX-Watch"))
            assertEquals("""{"known":["x:old","x:gone"]}""", poll.body.readUtf8())
            server.enqueue(MockResponse().setBody("""{"ok":true}"""))
            assertTrue(api.leaveLive("frogs", "screen-session-1234") is ApiResult.Ok)
            val leave = server.takeRequest()
            assertEquals("DELETE", leave.method)
            assertEquals("screen-session-1234", leave.getHeader("X-ADHX-Watch"))
        }
    }

    @Test fun olderServersFallBackToReadOnlyGet() = runBlocking {
        MockWebServer().use { server ->
            val api = AdhxApi(server.url("/").toString(), "phone-key")
            server.enqueue(MockResponse().setResponseCode(405))
            server.enqueue(MockResponse().setBody("""{"items":[]}"""))
            assertTrue(api.liveMoment("frogs", "screen-session-1234") is ApiResult.Ok)
            assertEquals("POST", server.takeRequest().method)
            assertEquals("GET", server.takeRequest().method)
        }
    }
}
