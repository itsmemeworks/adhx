package com.adhx.share.feed

import com.adhx.share.net.FeedMode
import com.adhx.share.net.PhonePost
import com.adhx.share.ui.Copy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class NewBadgeTest {
    private fun posts(n: Int) = List(n) { PhonePost(platform = "x", id = it.toString()) }

    @Test
    fun countsWhatsLeftAndCapsAt99() {
        assertEquals("7", Copy.newBadge(7, more = false))
        assertEquals("7+", Copy.newBadge(7, more = true))
        assertEquals("99", Copy.newBadge(99, more = false))
        assertEquals("99+", Copy.newBadge(100, more = false))
        assertEquals("99+", Copy.newBadge(137, more = true))
        assertNull(Copy.newBadge(0, more = false))
        assertEquals("0+", Copy.newBadge(0, more = true))
    }

    @Test
    fun onlyInNewModeWithPostsLoaded() {
        val ui = FeedUi(items = posts(5), ended = true)
        assertEquals("4", newBadge(ui, page = 0))
        assertNull(newBadge(ui, page = 4))
        assertNull(newBadge(ui, page = 5)) // the caught-up page
        assertNull(newBadge(ui.copy(mode = FeedMode.EVERYONE), page = 0))
        assertNull(newBadge(FeedUi(), page = 0))
        assertEquals("19+", newBadge(FeedUi(items = posts(20)), page = 0))
    }

    @Test
    fun describesTheBadge() {
        assertEquals("New, 7 left", Copy.newTabDescription("7"))
        assertEquals("New, 99 or more left", Copy.newTabDescription("99+"))
        assertEquals("New", Copy.newTabDescription(null))
    }
}
