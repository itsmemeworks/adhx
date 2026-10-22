package com.adhx.share.ui

import androidx.compose.ui.geometry.Size
import androidx.compose.ui.geometry.toRect
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp

/**
 * A rounded rectangle with continuous corners, like iOS's: each corner is one
 * cubic Bézier that leaves the edge [Squircle.EXTENT]× the radius before the
 * corner, so the curve eases in instead of a circle's sudden bend. Every
 * rounded rectangle in the app uses it; full pills (`RoundedCornerShape(50)`),
 * circles and [GobShape] stay as they are.
 *
 * Inside a rounded container, an element along its edge gets the container's
 * radius minus the distance from the container's outer edge to the element
 * (its padding plus any border), at least 8dp — see [nested].
 */
class SquircleShape(
    private val topStart: Dp,
    private val topEnd: Dp,
    private val bottomEnd: Dp,
    private val bottomStart: Dp,
) : Shape {
    constructor(radius: Dp) : this(radius, radius, radius, radius)

    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline {
        val ltr = layoutDirection == LayoutDirection.Ltr
        val tl = with(density) { (if (ltr) topStart else topEnd).toPx() }
        val tr = with(density) { (if (ltr) topEnd else topStart).toPx() }
        val br = with(density) { (if (ltr) bottomEnd else bottomStart).toPx() }
        val bl = with(density) { (if (ltr) bottomStart else bottomEnd).toPx() }
        if (tl <= 0f && tr <= 0f && br <= 0f && bl <= 0f) return Outline.Rectangle(size.toRect())
        val path = Path()
        Squircle.trace(size.width, size.height, tl, tr, br, bl, object : Squircle.Pen {
            override fun moveTo(x: Float, y: Float) = path.moveTo(x, y)
            override fun lineTo(x: Float, y: Float) = path.lineTo(x, y)
            override fun cubicTo(x1: Float, y1: Float, x2: Float, y2: Float, x3: Float, y3: Float) =
                path.cubicTo(x1, y1, x2, y2, x3, y3)
            override fun close() = path.close()
        })
        return Outline.Generic(path)
    }

    override fun equals(other: Any?): Boolean =
        other is SquircleShape && topStart == other.topStart && topEnd == other.topEnd &&
            bottomEnd == other.bottomEnd && bottomStart == other.bottomStart

    override fun hashCode(): Int = ((topStart.hashCode() * 31 + topEnd.hashCode()) * 31 + bottomEnd.hashCode()) * 31 + bottomStart.hashCode()

    override fun toString(): String = "SquircleShape($topStart, $topEnd, $bottomEnd, $bottomStart)"

    companion object {
        /** Round on top, square underneath: bottom sheets. */
        fun top(radius: Dp) = SquircleShape(radius, radius, 0.dp, 0.dp)

        /**
         * The radius for something inside a rounded container: [outer] minus
         * [inset], the distance from the container's outer edge to the element
         * (padding plus border), never under 8dp.
         */
        fun nested(outer: Dp, inset: Dp): Dp = maxOf(outer - inset, 8.dp)
    }
}

/** The geometry behind [SquircleShape], free of Android so it can be tested. */
object Squircle {
    /** How far before the corner the curve leaves the edge, per unit of radius. */
    const val EXTENT = 1.28f

    /** How deep a circular corner is at 45°, per unit of radius: 1 − 1/√2. */
    const val DEPTH = 0.29289f

    interface Pen {
        fun moveTo(x: Float, y: Float)
        fun lineTo(x: Float, y: Float)
        fun cubicTo(x1: Float, y1: Float, x2: Float, y2: Float, x3: Float, y3: Float)
        fun close()
    }

    /** How far along each edge a corner of [radius] reaches, clamped to half the shorter side. */
    fun extent(radius: Float, width: Float, height: Float): Float =
        minOf(radius.coerceAtLeast(0f) * EXTENT, minOf(width, height) / 2f).coerceAtLeast(0f)

    /**
     * Where the corner's two control points sit, measured from the corner along
     * each edge. They put the curve's midpoint, `(extent + 3·handle) / 8`, where
     * a circular corner of the same radius would be (≈0.354× the radius), so a
     * squircle looks as round as the circle it replaces. A radius past half the
     * shorter side rounds like half the side, so the ends stay full.
     */
    fun handle(radius: Float, width: Float, height: Float): Float {
        val e = extent(radius, width, height)
        val r = minOf(radius.coerceAtLeast(0f), minOf(width, height) / 2f)
        return ((8f * DEPTH * r - e) / 3f).coerceIn(0f, e)
    }

    /** Draws the outline clockwise from the top-left corner's end with [pen]. Radii are in px. */
    fun trace(width: Float, height: Float, topLeft: Float, topRight: Float, bottomRight: Float, bottomLeft: Float, pen: Pen) {
        val w = width
        val h = height
        val a = extent(topLeft, w, h)
        val b = extent(topRight, w, h)
        val c = extent(bottomRight, w, h)
        val d = extent(bottomLeft, w, h)
        val ha = handle(topLeft, w, h)
        val hb = handle(topRight, w, h)
        val hc = handle(bottomRight, w, h)
        val hd = handle(bottomLeft, w, h)
        pen.moveTo(a, 0f)
        pen.lineTo(w - b, 0f)
        pen.cubicTo(w - hb, 0f, w, hb, w, b)
        pen.lineTo(w, h - c)
        pen.cubicTo(w, h - hc, w - hc, h, w - c, h)
        pen.lineTo(d, h)
        pen.cubicTo(hd, h, 0f, h - hd, 0f, h - d)
        pen.lineTo(0f, a)
        pen.cubicTo(0f, ha, ha, 0f, a, 0f)
        pen.close()
    }
}
