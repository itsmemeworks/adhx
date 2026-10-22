package com.adhx.share.library

import com.adhx.share.net.WatchedPost
import com.adhx.share.net.WatchedRequest
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Watch counts: the same rules as the web's `tally.test.ts` and the iPhone's `WatchTallyTests`. */
class WatchTallyTest {
    /** Plays from [from] to [to] seconds in quarter-second samples, like the player's position poll. */
    private fun WatchTracker.play(from: Double, to: Double, duration: Double) {
        var s = from
        while (s <= to + 1e-9) {
            sample(s, duration)
            s += 0.25
        }
    }

    @Test
    fun aPlayCountsOnceAPassFromTheTopHasReallyPlayed() {
        val t = WatchTracker()
        t.begin("twitter:1")
        t.play(0.0, 0.75, 30.0)
        assertEquals(0, t.tallies["twitter:1"]?.plays ?: 0)
        t.play(1.0, 10.0, 30.0)
        assertEquals(WatchTally(plays = 1, finishes = 0, seconds = 10.0), t.tallies["twitter:1"])
    }

    @Test
    fun theEndIsOneFinishAndAReplayIsAnotherPlay() {
        val t = WatchTracker()
        t.begin("twitter:1")
        t.play(0.0, 8.0, 8.0)
        t.ended()
        t.ended()
        t.play(0.0, 3.0, 8.0)
        assertEquals(WatchTally(plays = 2, finishes = 1, seconds = 11.0), t.tallies["twitter:1"])
    }

    @Test
    fun repeatOnesLoopWrappingRoundIsAFinishAndANewPlay() {
        val t = WatchTracker()
        t.begin("twitter:1")
        t.play(0.0, 5.75, 6.0)
        t.play(0.0, 5.75, 6.0)
        t.play(0.0, 2.0, 6.0)
        assertEquals(WatchTally(plays = 3, finishes = 2, seconds = 13.5), t.tallies["twitter:1"])
    }

    @Test
    fun resumingSeekingAndScrubbingBackAreNotPlays() {
        val t = WatchTracker()
        t.begin("youtube:long", at = 300.0)
        t.sample(0.0, 600.0) // the poll before the seek lands
        t.sample(300.0, 600.0)
        t.play(300.25, 310.0, 600.0)
        t.sample(500.0, 600.0)
        t.sample(20.0, 600.0)
        t.play(20.25, 25.0, 600.0)
        assertEquals(WatchTally(plays = 0, finishes = 0, seconds = 15.0), t.tallies["youtube:long"])
    }

    @Test
    fun nothingOnScreenCountsNothing() {
        val t = WatchTracker()
        t.begin(null)
        t.play(0.0, 5.0, 10.0)
        t.ended()
        assertTrue(t.tallies.isEmpty())
    }

    @Test
    fun batchesSendWholeSecondsAndKeepTheFractions() {
        val t = WatchTracker()
        t.tallies["twitter:a"] = WatchTally(plays = 1, seconds = 12.5)
        t.tallies["twitter:b"] = WatchTally(seconds = 0.5)
        val batch = t.takeBatch()
        assertEquals(listOf(WatchSent("twitter", "a", 1, 0, 12)), batch)
        assertEquals(WatchTally(seconds = 0.5), t.tallies["twitter:a"])
        assertEquals(WatchTally(seconds = 0.5), t.tallies["twitter:b"])
        t.putBack(batch)
        assertEquals(WatchTally(plays = 1, seconds = 12.5), t.tallies["twitter:a"])

        val many = WatchTracker()
        repeat(60) { many.tallies["tiktok:$it"] = WatchTally(plays = 1) }
        assertEquals(50, many.takeBatch().size)
        assertEquals(10, many.tallies.size)
    }

    @Test
    fun theRequestHasTheServersShape() {
        val body = Json.encodeToString(
            WatchedRequest.serializer(),
            WatchedRequest(listOf(WatchedPost("twitter", "a", 2, 1, 30))),
        )
        assertEquals("""{"posts":[{"platform":"twitter","id":"a","plays":2,"finishes":1,"seconds":30}]}""", body)
    }
}
