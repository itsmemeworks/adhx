package com.adhx.share.ui

import android.graphics.Matrix
import android.graphics.RectF
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.asComposePath
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection

/**
 * Gob's shape (brand/BRAND.md), the shape of every person's face: a rounded
 * square with corners at 38% of its size, tilted −4°. The tilt is in the
 * outline, so whatever it clips stays upright (initials read straight) and a
 * `border` ring follows the corners. Status dots, live dots, round buttons and
 * badges stay [androidx.compose.foundation.shape.CircleShape].
 */
object GobShape : Shape {
    const val CORNER_PERCENT = 38
    const val TILT_DEGREES = -4f

    /** Tilted, the square reaches ~1.6% past its bounds; this keeps it inside. */
    private const val FIT = 0.984f

    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline {
        val side = minOf(size.width, size.height) * FIT
        val cx = size.width / 2f
        val cy = size.height / 2f
        val radius = side * CORNER_PERCENT / 100f
        val path = android.graphics.Path().apply {
            addRoundRect(
                RectF(cx - side / 2f, cy - side / 2f, cx + side / 2f, cy + side / 2f),
                radius,
                radius,
                android.graphics.Path.Direction.CW,
            )
            transform(Matrix().apply { setRotate(TILT_DEGREES, cx, cy) })
        }
        return Outline.Generic(path.asComposePath())
    }
}
