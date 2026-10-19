package com.adhx.share.ui

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.adhx.share.feed.tileHeight
import com.adhx.share.library.foundHeading
import com.adhx.share.library.isUpright
import com.adhx.share.library.matchLabel
import com.adhx.share.net.PhoneMedia
import com.adhx.share.net.PhonePost
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class BoardsCopyTest {
    @Test
    fun facesUseTheFiveBoardColours() {
        val five = setOf(Color(0xFFFF8FA3), Color(0xFF7FD1AE), Color(0xFFFFB35C), Color(0xFFC4A7FF), Color(0xFF6B8CFF))
        listOf("ana", "ben", "mum", "jo", "pete", "benji", "", "Zoë").forEach { assertTrue(faceColor(it) in five) }
        assertEquals(faceColor("jo"), faceColor("JO"))
    }

    @Test
    fun captionsRunParagraphsTogether() {
        assertEquals("Me at the zoo. All right, so here we are", Copy.oneLine("Me at the zoo\n\nAll right, so here we are"))
        assertEquals("Wait! Then this", Copy.oneLine("Wait!\nThen this"))
        assertEquals("", Copy.oneLine("  \n "))
    }

    @Test
    fun theFilterSaysWhatWillPlayAndWhatWaits() {
        assertEquals("Show videos and photos", Copy.showKinds(setOf("photo", "video")))
        assertEquals("Show articles", Copy.showKinds(setOf("article")))
        assertEquals(
            "12 text posts and 3 articles are waiting. They’ll still be in search and channels.",
            Copy.waitingNote(mapOf("text" to 12, "article" to 3)),
        )
        assertEquals("1 article is waiting. They’ll still be in search and channels.", Copy.waitingNote(mapOf("article" to 1)))
        assertNull(Copy.waitingNote(emptyMap()))
    }

    @Test
    fun searchSaysWhereItFoundIt() {
        assertEquals("On screen", matchLabel(listOf("keywords", "screen")))
        assertEquals("Said in the video", matchLabel(listOf("speech")))
        assertEquals("In the words", matchLabel(listOf("keywords")))
        assertEquals("Related", matchLabel(emptyList()))
        assertEquals("Found it on screen", foundHeading(listOf("screen")))
    }

    @Test
    fun uprightVideosFillAndChannelTilesFollowTheirShape() {
        assertTrue(isUpright(352.0, 640.0))
        assertFalse(isUpright(1280.0, 720.0))
        assertFalse(isUpright(null, 640.0))
        fun post(w: Double?, h: Double?) = PhonePost(platform = "x", id = "1", media = listOf(PhoneMedia(width = w, height = h)))
        assertEquals(290.dp, tileHeight(post(352.0, 640.0)))
        assertEquals(180.dp, tileHeight(post(1280.0, 720.0)))
        assertEquals(230.dp, tileHeight(post(null, null)))
        assertEquals(180.dp, tileHeight(PhonePost(platform = "x", id = "2")))
    }
}
