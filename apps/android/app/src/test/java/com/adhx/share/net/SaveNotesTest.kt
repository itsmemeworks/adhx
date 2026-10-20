package com.adhx.share.net

import com.adhx.share.feed.whyChipLabel
import com.adhx.share.ui.Copy
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SaveNotesTest {
    private val json = AdhxApi.json

    private fun saver(body: String) = json.decodeFromString(Saver.serializer(), body)

    @Test
    fun saverNotesReadLoosely() {
        assertEquals("you’re welcome", saver("""{"username":"ben","note":"you’re welcome"}""").note)
        assertNull(saver("""{"username":"ben"}""").note)
        assertNull(saver("""{"username":"ben","note":null}""").note)
        assertNull(saver("""{"username":"ben","note":"   "}""").note)
        assertNull(saver("""{"username":"ben","note":42}""").note)
        assertEquals("hi", saver("""{"username":"ben","note":{"text":"hi"}}""").note)
        // A post whose saver has an odd note still reads.
        val post = json.decodeFromString(PhonePost.serializer(), """{"platform":"x","id":"1","savers":[{"username":"ana","note":[1,2]}]}""")
        assertEquals("ana", post.savers.single().username)
    }

    @Test
    fun theBylineShowsAFriendsNoteFirst() {
        val you = Saver("pete", "Pete", isYou = true, note = "this is so you, Ben")
        val ben = Saver("ben", "Ben", note = "you’re welcome")
        assertEquals(ben to "you’re welcome", Copy.noteOf(listOf(you, ben)))
        assertEquals(you to "this is so you, Ben", Copy.noteOf(listOf(you, Saver("ana", "Ana"))))
        assertNull(Copy.noteOf(listOf(Saver("ana", "Ana"))))
        assertEquals(140, Copy.noteOf(listOf(Saver("ana", note = "a".repeat(200))))!!.second.length)
        assertEquals("Ben’s note: you’re welcome", Copy.noteDescription(ben, "you’re welcome"))
    }

    @Test
    fun saveRequestsCarryANoteOnlyWhenThereIsOne() {
        assertEquals("""{"url":"https://x.com/a"}""", json.encodeToString(SaveRequest.serializer(), SaveRequest("https://x.com/a")))
        assertEquals(
            """{"url":"https://x.com/a","note":"so you"}""",
            json.encodeToString(SaveRequest.serializer(), SaveRequest("https://x.com/a", note = "so you")),
        )
    }

    @Test
    fun aNoteGoesToTheNoteEndpoint() = runBlocking {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setBody("""{"note":"so you"}"""))
            val result = AdhxApi(server.url("/").toString(), "phone-key").setNote("instagram", "Dba", "  so you  ")
            assertEquals("so you", (result as ApiResult.Ok).value.note)
            val request = server.takeRequest()
            assertEquals("/api/app/note", request.path)
            assertEquals("Bearer phone-key", request.getHeader("Authorization"))
            assertEquals("""{"platform":"instagram","id":"Dba","note":"so you"}""", request.body.readUtf8())
        }
    }

    @Test
    fun anOlderServerGetsTheSaveAgainWithItsPrivacySaid() = runBlocking {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setBody("""{"platform":"x","id":"1","alreadySaved":true}"""))
            AdhxApi(server.url("/").toString(), "phone-key").saveNote("https://x.com/a", "b".repeat(150), justForMe = false)
            val body = server.takeRequest().body.readUtf8()
            assertTrue(body.startsWith("""{"url":"https://x.com/a","private":false,"note":"bbb"""))
            assertTrue(body.contains("\"note\":\"${"b".repeat(140)}\""))
        }
    }

    @Test
    fun whyReasonsKeepTheirKind() {
        val post = json.decodeFromString(
            PhonePost.serializer(),
            """{"platform":"x","id":"1","why":"Jo and Mum saved this","whyReasons":[
                {"kind":"together","text":"Jo and Mum saved this","username":"jo"},
                {"kind":"close","text":"You watch most of Mum’s saves","username":"mum"},
                "Fresh"
            ]}""",
        )
        assertEquals("together", post.whyKind)
        assertEquals(listOf("together", "close", null), post.whyReasons.map { it.kind })
        assertEquals("mum", post.whyReasons[1].username)
        assertEquals(Copy.WHY_TOGETHER, whyChipLabel(post))
        val close = post.copy(whyReasons = post.whyReasons.drop(1))
        assertEquals(Copy.WHY_CLOSE, whyChipLabel(close))
        assertEquals("Fresh", whyChipLabel(PhonePost(platform = "x", id = "2", why = listOf("Fresh"))))
        assertNull(whyChipLabel(PhonePost(platform = "x", id = "3")))
    }
}
