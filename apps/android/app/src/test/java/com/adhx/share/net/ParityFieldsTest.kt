package com.adhx.share.net

import com.adhx.share.feed.weightPair
import com.adhx.share.library.videoQuality
import com.adhx.share.ui.Copy
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The server fields behind Show less/more, New marks, the note card and the live span. */
class ParityFieldsTest {
    private val json = AdhxApi.json

    @Test
    fun channelItemsCarryNewMarksAndTheFriendsNote() {
        val body = json.decodeFromString(
            ChannelItemsResponse.serializer(),
            """{"items":[
                {"platform":"youtube","id":"_OBlgSz8sSM","kind":"video","isNew":false},
                {"platform":"x","id":"2","kind":"photo","isNew":true}
            ],"note":{"text":"the original and still the best","platform":"youtube","id":"_OBlgSz8sSM","savedAt":"2026-10-17T02:09:01.940Z"}}""",
        )
        assertEquals(listOf(false, true), body.items.map { it.isNew })
        assertEquals("the original and still the best", body.note?.text)
        assertEquals("youtube:_OBlgSz8sSM", body.note?.key)
    }

    @Test
    fun aMissingOrOddNoteIsNoNote() {
        listOf("""{"items":[]}""", """{"items":[],"note":null}""", """{"items":[],"note":"hi"}""", """{"items":[],"note":{"text":"  "}}""")
            .forEach { assertNull(json.decodeFromString(ChannelItemsResponse.serializer(), it).note) }
        // An older server: no marks at all.
        val old = json.decodeFromString(PhonePost.serializer(), """{"platform":"x","id":"1"}""")
        assertFalse(old.isNew)
    }

    @Test
    fun weightsKeepOnlyMoreAndLess() {
        val body = json.decodeFromString(FeedWeights.serializer(), """{"weights":{"ana":1,"ben":-1,"jo":0,"mum":"x","zed":2}}""")
        assertEquals(mapOf("ana" to 1, "ben" to -1), body.weights)
        assertEquals(emptyMap<String, Int>(), json.decodeFromString(FeedWeights.serializer(), """{"weights":null}""").weights)
    }

    @Test
    fun weightsAreReadAndSet() = runBlocking {
        MockWebServer().use { server ->
            val api = AdhxApi(server.url("/").toString(), "phone-key")
            server.enqueue(MockResponse().setBody("""{"weights":{"ana":1}}"""))
            assertEquals(mapOf("ana" to 1), (api.feedWeights() as ApiResult.Ok).value.weights)
            assertEquals("/api/app/feed/weights", server.takeRequest().path)

            server.enqueue(MockResponse().setBody("""{"weights":{"ana":1,"ben":-1}}"""))
            val set = api.setFeedWeight("ben", -1)
            assertEquals(mapOf("ana" to 1, "ben" to -1), (set as ApiResult.Ok).value.weights)
            val put = server.takeRequest()
            assertEquals("PUT", put.method)
            assertEquals("""{"username":"ben","weight":-1}""", put.body.readUtf8())
            assertEquals("Bearer phone-key", put.getHeader("Authorization"))

            server.enqueue(MockResponse().setResponseCode(404).setBody("""{"code":"no_member","error":"No one by that name here."}"""))
            assertTrue(api.setFeedWeight("nobody", 1) is ApiResult.Failed)
        }
    }

    @Test
    fun showLessIsAboutTheLastFriendAndShowMoreTheFirst() {
        val ana = Saver(username = "ana", name = "Ana")
        val ben = Saver(username = "ben", name = "Ben")
        val you = Saver(username = "pete", isYou = true)
        assertEquals(ben to ana, weightPair(listOf(ana, ben, you)))
        assertEquals(ana to ana, weightPair(listOf(you, ana)))
        assertNull(weightPair(listOf(you)))
        assertEquals("Show less from Ben", Copy.showLess("Ben", on = false))
        assertEquals("Showing more from Ana", Copy.showMore("Ana", on = true))
    }

    @Test
    fun liveMomentsSayHowBusyTheyAreLately() {
        val live = json.decodeFromString(
            LiveResponse.serializer(),
            """{"moments":[{"slug":"baby","title":"Baby","people":3,"posts":5,"recentSaves":3,"windowMinutes":10}],
               "forming":[{"id":"f1","title":"Kitchen synths","have":2,"need":3,"unit":"saves","covers":["/a.jpg"]},{"id":"f2","title":""}]}""",
        )
        val m = live.moments.single()
        val ana = Saver(username = "ana", name = "Ana")
        assertEquals("3 saves in 10 min · Ana", Copy.momentLine(m.posts, m.people, listOf(ana), m.recentSaves, m.windowMinutes))
        // None lately (0 in 60): the save count instead.
        assertEquals("5 saves · Ana", Copy.momentLine(5, 3, listOf(ana), 0, 60))
        // An older server without the span.
        assertEquals("5 saves · Ana", Copy.momentLine(5, 3, listOf(ana)))
        assertEquals("1 save in 5 min", Copy.recentSaves(1, 5))
        assertEquals("4 saves in an hour", Copy.recentSaves(4, 60))

        val forming = live.forming.single()
        assertEquals("Kitchen synths", forming.title)
        assertEquals("1 more save to go live", Copy.toGoLive(forming.left, forming.unit))
        assertEquals("2 more people to go live", Copy.toGoLive(2, "people"))
        assertEquals(emptyList<FormingMoment>(), json.decodeFromString(LiveResponse.serializer(), """{"moments":[]}""").forming)
    }

    @Test
    fun channelCopy() {
        assertEquals("Play the 4 new", Copy.playNew(4))
        assertEquals("Play the 99+ new", Copy.playNew(120))
        assertEquals("Ana’s note", Copy.notesOf("Ana"))
        assertEquals("on Charlie bit my finger · 3 days ago", Copy.noteOn("Charlie bit my finger", "3 days ago"))
        assertEquals("3 days ago", Copy.noteOn(null, "3 days ago"))
    }

    @Test
    fun videoSizesAreNamedByTheirShortSide() {
        assertEquals("720p", videoQuality(720, 1280))
        assertEquals("1080p", videoQuality(1920, 1080))
        assertEquals("480p", videoQuality(null, 480))
        assertNull(videoQuality(null, null))
    }
}
