package com.adhx.share.ui

import androidx.compose.ui.unit.dp
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SquircleTest {
    /** Every point the outline passes through or pulls towards, and where it starts and ends. */
    private class Recorder : Squircle.Pen {
        val points = mutableListOf<Pair<Float, Float>>()
        val cubics = mutableListOf<List<Pair<Float, Float>>>()
        var start: Pair<Float, Float>? = null
        var closed = false
        override fun moveTo(x: Float, y: Float) {
            start = x to y
            points += x to y
        }
        override fun lineTo(x: Float, y: Float) {
            points += x to y
        }
        override fun cubicTo(x1: Float, y1: Float, x2: Float, y2: Float, x3: Float, y3: Float) {
            cubics += listOf(points.last(), x1 to y1, x2 to y2, x3 to y3)
            points += listOf(x1 to y1, x2 to y2, x3 to y3)
        }
        override fun close() {
            closed = true
        }
    }

    private fun trace(w: Float, h: Float, r: Float) = Recorder().also { Squircle.trace(w, h, r, r, r, r, it) }

    @Test
    fun fitsItsBounds() {
        for ((w, h) in listOf(300f to 120f, 52f to 52f, 40f to 200f, 10f to 4f)) {
            for (r in listOf(0f, 8f, 16f, 26f, 1000f)) {
                val pen = trace(w, h, r)
                pen.points.forEach { (x, y) ->
                    assertTrue("($x, $y) outside $w×$h at r=$r", x in 0f..w && y in 0f..h)
                }
                assertEquals(pen.start, pen.points.last())
                assertTrue(pen.closed)
            }
        }
    }

    @Test
    fun cornersStartAboutOnePointTwoEightRadiiOut() {
        assertEquals(20.48f, Squircle.extent(16f, 300f, 120f), 0.001f)
        // The first line runs from the top-left corner's end to the top-right's start.
        val pen = trace(300f, 120f, 16f)
        assertEquals(20.48f to 0f, pen.start)
        assertEquals(300f - 20.48f, pen.points[1].first, 0.001f)
    }

    @Test
    fun clampsTheRadiusToHalfTheShorterSide() {
        assertEquals(20f, Squircle.extent(100f, 40f, 200f), 0.001f)
        assertEquals(26f, Squircle.extent(26f, 52f, 52f), 0.001f)
        assertEquals(0f, Squircle.extent(-4f, 40f, 40f), 0.001f)
        for (r in listOf(0f, 4f, 16f, 30f, 500f)) {
            val e = Squircle.extent(r, 52f, 80f)
            val k = Squircle.handle(r, 52f, 80f)
            assertTrue(e <= 26f)
            assertTrue("handle $k past extent $e", k in 0f..e)
        }
        // Past half the side, the two curves on a short side meet in the middle.
        val pen = trace(40f, 200f, 1000f)
        assertEquals(20f to 0f, pen.start)
        assertEquals(20f, pen.points[1].first, 0.001f)
    }

    @Test
    fun asDeepAsACircularCornerAtFortyFiveDegrees() {
        val r = 10f
        val (p0, p1, p2, p3) = trace(300f, 120f, r).cubics.last()
        // The top-left corner's midpoint (t = 0.5).
        val x = (p0.first + 3 * p1.first + 3 * p2.first + p3.first) / 8
        val y = (p0.second + 3 * p1.second + 3 * p2.second + p3.second) / 8
        val depth = r * (1 - 1 / kotlin.math.sqrt(2f))
        assertEquals(depth, x, 0.01f)
        assertEquals(depth, y, 0.01f)
    }

    @Test
    fun zeroCornersAreSquare() {
        val pen = Recorder().also { Squircle.trace(100f, 50f, 0f, 0f, 20f, 20f, it) }
        assertEquals(0f to 0f, pen.start)
        assertTrue(pen.points.contains(100f to 0f))
    }

    @Test
    fun nestedRadius() {
        // The board's Live card: 26 corners, 8 padding inside a 2dp ring.
        assertEquals(16.dp, SquircleShape.nested(26.dp, 10.dp))
        assertEquals(14.dp, SquircleShape.nested(22.dp, 8.dp))
        // Never under 8.
        assertEquals(8.dp, SquircleShape.nested(24.dp, 20.dp))
    }
}
