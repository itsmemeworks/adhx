package com.adhx.share.feed

import com.adhx.share.net.PostRef
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SeenBatcherTest {
    private fun ref(n: Int) = PostRef("x", n.toString())

    @Test
    fun countsAfterTwoSecondsOnStage() {
        val seen = SeenBatcher()
        seen.onStage(ref(1), 0, now = 0)
        seen.tick(1_999)
        assertEquals(0, seen.waiting)
        seen.tick(2_000)
        assertEquals(listOf(ref(1)), seen.drain())
    }

    @Test
    fun swipingPastCountsAtOnceButGoingBackDoesNot() {
        val seen = SeenBatcher()
        seen.onStage(ref(1), 0, now = 0)
        seen.onStage(ref(2), 1, now = 300) // skipped 1 after 0.3 s
        assertEquals(listOf(ref(1)), seen.drain())
        seen.onStage(ref(1), 0, now = 800) // back up from 2 after 0.5 s: 2 isn't seen
        assertEquals(0, seen.waiting)
        seen.onStage(ref(2), 1, now = 900)
        seen.tick(3_000)
        assertEquals(listOf(ref(2)), seen.drain())
    }

    @Test
    fun goingBackAfterTheDwellStillCounts() {
        val seen = SeenBatcher()
        seen.onStage(ref(5), 3, now = 0)
        seen.onStage(ref(4), 2, now = 2_500)
        assertEquals(listOf(ref(5)), seen.drain())
    }

    @Test
    fun eachPostIsSentOnce() {
        val seen = SeenBatcher()
        seen.mark(ref(1))
        seen.mark(ref(1))
        assertEquals(1, seen.drain().size)
        seen.mark(ref(1))
        assertEquals(0, seen.waiting)
    }

    @Test
    fun fullAfterABatchAndDrainsAtMostFifty() {
        val seen = SeenBatcher(batchSize = 10)
        repeat(9) { seen.mark(ref(it)) }
        assertFalse(seen.full)
        seen.mark(ref(9))
        assertTrue(seen.full)
        repeat(60) { seen.mark(ref(100 + it)) }
        val first = seen.drain()
        assertEquals(SeenBatcher.MAX_BATCH, first.size)
        assertEquals(ref(0), first.first())
        assertEquals(20, seen.drain().size)
        assertEquals(0, seen.drain().size)
    }

    @Test
    fun aFailedBatchGoesBackFirstAndIsNotLost() {
        val seen = SeenBatcher()
        seen.mark(ref(1))
        seen.mark(ref(2))
        val batch = seen.drain()
        seen.mark(ref(3))
        seen.failed(batch)
        assertEquals(listOf(ref(1), ref(2), ref(3)), seen.drain())
    }

    @Test
    fun theEndPageCountsTheLastPost() {
        val seen = SeenBatcher()
        seen.onStage(ref(1), 0, now = 0)
        seen.onStage(null, 1, now = 100) // the caught-up page
        assertEquals(listOf(ref(1)), seen.drain())
        seen.tick(10_000) // nothing on stage
        assertEquals(0, seen.waiting)
    }

    @Test
    fun leavingTheStageForANewModeKeepsWhatsWaiting() {
        val seen = SeenBatcher()
        seen.onStage(ref(1), 4, now = 0)
        seen.leaveStage(now = 2_100)
        seen.onStage(ref(9), 0, now = 2_200) // index 0 of the new feed is not "past" 4
        assertEquals(listOf(ref(1)), seen.drain())
    }
    @Test
    fun freshSendOfPreviouslyWatchedPostCanBeAcknowledgedAgain() {
        val seen = SeenBatcher()
        seen.mark(ref(1))
        assertEquals(listOf(ref(1)), seen.drain())
        seen.newSession(10_000)
        seen.onStage(ref(1), 0, 10_000)
        seen.tick(12_100)
        assertEquals(listOf(ref(1)), seen.drain())
        assertTrue("x:1" in seen.counted)
    }

    @Test
    fun replacementSessionKeepsPendingRetriesButCredentialChangeDropsThem() {
        val seen = SeenBatcher()
        seen.mark(ref(1))
        seen.newSession(0)
        assertEquals(listOf(ref(1)), seen.drain())
        seen.mark(ref(2))
        seen.clear()
        assertEquals(0, seen.waiting)
        assertTrue(seen.counted.isEmpty())
    }
}
