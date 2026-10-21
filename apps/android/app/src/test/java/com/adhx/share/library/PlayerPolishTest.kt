package com.adhx.share.library

import com.adhx.share.feed.peopleRowSpreads
import com.adhx.share.links.Links
import com.adhx.share.net.PhoneAuthor
import com.adhx.share.net.PhonePost
import com.adhx.share.ui.linked
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PlayerPolishTest {
    @Test
    fun bylineIsWhoPostedItElseTheNetwork() {
        // The mark sits before it, so the network's name isn't repeated.
        assertEquals("Saturday Night Live", bylineName(PhonePost(platform = "youtube", author = PhoneAuthor(name = " Saturday Night Live ", handle = "snl"))))
        assertEquals("@snl", bylineName(PhonePost(platform = "youtube", author = PhoneAuthor(handle = "snl"))))
        assertEquals("", bylineName(PhonePost(platform = "twitter")))
        assertEquals("", bylineName(PhonePost(platform = "youtube", author = PhoneAuthor(name = "YouTube"))))
        assertEquals("@someone", bylineName(PhonePost(platform = "web", author = PhoneAuthor(handle = "someone"))))
        assertEquals("", bylineName(PhonePost(platform = "web")))
    }

    @Test
    fun aPhotoRunsForTenSecondsUnlessPausedOrHeld() {
        var timer = PhotoTimer()
        assertEquals(10_000L, PHOTO_MS)
        timer = timer.tick(4_000)
        assertEquals(0.4f, timer.fraction, 0.001f)
        assertFalse(timer.done)
        // A sheet is open: it waits.
        assertEquals(timer, timer.tick(3_000, held = true))
        // A tap pauses it, another carries on.
        timer = timer.toggled()
        assertTrue(timer.paused)
        assertEquals(timer, timer.tick(3_000))
        timer = timer.toggled().tick(7_000)
        assertTrue(timer.done)
        assertEquals(1f, timer.fraction, 0f)
        // Done stays done; a tap starts the photo over.
        assertEquals(timer, timer.tick(500))
        assertEquals(PhotoTimer(), timer.toggled())
    }

    @Test
    fun afterAPhotoComesTheAlbumsNextThenTheNextSave() {
        assertEquals(PhotoStep.Photo(1), afterPhoto(0, 3, repeat = false))
        assertEquals(PhotoStep.Photo(2), afterPhoto(1, 3, repeat = true))
        assertEquals(PhotoStep.NextPost, afterPhoto(2, 3, repeat = false))
        assertEquals(PhotoStep.NextPost, afterPhoto(0, 1, repeat = false))
        // Repeat this one loops the post: back to its first photo.
        assertEquals(PhotoStep.Photo(0), afterPhoto(2, 3, repeat = true))
        assertEquals(PhotoStep.Photo(0), afterPhoto(0, 1, repeat = true))
    }

    @Test
    fun linksInPostWordsAreFoundAndShortened() {
        val text = "Watch this https://www.youtube.com/watch?v=abc123. And (see https://en.wikipedia.org/wiki/Gob_(film)), ok"
        val spans = Links.spans(text)
        assertEquals(listOf("https://www.youtube.com/watch?v=abc123", "https://en.wikipedia.org/wiki/Gob_(film)"), spans.map { it.url })
        assertEquals("https://www.youtube.com/watch?v=abc123", text.substring(spans[0].start, spans[0].end))
        assertEquals("youtube.com/watch", Links.short(spans[0].url))
        assertEquals("en.wikipedia.org/wiki/Gob_(film)", Links.short(spans[1].url))
        assertEquals("example.com", Links.short("http://example.com/"))
        assertEquals("example.com/a-very-long-path/that…", Links.short("https://example.com/a-very-long-path/that-goes-on-and-on", max = 34))
        assertTrue(Links.spans("no links here, just www.example.com").isEmpty())
        assertEquals("https://x.com/a", Links.firstLink("first https://x.com/a, then https://x.com/b"))
    }

    @Test
    fun linkedWordsShowTheShortLinkAndOpenTheWholeOne() {
        val opened = mutableListOf<String>()
        val words = linked("Read https://www.example.com/story/ today") { opened += it }
        assertEquals("Read example.com/story today", words.text)
        val link = words.getLinkAnnotations(0, words.length).single()
        assertEquals("example.com/story", words.text.substring(link.start, link.end))
        (link.item as androidx.compose.ui.text.LinkAnnotation.Clickable).linkInteractionListener?.onClick(link.item)
        assertEquals(listOf("https://www.example.com/story/"), opened)
        assertEquals("Nothing to tap", linked("Nothing to tap") {}.text)
    }

    @Test
    fun wordsTilesShrinkWithLength() {
        assertEquals(22, wordsTileSize(20).fontSize)
        assertEquals(18, wordsTileSize(100).fontSize)
        assertEquals(15, wordsTileSize(400).fontSize)
    }

    @Test
    fun yourPeopleSpreadOnlyWithFive() {
        assertFalse(peopleRowSpreads(2))
        assertFalse(peopleRowSpreads(4))
        assertTrue(peopleRowSpreads(5))
        assertFalse(peopleRowSpreads(6))
    }

    @Test
    fun copyInTheSendSheetCopiesTheAdhxLink() {
        val server = "https://adhx.example.com"
        assertEquals("https://adhx.example.com/s/youtube/abc", linkToCopy(PhonePost(openPath = "/s/youtube/abc", sourceUrl = "https://youtu.be/abc"), server))
        assertEquals("https://youtu.be/abc", linkToCopy(PhonePost(sourceUrl = "https://youtu.be/abc"), server))
        assertEquals(null, linkToCopy(PhonePost(), server))
        assertEquals("com.whatsapp", WHATSAPP_PACKAGES.first())
    }
}
