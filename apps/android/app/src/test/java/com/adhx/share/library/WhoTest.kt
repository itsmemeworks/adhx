package com.adhx.share.library

import com.adhx.share.net.AdhxApi
import com.adhx.share.net.ApiResult
import com.adhx.share.net.LiveReaction
import com.adhx.share.net.Saver
import com.adhx.share.net.Watcher
import com.adhx.share.net.WhoResponse
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Layout C's bottom row (boards 15.7–15.10): the first saver's face, "+N", who's on it, and leaving a group channel. */
class WhoTest {
    private val ana = Saver(username = "ana", name = "Ana", savedAt = "2026-10-20T09:00:00Z")
    private val ben = Saver(username = "ben", name = "Ben", savedAt = "2026-10-21T09:00:00Z")
    private val you = Saver(username = "pete", name = "Pete", savedAt = "2026-10-22T09:00:00Z", isYou = true)

    @Test
    fun theFaceIsTheEarliestSave() {
        // The server sends savers newest first.
        assertEquals("ana", Who.firstSaver(listOf(you, ben, ana))?.username)
    }

    @Test
    fun withoutTimesTheFaceIsTheNewest() {
        val untimed = listOf(Saver(username = "jo"), Saver(username = "mum"))
        assertEquals("jo", Who.firstSaver(untimed)?.username)
        assertNull(Who.firstSaver(emptyList()))
    }

    @Test
    fun onlyYouSavedItSoItsYourFace() {
        assertEquals("pete", Who.firstSaver(listOf(you))?.username)
        assertNull(Who.badge(listOf(you)))
        assertEquals("Who’s on this one: You", Who.buttonLabel(listOf(you)))
    }

    @Test
    fun othersWhoSavedItShowAsPlusN() {
        assertEquals("+2", Who.badge(listOf(you, ben, ana)))
        assertEquals("+1", Who.badge(listOf(ben, ana)))
        assertEquals("Who’s on this one: Ana and 1 more", Who.buttonLabel(listOf(ben, ana)))
    }

    @Test
    fun saversComeFirstThenWatchersThenAnyoneWhoOnlyReacted() {
        val who = WhoResponse(
            savers = listOf(ben, ana),
            reactions = listOf(
                LiveReaction(key = "1", emoji = "😂", who = Saver(username = "ben", name = "Ben"), at = "2026-10-21T10:00:00Z"),
                LiveReaction(key = "2", emoji = "👀", who = Saver(username = "jo", name = "Jo"), at = "2026-10-21T11:00:00Z"),
                LiveReaction(key = "3", text = "his FACE", who = Saver(username = "ben", name = "Ben"), at = "2026-10-21T12:00:00Z"),
                LiveReaction(key = "4", emoji = "🔥", who = Saver(username = "kit", name = "Kit"), at = "2026-10-21T13:00:00Z"),
            ),
            watched = listOf(
                Watcher(username = "jo", name = "Jo", at = "2026-10-21T11:00:00Z"),
                Watcher(username = "ana", name = "Ana", at = "2026-10-21T10:30:00Z"),
                Watcher(username = "mum", name = "Mum", at = "2026-10-21T08:00:00Z"),
                Watcher(username = "pete", name = "Pete", at = "2026-10-21T07:00:00Z", isYou = true),
            ),
        )
        val faces = Who.faces(who)
        // One face each: Ana (saved first), Ben, then watchers newest first, then Kit who only reacted.
        assertEquals(listOf("ana", "ben", "jo", "mum", "pete", "kit"), faces.map { it.saver.username })
        val (a, b, jo, mum, me, kit) = faces
        assertTrue(a.saved)
        assertFalse(a.watched)
        assertNull(a.emoji)
        assertTrue(b.saved)
        assertEquals("😂", b.emoji)
        assertEquals("his FACE", b.said)
        assertTrue(jo.watched)
        assertFalse(jo.saved)
        assertEquals("👀", jo.emoji)
        assertTrue(mum.watched)
        assertTrue(me.watched)
        assertFalse(kit.saved || kit.watched)
        assertEquals("🔥", kit.emoji)

        assertEquals("Ana saved it first", Who.label(a, firstOfSeveral = true))
        assertEquals("Ben saved it, reacted 😂 and said “his FACE”", Who.label(b))
        assertEquals("Jo watched it and reacted 👀", Who.label(jo))
        assertEquals("Mum watched it", Who.label(mum))
        assertEquals("You watched it", Who.label(me))
        assertEquals("Kit reacted 🔥", Who.label(kit))
    }

    @Test
    fun theNewestEmojiIsTheSticker() {
        val who = WhoResponse(
            savers = listOf(ben),
            reactions = listOf(
                LiveReaction(key = "1", emoji = "😂", who = Saver(username = "ben"), at = "2026-10-21T10:00:00Z"),
                LiveReaction(key = "2", emoji = "❤️", who = Saver(username = "Ben"), at = "2026-10-21T11:00:00Z"),
            ),
        )
        assertEquals("❤️", Who.faces(who).single().emoji)
    }

    @Test
    fun beforeTheAnswerTheRowIsTheSavers() {
        val faces = Who.faces(listOf(you, ben, ana))
        assertEquals(listOf("ana", "ben", "pete"), faces.map { it.saver.username })
        assertTrue(faces.all { it.saved && !it.watched })
    }

    @Test
    fun decodesWho() {
        val body = """
            {
              "savers": [{"username":"ben","name":"Ben","avatarUrl":"/a/ben.jpg","savedAt":"2026-10-21T09:00:00Z","isYou":false,"note":"his face"}],
              "reactions": [
                {"id":"r1","emoji":"😂","text":null,"at":"2026-10-21T10:00:00Z","saver":{"username":"ben","name":"Ben","avatarUrl":null,"isYou":false}},
                {"id":"r2","emoji":null,"text":"no way","at":"2026-10-21T10:05:00Z","saver":{"username":"pete","name":"Pete","avatarUrl":"/a/p.jpg","isYou":true}}
              ],
              "watched": [{"username":"mum","name":null,"avatarUrl":null,"at":"2026-10-21T11:00:00Z","isYou":false}]
            }
        """.trimIndent()
        val who = AdhxApi.json.decodeFromString(WhoResponse.serializer(), body)
        assertEquals("ben", who.savers.single().username)
        assertEquals("his face", who.savers.single().note)
        assertEquals(listOf("r1", "r2"), who.reactions.map { it.key })
        assertEquals("ben", who.reactions[0].who?.username)
        assertEquals("no way", who.reactions[1].text)
        assertTrue(who.reactions[1].who?.isYou == true)
        assertEquals("mum", who.watched.single().username)
        assertEquals("mum", who.watched.single().asSaver().label)
        // Older servers and empty answers read as nobody.
        assertTrue(AdhxApi.json.decodeFromString(WhoResponse.serializer(), "{}").savers.isEmpty())
    }

    @Test
    fun asksWhoAndSaysWhenItCantBeSeen() = runBlocking {
        MockWebServer().use { server ->
            val api = AdhxApi(server.url("/").toString(), "phone-key")
            server.enqueue(MockResponse().setBody("""{"savers":[],"reactions":[],"watched":[{"username":"jo","at":"2026-10-21T11:00:00Z","isYou":false}]}"""))
            val who = (api.who("x", "123") as ApiResult.Ok).value
            assertEquals("jo", who.watched.single().username)
            val request = server.takeRequest()
            assertEquals("GET", request.method)
            assertEquals("/api/app/who?platform=x&id=123", request.path)
            assertEquals("Bearer phone-key", request.getHeader("Authorization"))

            server.enqueue(MockResponse().setResponseCode(404).setBody("""{"error":"That post isn’t one you can see.","code":"not_found"}"""))
            val missing = api.who("x", "456") as ApiResult.Failed
            assertEquals(404, missing.status)
            assertEquals("not_found", missing.code)
        }
    }

    @Test
    fun leavingAGroupChannel() = runBlocking {
        MockWebServer().use { server ->
            val api = AdhxApi(server.url("/").toString(), "phone-key")
            server.enqueue(MockResponse().setBody("""{"removed":12}"""))
            val left = (api.leaveGroupChannel("coding-with-ai") as ApiResult.Ok).value
            assertEquals(12, left.removed)
            val request = server.takeRequest()
            assertEquals("DELETE", request.method)
            assertEquals("/api/app/channels/group/coding-with-ai/keep", request.path)
        }
    }
}

private operator fun <T> List<T>.component6(): T = this[5]
