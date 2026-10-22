package com.adhx.share.library

import com.adhx.share.net.AdhxApi
import com.adhx.share.net.ApiResult
import com.adhx.share.net.LiveReaction
import com.adhx.share.net.PhoneMatch
import com.adhx.share.net.PhonePost
import com.adhx.share.net.Saver
import com.adhx.share.net.WhyReason
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.ZoneOffset

/** Picking up where you left off, can't play, Up next's chips and replies (boards 14.2–14.9). */
class PlayerFourTest {
    private val now = Instant.parse("2026-10-22T12:00:00Z").toEpochMilli()
    private val utc = ZoneOffset.UTC

    @Test
    fun onlyLongPostsLeftPartWayArePickedUp() {
        assertNull(Resume.spotFor(30_000, 50_000, now)) // short: never
        assertNull(Resume.spotFor(10_000, 600_000, now)) // barely started
        assertNull(Resume.spotFor(590_000, 600_000, now)) // as good as finished
        assertEquals(ResumeSpot(760_000, 1_800_000, now), Resume.spotFor(760_000, 1_800_000, now))
        assertFalse(Resume.counts(59_000))
        assertTrue(Resume.counts(60_000))
    }

    @Test
    fun oldAndTooManySpotsAreForgotten() {
        val old = ResumeSpot(20_000, 120_000, now - Resume.KEEP_MS - 1)
        val fresh = ResumeSpot(20_000, 120_000, now - 1000)
        assertEquals(setOf("x:new"), Resume.tidy(mapOf("x:old" to old, "x:new" to fresh), now).keys)
        val many = (0 until Resume.MOST + 5).associate { "x:$it" to ResumeSpot(20_000, 120_000, now - it) }
        val kept = Resume.tidy(many, now)
        assertEquals(Resume.MOST, kept.size)
        assertTrue("x:0" in kept && "x:${Resume.MOST + 4}" !in kept)
    }

    @Test
    fun theCardSaysWhereAndWhen() {
        assertEquals("12:40", Resume.clock(760_000))
        assertEquals("1:02:05", Resume.clock(3_725_000))
        assertEquals("a moment ago", Resume.whenWords(now - 60_000, now, utc))
        assertEquals("earlier today", Resume.whenWords(now - 3 * 3_600_000L, now, utc))
        assertEquals("yesterday", Resume.whenWords(now - 24 * 3_600_000L, now, utc))
        assertEquals("3 days ago", Resume.whenWords(now - 3 * 86_400_000L, now, utc))
        assertEquals("You were 12:40 into this, yesterday.", Resume.line(ResumeSpot(760_000, 1_800_000, now - 86_400_000L), now, utc))
    }

    @Test
    fun cantPlaySaysWhereAndWhy() {
        assertEquals("Can’t play this one here", CantPlay.title(Trouble.GONE))
        assertEquals("Couldn’t load this one", CantPlay.title(Trouble.CANT_LOAD))
        assertTrue(CantPlay.message(Trouble.GONE, "tiktok", "This one couldn’t be downloaded yet. ADHX will try again.").contains("on TikTok"))
        assertEquals("This one couldn’t be downloaded.", CantPlay.message(Trouble.GONE, "tiktok", "This one couldn’t be downloaded."))
        assertTrue(CantPlay.message(Trouble.GONE, "tiktok", CantPlay.GENERIC).contains("on TikTok"))
        assertTrue(CantPlay.message(Trouble.CANT_LOAD, "x", null).startsWith("Your ADHX didn’t answer in time"))
    }

    @Test
    fun searchChipsSayHowItMatched() {
        assertEquals("On screen", matchChip(PhonePost(match = PhoneMatch("strong", listOf("screen")))))
        assertEquals("Said in the video", matchChip(PhonePost(match = PhoneMatch("good", listOf("speech")))))
        assertNull(matchChip(PhonePost()))
    }

    @Test
    fun repliesGoToWhoeverSentIt() {
        val sent = PhonePost(
            whyReasons = listOf(WhyReason("Ana sent you this", kind = "sent", username = "ana")),
            savers = listOf(Saver(username = "ana", name = "Ana", note = "watch till the end")),
        )
        assertEquals("ana", Replies.sender(sent)?.username)
        assertNull(Replies.sender(PhonePost(whyReasons = listOf(WhyReason("Ana saved this", kind = "fresh", username = "ana")))))

        val pete = Saver(username = "pete", name = "Pete")
        val two = Instant.ofEpochMilli(now - 120_000).toString()
        val words = LiveReaction(key = "1", text = "the ending got me", who = pete, at = two)
        val laugh = LiveReaction(key = "2", emoji = "😂", who = pete, at = two)
        val mine = LiveReaction(key = "3", text = "ha", who = Saver(username = "ana", isYou = true), at = two)
        val stale = LiveReaction(key = "4", text = "old", who = pete, at = Instant.ofEpochMilli(now - 8 * 86_400_000L).toString())
        assertEquals(words, Replies.answer(listOf(words, mine), now))
        assertNull(Replies.answer(listOf(stale, mine), now))
        assertEquals("Pete replied · 2m", Replies.line(words, now))
        assertEquals("Pete reacted 😂 · 2m", Replies.line(laugh, now))
    }

    @Test
    fun seekingFitsNarrowOrZeroWidthTracksWithoutThrowing() {
        assertEquals(5f, SeekTrack.thumbCenter(0f, 10f, 7f))
        assertEquals(5f, SeekTrack.thumbCenter(1f, 10f, 7f))
        assertEquals(0f, SeekTrack.thumbCenter(0.5f, 0f, 7f))
        assertEquals(7f, SeekTrack.thumbCenter(0f, 100f, 7f))
        assertEquals(93f, SeekTrack.thumbCenter(1f, 100f, 7f))
    }

    @Test
    fun freshReplyLabelsReplaceOldIdentitiesEvenWhenEmptyOrFailed() {
        val answers = mutableMapOf<String, LiveReaction>()
        val reaction = LiveReaction(key = "r1", text = "reply", who = Saver(username = "ben"), at = Instant.ofEpochMilli(now - 1000).toString())
        Replies.replaceAnswer(answers, "twitter:one", listOf(reaction), now)
        assertEquals("ben", answers["twitter:one"]?.who?.username)
        Replies.replaceAnswer(answers, "twitter:one", emptyList(), now)
        assertFalse(answers.containsKey("twitter:one"))
        Replies.replaceAnswer(answers, "twitter:one", listOf(reaction), now)
        Replies.replaceAnswer(answers, "twitter:one", null, now)
        assertFalse(answers.containsKey("twitter:one"))
    }

    @Test
    fun removeFromMySavesAsksTheServer() = runBlocking {
        MockWebServer().use { server ->
            val api = AdhxApi(server.url("/").toString(), "phone-key")
            server.enqueue(MockResponse().setBody("""{"ok":true}"""))
            assertTrue(api.removeSave("tiktok", "7600000000000000101") is ApiResult.Ok)
            val request = server.takeRequest()
            assertEquals("DELETE", request.method)
            assertEquals("/api/app/saves?platform=tiktok&id=7600000000000000101", request.path)
            assertEquals("Bearer phone-key", request.getHeader("Authorization"))

            server.enqueue(MockResponse().setResponseCode(404).setBody("""{"error":"not_saved","message":"That post isn’t in your saves."}"""))
            assertEquals(404, (api.removeSave("tiktok", "1") as ApiResult.Failed).status)
        }
    }
    @Test
    fun resumeHistoryIsScopedAndOldPlayersCannotWriteIntoTheNextAccount() {
        var scope: String? = "a"
        var stored: ResumeRecord? = null
        fun history(captured: String?) = ResumeHistory(captured, { scope }, { stored }, { stored = it })
        val a = history(scope)
        a.leave("twitter:one", 120_000, 600_000, now)
        assertEquals(120_000L, a.spot("twitter:one", now)?.positionMs)
        scope = "b"
        val b = history(scope)
        assertNull(b.spot("twitter:one", now))
        b.leave("twitter:one", 180_000, 600_000, now)
        a.leave("twitter:one", 300_000, 600_000, now)
        a.forget("twitter:one")
        assertEquals(180_000L, b.spot("twitter:one", now)?.positionMs)
        scope = null
        assertNull(b.spot("twitter:one", now))
    }

    @Test
    fun releasingTheDecoderDoesNotEraseThePositionNeededOnReturn() {
        val playback = Playback()
        playback.positionMs = 300_000
        playback.durationMs = 600_000
        assertFalse(playback.resetForPlayer(false)) // ON_STOP: no decoder
        val carryOn = playback.positionMs
        assertEquals(300_000L, carryOn)
        assertTrue(playback.resetForPlayer(true)) // ON_START: prepare new decoder
        assertEquals(0L, playback.positionMs)
        assertEquals(300_000L, carryOn) // seek to the captured point, never zero
    }

}
