package com.adhx.share.library

import com.adhx.share.net.AdhxApi
import com.adhx.share.net.LiveReaction
import com.adhx.share.net.PostReactionsResponse
import com.adhx.share.net.Saver
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PostReactionsTest {
    @Test
    fun keptReactionsDecodeAsTheContractSendsThem() {
        val page = AdhxApi.json.decodeFromString(
            PostReactionsResponse.serializer(),
            """
            {"reactions":[
              {"id":"r1","emoji":"😂","text":null,"at":"2026-10-21T05:24:06.105Z",
               "saver":{"username":"ana","name":"Ana","avatarUrl":null,"isYou":false}},
              {"id":"r2","emoji":null,"text":"this is the one","at":"2026-10-21T05:24:06.132Z",
               "saver":{"username":"pete","name":"Pete","avatarUrl":"/api/people/pete/avatar","isYou":true}},
              {"broken":true}
            ]}
            """.trimIndent(),
        )
        assertEquals(2, page.reactions.size)
        val (laugh, words) = page.reactions
        assertEquals("r1", laugh.key)
        assertEquals("😂", laugh.emoji)
        assertNull(laugh.text)
        assertEquals("ana", laugh.who?.username)
        assertEquals("Ana", laugh.who?.label)
        assertFalse(laugh.who!!.isYou)
        assertEquals("this is the one", words.text)
        assertNull(words.emoji)
        assertTrue(words.who!!.isYou)
        assertEquals("/api/people/pete/avatar", words.who?.avatarUrl)
        assertTrue(AdhxApi.json.decodeFromString(PostReactionsResponse.serializer(), "{}").reactions.isEmpty())
    }

    private fun reaction(n: Int) = LiveReaction(key = "r$n", emoji = "🔥", at = "2026-10-21T05:%02d:00.000Z".format(n), who = Saver(username = "ana"))

    @Test
    fun replayIsTheNewestTwelveOldestFirstSpacedOut() {
        val all = (1..20).map(::reaction)
        val plan = replayPlan(all)
        assertEquals(REPLAY_MAX, plan.size)
        assertEquals((9..20).map { "r$it" }, plan.map { it.reaction.key })
        assertEquals((0 until 12).map { it * REPLAY_GAP_MS }, plan.map { it.afterMs })
        // Out of order from the server, it still goes oldest first.
        assertEquals(listOf("r1", "r2", "r3"), replayPlan(listOf(reaction(3), reaction(1), reaction(2))).map { it.reaction.key })
        // Nothing to show is left out.
        assertTrue(replayPlan(listOf(LiveReaction(key = "x"))).isEmpty())
    }

    @Test
    fun replayStartsSixHundredMillisecondsAfterSettling() {
        assertEquals(600L, replayWait(0))
        assertEquals(200L, replayWait(400))
        assertEquals(0L, replayWait(900))
    }

    @Test
    fun aPostReplaysOncePerRun() {
        PostReactionsMemory.forgetAll()
        val key = PostReactionsMemory.key("http://adhx.test", "ana", "twitter:1")
        assertFalse(PostReactionsMemory.replayed(key))
        assertNull(PostReactionsMemory.fetched(key))
        PostReactionsMemory.remember(key, listOf(reaction(1)))
        assertEquals(1, PostReactionsMemory.fetched(key)?.size)
        assertTrue(PostReactionsMemory.markReplayed(key))
        assertFalse(PostReactionsMemory.markReplayed(key))
        assertTrue(PostReactionsMemory.replayed(key))
        // Another account on the same ADHX starts fresh.
        assertFalse(PostReactionsMemory.replayed(PostReactionsMemory.key("http://adhx.test", "ben", "twitter:1")))
        PostReactionsMemory.forgetAll()
    }

    @Test
    fun yoursIsTakenBackWhenItDoesNotSend() {
        val floats = PostFloats()
        val replayed = floats.add("😂", null, Saver(username = "ana"), delayMs = 350)
        val mine = floats.add(null, "so good", Saver(username = "pete", isYou = true))
        assertEquals(listOf(replayed, mine), floats.items.map { it.id })
        assertEquals(350L, floats.items.first().delayMs)
        floats.remove(mine)
        assertEquals(listOf(replayed), floats.items.map { it.id })
        assertEquals("Couldn’t send that. Try again.", POST_REACT_FAILED)
    }

    @Test
    fun floatsKeepToTheirCap() {
        val floats = PostFloats(max = 3)
        repeat(5) { floats.add("🔥", null, null) }
        assertEquals(listOf(3L, 4L, 5L), floats.items.map { it.id })
        floats.clear()
        assertTrue(floats.items.isEmpty())
    }
}
