package com.adhx.share.feed

import com.adhx.share.net.AdhxApi
import com.adhx.share.net.FeedResponse
import com.adhx.share.net.Lineup
import com.adhx.share.net.PhoneAuthor
import com.adhx.share.net.PhonePost
import com.adhx.share.net.Saver
import com.adhx.share.net.WhyReason
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** New's lineup on the phone: Just saved, Not seen yet, then For you, and the counts that go with it. */
class LineupTest {
    private fun post(id: String, section: String) = PhonePost(platform = "x", id = id, section = section)

    private val ui = FeedUi(
        items = listOf(
            post("a", Lineup.JUST),
            post("b", Lineup.JUST),
            post("c", Lineup.UNSEEN),
            post("d", Lineup.FOR_YOU),
        ),
        // More Not seen yet and For you than the first page holds.
        sections = mapOf(Lineup.JUST to 2, Lineup.UNSEEN to 5, Lineup.FOR_YOU to 60),
    )

    @Test
    fun sectionsAndEachPostsPartDecode() {
        val page = AdhxApi.json.decodeFromString(
            FeedResponse.serializer(),
            """{"items":[{"platform":"x","id":"1","section":"just"}],"sections":{"just":1,"unseen":0,"foryou":3}}""",
        )
        assertEquals("just", page.items.single().section)
        assertEquals(mapOf("just" to 1, "unseen" to 0, "foryou" to 3), page.sections)
        assertNull(AdhxApi.json.decodeFromString(FeedResponse.serializer(), "{}").sections)
    }

    @Test
    fun whereAPostIsSaysItsPartAndPlace() {
        assertEquals(LineupSpot(Lineup.JUST, 2, 2), lineupSpot(ui, "x:b"))
        assertEquals(LineupSpot(Lineup.UNSEEN, 1, 5), lineupSpot(ui, "x:c"))
        assertEquals(LineupSpot(Lineup.FOR_YOU, 1, 60), lineupSpot(ui, "x:d"))
        assertNull(lineupSpot(ui.copy(sections = null), "x:b"))
    }

    @Test
    fun emptyPartsAreLeftOutOfTheStrip() {
        assertEquals(listOf(Lineup.UNSEEN, Lineup.FOR_YOU), lineupParts(ui.copy(sections = mapOf(Lineup.JUST to 0, Lineup.UNSEEN to 5, Lineup.FOR_YOU to 60))))
    }

    @Test
    fun theBadgeCountsWhatYouHaventWatchedNotWhereYouAre() {
        assertEquals(7, unseenLeft(ui))
        // Watching For you doesn't count; skipping ahead doesn't either.
        assertEquals(6, unseenLeft(ui.copy(watched = setOf("x:a", "x:d"))))
        assertEquals("6", newBadge(ui.copy(watched = setOf("x:a")), page = 3))
        assertNull(newBadge(ui.copy(sections = mapOf(Lineup.JUST to 1), items = listOf(post("a", Lineup.JUST)), watched = setOf("x:a")), page = 0))
    }

    @Test
    fun upNextSaysWhoAndWhyItIsThere() {
        val saved = PhonePost(platform = "youtube", id = "1", text = "Never Gonna Give You Up\nRick", savers = listOf(Saver(username = "ben", name = "Ben")))
        assertEquals("Never Gonna Give You Up", upNextTitle(saved))
        assertEquals("Ben saved · YouTube", upNextMeta(saved))
        val sent = saved.copy(whyReasons = listOf(WhyReason("Ana sent you this", kind = "sent", username = "ana")))
        assertEquals("Ana sent you this · YouTube", upNextMeta(sent))
        assertEquals("@pete’s video", upNextTitle(PhonePost(kind = "video", author = PhoneAuthor(handle = "pete"))))
    }
}
