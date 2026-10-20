package com.adhx.share.ui

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.dp

/**
 * The line icons of the designs (24×24, round ends, 2px strokes), drawn the
 * same way here so the buttons look like the boards. Tint them with `Icon`.
 */
object Glyphs {
    val Search = stroke(circle(11f, 11f, 7f) + "M20 20l-3.5-3.5")
    val Settings = stroke(circle(12f, 12f, 3f) + "M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1")
    val Sliders = stroke("M4 7h9M17 7h3M4 17h3M11 17h9" + circle(15f, 7f, 2f) + circle(9f, 17f, 2f))
    val Bookmark = stroke("M6 3h12v18l-6-4-6 4z")
    val BookmarkFilled = ImageVector.Builder(defaultWidth = 24.dp, defaultHeight = 24.dp, viewportWidth = 24f, viewportHeight = 24f)
        .addPath(
            pathData = addPathNodes("M6 3h12v18l-6-4-6 4z"),
            fill = SolidColor(Color.White),
            stroke = SolidColor(Color.White),
            strokeLineWidth = 2f,
            strokeLineJoin = StrokeJoin.Round,
        )
        .build()
    val Video = stroke(rect(3f, 6f, 13f, 12f, 2f) + "M16 10l5-3v10l-5-3z")
    val Download = stroke("M12 4v11M7 10l5 5 5-5M5 20h14")
    val More = fill(circle(5f, 12f, 2f) + circle(12f, 12f, 2f) + circle(19f, 12f, 2f))
    val Heart = stroke("M12 20s-7-4.5-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.5-7 10-7 10z")
    val People = stroke(circle(9f, 8f, 3f) + circle(16f, 9f, 2.5f) + "M3 19c0-3 3-5 6-5s6 2 6 5M14 14.5c3 0 6 1.5 6 4.5")
    val PlayCircle = stroke(circle(12f, 12f, 9f) + "M10 8.5l5 3.5-5 3.5z")
    val Chevron = stroke("M9 6l6 6-6 6", width = 2.4f)
    val Back = stroke("M15 5l-7 7 7 7")
    val Close = stroke("M6 6l12 12M18 6L6 18", width = 2.4f)
    val Play = fill("M7 4l13 8-13 8z")
    val Plus = stroke("M12 5v14M5 12h14")
    val Minus = stroke("M6 12h12", width = 2.4f)
    val Lock = stroke(rect(5f, 11f, 14f, 10f, 2f) + "M8 11V7a4 4 0 018 0v4", width = 2.2f)
    val Check = stroke("M5 12l5 5 9-10", width = 3f)
    val Again = stroke("M4 12a8 8 0 1 0 2.5-5.8M4 4v4h4", width = 2.2f)
    val Smile = stroke(circle(12f, 12f, 9f) + "M8.5 14.5c1 1.3 2.2 2 3.5 2s2.5-.7 3.5-2" + circle(9f, 10f, 0.6f) + circle(15f, 10f, 0.6f))
    val Bell = stroke("M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4")
    val Pencil = stroke("M4 20h4L19 9l-4-4L4 16z", width = 2.6f)
    val Chat = stroke("M4 5h16v11H9l-5 4z")
    val Mail = stroke(rect(3f, 5f, 18f, 14f, 2f) + "M3 7l9 6 9-6")
    val Folder = stroke("M3 6h6l2 2h10v11H3z")
    val Photo = stroke(rect(3f, 5f, 18f, 14f, 2f) + circle(9f, 10f, 2f) + "M21 16l-5-5-9 8")
    val PhotoFeed = stroke(rect(3f, 4f, 18f, 16f, 2f) + circle(9f, 10f, 2f) + "M21 16l-5-5-9 9")
    val VideoFeed = stroke(rect(2f, 6f, 14f, 12f, 2f) + "M16 10l6-3v10l-6-3z")
    val Lines = stroke("M4 6h16M4 11h16M4 16h10")
    val Article = stroke("M6 3h9l4 4v14H6zM9 12h7M9 16h5")

    private fun circle(cx: Float, cy: Float, r: Float) =
        "M${cx - r} ${cy}a$r $r 0 1 0 ${2 * r} 0a$r $r 0 1 0 ${-2 * r} 0z"

    private fun rect(x: Float, y: Float, w: Float, h: Float, r: Float) =
        "M${x + r} ${y}h${w - 2 * r}a$r $r 0 0 1 $r ${r}v${h - 2 * r}a$r $r 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a$r $r 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a$r $r 0 0 1 $r ${-r}z"

    private fun stroke(d: String, width: Float = 2f): ImageVector =
        ImageVector.Builder(defaultWidth = 24.dp, defaultHeight = 24.dp, viewportWidth = 24f, viewportHeight = 24f)
            .addPath(
                pathData = addPathNodes(d),
                stroke = SolidColor(Color.White),
                strokeLineWidth = width,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round,
            )
            .build()

    private fun fill(d: String): ImageVector =
        ImageVector.Builder(defaultWidth = 24.dp, defaultHeight = 24.dp, viewportWidth = 24f, viewportHeight = 24f)
            .addPath(pathData = addPathNodes(d), fill = SolidColor(Color.White))
            .build()
}
