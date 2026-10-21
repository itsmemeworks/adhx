package com.adhx.share.library

import android.content.pm.ActivityInfo
import com.adhx.share.net.AdhxApi
import com.adhx.share.net.Entities
import com.adhx.share.net.PhonePost
import com.adhx.share.ui.OrientationHost
import com.adhx.share.ui.orientationFor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LandscapeArticlesTest {
    private val portrait = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
    private val turns = ActivityInfo.SCREEN_ORIENTATION_USER

    @Test
    fun onlyAPlayerWithNothingOverItMayTurn() {
        assertEquals(portrait, orientationFor(emptyList()))
        assertEquals(turns, orientationFor(listOf(true)))
        // A sheet over the player keeps it upright; the newest wins.
        assertEquals(portrait, orientationFor(listOf(true, false)))
        assertEquals(turns, orientationFor(listOf(false, true)))
    }

    @Test
    fun theHostFollowsWhatsOnScreen() {
        val asked = mutableListOf<Int>()
        val host = OrientationHost { asked += it }
        assertEquals(listOf(portrait), asked)
        val player = host.push(true)
        val sheet = host.push(false)
        // The player turning to a words post keeps its place under the sheet.
        host.set(player, false)
        host.set(player, true)
        assertEquals(listOf(portrait, turns, portrait), asked)
        host.pop(sheet)
        assertEquals(turns, asked.last())
        host.pop(player)
        assertEquals(portrait, asked.last())
    }

    @Test
    fun articleBodiesReadAsBlocks() {
        val body = """
            # The big idea

            Some **bold** words, some *slanted* ones and ***both***. Tom &amp; Jerry.

            ![a picture](https://pbs.twimg.com/media/x.jpg)

            ## Why

            - first thing
            - second [link](https://example.com/a) here

            1. one

            1. two

            > a quote
            > on two lines

            ---

            ### Small
        """.trimIndent()
        val blocks = ArticleBody.parse(body)
        val kinds = blocks.map { it::class.simpleName }
        assertEquals(listOf("Heading", "Paragraph", "Heading", "Bullet", "Bullet", "Numbered", "Numbered", "Quote", "Rule", "Heading"), kinds)
        assertEquals(1, (blocks[0] as ArticleBody.Heading).level)
        assertEquals(3, (blocks[9] as ArticleBody.Heading).level)
        val para = (blocks[1] as ArticleBody.Paragraph).runs
        assertEquals("Some bold words, some slanted ones and both. Tom & Jerry.", ArticleBody.plain(para))
        assertTrue(para.single { it.text == "bold" }.bold)
        assertTrue(para.single { it.text == "slanted" }.italic)
        para.single { it.text == "both" }.let { assertTrue(it.bold && it.italic) }
        val link = (blocks[4] as ArticleBody.Bullet).runs.single { it.url != null }
        assertEquals("link" to "https://example.com/a", link.text to link.url)
        assertEquals(listOf(1, 2), blocks.filterIsInstance<ArticleBody.Numbered>().map { it.number })
        assertEquals("a quote\non two lines", ArticleBody.plain((blocks[7] as ArticleBody.Quote).runs))
        assertTrue(ArticleBody.parse(null).isEmpty())
        assertTrue(ArticleBody.parse("  ").isEmpty())
    }

    @Test
    fun unclosedMarksStayAsTheyAre() {
        assertEquals("5 * 3 = 15 and [not a link](ftp://x)", ArticleBody.plain(ArticleBody.inline("5 * 3 = 15 and [not a link](ftp://x)")))
    }

    @Test
    fun theArticleBodyIsOptionalOnThePost() {
        val withBody = AdhxApi.json.decodeFromString(
            PhonePost.serializer(),
            """{"platform":"twitter","id":"1","kind":"article","text":"https://t.co/x","article":{"title":"Big &amp; small","body":"# Hi\n\nThere"}}""",
        )
        assertEquals("Big & small", withBody.article?.title)
        assertEquals(2, ArticleBody.parse(withBody.article?.body).size)
        val older = AdhxApi.json.decodeFromString(PhonePost.serializer(), """{"platform":"twitter","id":"1","article":{"title":"T"}}""")
        assertNull(older.article?.body)
    }

    @Test
    fun entitiesInPostWordsAreDecoded() {
        assertEquals("Tom & Jerry <3 \"hi\" it's it's ok é 😀", Entities.decode("Tom &amp; Jerry &lt;3 &quot;hi&quot; it&#39;s it&apos;s&nbsp;ok &#233; &#x1F600;"))
        assertEquals("&unknown; & alone", Entities.decode("&unknown; & alone"))
        val post = AdhxApi.json.decodeFromString(PhonePost.serializer(), """{"platform":"twitter","id":"1","text":"Fish &amp; chips"}""")
        assertEquals("Fish & chips", post.text)
    }
}
