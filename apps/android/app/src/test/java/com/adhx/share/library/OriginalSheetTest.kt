package com.adhx.share.library

import com.adhx.share.net.PhoneArticle
import com.adhx.share.net.PhoneAuthor
import com.adhx.share.net.PhonePost
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.ZoneId
import java.util.Locale

class OriginalSheetTest {
    private fun post(name: String? = null, handle: String = "", platform: String = "youtube") =
        PhonePost(platform = platform, id = "1", author = PhoneAuthor(handle = handle, name = name))

    @Test
    fun theHeaderNamesWhoPostedItElseTheNetwork() {
        assertEquals("Rick Astley", originalHeading(post(name = " Rick Astley ", handle = "rickastley")))
        assertEquals("snl", originalHeading(post(handle = "@snl")))
        // Neither, or only the network's own name or one letter: the network.
        assertEquals("YouTube", originalHeading(post()))
        assertEquals("YouTube", originalHeading(post(name = "YouTube")))
        assertEquals("X", originalHeading(post(name = "x", platform = "twitter")))
        assertEquals("The original post", originalHeading(post(platform = "web")))
    }

    @Test
    fun theLineHasTheHandleAndTheDay() {
        assertEquals("@rickastley · Posted 18 Oct 2026", originalLine(post(name = "Rick Astley", handle = "rickastley"), posted = "18 Oct 2026"))
        // The handle isn't repeated when it's already the name, nor when it's the network's.
        assertEquals("Posted 18 Oct 2026", originalLine(post(handle = "snl"), posted = "18 Oct 2026"))
        assertEquals("Posted 18 Oct 2026", originalLine(post(handle = "YouTube"), posted = "18 Oct 2026"))
        // No day: the network's name.
        assertEquals("@rickastley · YouTube", originalLine(post(name = "Rick Astley", handle = "rickastley"), posted = null))
        assertNull(originalHandle(post()))
    }

    @Test
    fun theDayReadsLikeEighteenOctober() {
        assertEquals("18 Oct 2026", postedDay("2026-10-18T09:30:00.000Z", ZoneId.of("UTC"), Locale.UK))
        assertNull(postedDay(null))
        assertNull(postedDay("yesterday"))
    }

    @Test
    fun theNetworksMarkShowsOnce() {
        // Their picture leads the header: the mark goes beside the line.
        assertTrue(lineShowsMark(hasPicture = true))
        // No picture: the mark is the header's picture, so the line goes without it.
        assertFalse(lineShowsMark(hasPicture = false))
    }

    @Test
    fun noWordsSaysWhatThereIs() {
        assertEquals("No words with this one, just the video.", noWordsLine("video"))
        assertEquals("No words with this one, just the picture.", noWordsLine("photo"))
        assertEquals("No words with this one, just the sound.", noWordsLine("audio"))
        assertFalse(hasOriginalWords(post()))
        assertTrue(hasOriginalWords(PhonePost(text = "hello")))
        assertTrue(hasOriginalWords(PhonePost(article = PhoneArticle(body = "# Hi"))))
    }
}
