package com.adhx.share.ui

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.adhx.share.feed.tileHeight
import com.adhx.share.library.foundHeading
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
        val five = setOf(AdhxColors.Person2, AdhxColors.Person1, AdhxColors.Person5, AdhxColors.Person4, AdhxColors.Person3)
        listOf("ana", "ben", "mum", "jo", "pete", "benji", "", "Zoë").forEach { assertTrue(faceColor(it) in five) }
        assertEquals(faceColor("jo"), faceColor("JO"))
        assertEquals(faceColor("jo"), faceColor("@jo"))
    }

    @Test
    fun theBoardsPeopleGetTheirBoardColours() {
        assertEquals(AdhxColors.Person2, faceColor("ana"))
        assertEquals(AdhxColors.Person1, faceColor("ben"))
        assertEquals(AdhxColors.Person5, faceColor("mum"))
        assertEquals(AdhxColors.Person4, faceColor("jo"))
        assertEquals(AdhxColors.Person3, faceColor("pete"))
    }

    /** The design system's tokens.json, value for value (cream #f2ead9, ink-faint #a89f8d, danger #ff8a7a). */
    @Test
    fun theColoursAreTheDesignSystemsTokens() {
        listOf(
            "Bg" to (AdhxColors.Bg to Color(0xFF0F0E0C)),
            "Stage" to (AdhxColors.Stage to Color(0xFF000000)),
            "Deep" to (AdhxColors.Deep to Color(0xFF12110F)),
            "Surface" to (AdhxColors.Surface to Color(0xFF1A1814)),
            "Sheet" to (AdhxColors.Sheet to Color(0xFF1C1B19)),
            "Raised" to (AdhxColors.Raised to Color(0xFF2A2620)),
            "Plate" to (AdhxColors.Plate to Color(0xFF262320)),
            "PlateHover" to (AdhxColors.PlateHover to Color(0xFF2F2B27)),
            "Placeholder" to (AdhxColors.Placeholder to Color(0xFF2A2825)),
            "Hairline" to (AdhxColors.Hairline to Color(0xFF2A2620)),
            "Line" to (AdhxColors.Line to Color(0xFF4A453E)),
            "Accent" to (AdhxColors.Accent to Color(0xFFFFD23F)),
            "OnAccent" to (AdhxColors.OnAccent to Color(0xFF000000)),
            "Cream" to (AdhxColors.Cream to Color(0xFFF2EAD9)),
            "OnCream" to (AdhxColors.OnCream to Color(0xFF141414)),
            "OnCreamSoft" to (AdhxColors.OnCreamSoft to Color(0xFF5C5446)),
            "Bone" to (AdhxColors.Bone to Color(0xFFB8AB92)),
            "Ink" to (AdhxColors.Ink to Color(0xFFF4F1EA)),
            "InkSoft" to (AdhxColors.InkSoft to Color(0xFFC9BFAB)),
            "InkFaint" to (AdhxColors.InkFaint to Color(0xFFA89F8D)),
            "Good" to (AdhxColors.Good to Color(0xFF7DDC8A)),
            "Warn" to (AdhxColors.Warn to Color(0xFFFFB59A)),
            "Live" to (AdhxColors.Live to Color(0xFFFF5A3C)),
            "Danger" to (AdhxColors.Danger to Color(0xFFFF8A7A)),
            "DangerFill" to (AdhxColors.DangerFill to Color(0xFFE5484D)),
            "Watching" to (AdhxColors.Watching to Color(0xFF5EE38A)),
            "Paper" to (AdhxColors.Paper to Color(0xFFE4DAC8)),
            "PaperInk" to (AdhxColors.PaperInk to Color(0xFF141414)),
            "PaperInkSoft" to (AdhxColors.PaperInkSoft to Color(0xFF3A352D)),
            "Person1" to (AdhxColors.Person1 to Color(0xFF7FD1AE)),
            "Person2" to (AdhxColors.Person2 to Color(0xFFFF8FA3)),
            "Person3" to (AdhxColors.Person3 to Color(0xFF6B8CFF)),
            "Person4" to (AdhxColors.Person4 to Color(0xFFC4A7FF)),
            "Person5" to (AdhxColors.Person5 to Color(0xFFFFB35C)),
            "Moment1" to (AdhxColors.Moment1 to Color(0xFF7EE08A)),
            "Moment2" to (AdhxColors.Moment2 to Color(0xFFFF9A62)),
            "Moment3" to (AdhxColors.Moment3 to Color(0xFFFF9EC7)),
            "Moment4" to (AdhxColors.Moment4 to Color(0xFFF6C35C)),
            "Moment5" to (AdhxColors.Moment5 to Color(0xFF86C2FF)),
            "Moment6" to (AdhxColors.Moment6 to Color(0xFFC3A6FF)),
            "Moment7" to (AdhxColors.Moment7 to Color(0xFF7FE3D6)),
            "Moment8" to (AdhxColors.Moment8 to Color(0xFFFF8A8A)),
            "Moment9" to (AdhxColors.Moment9 to Color(0xFFD6E36B)),
        ).forEach { (name, pair) -> assertEquals(name, pair.second, pair.first) }
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
    fun channelTilesFollowTheirShape() {
        fun post(w: Double?, h: Double?) = PhonePost(platform = "x", id = "1", media = listOf(PhoneMedia(width = w, height = h)))
        assertEquals(290.dp, tileHeight(post(352.0, 640.0)))
        assertEquals(180.dp, tileHeight(post(1280.0, 720.0)))
        assertEquals(230.dp, tileHeight(post(null, null)))
        assertEquals(180.dp, tileHeight(PhonePost(platform = "x", id = "2")))
    }
}
