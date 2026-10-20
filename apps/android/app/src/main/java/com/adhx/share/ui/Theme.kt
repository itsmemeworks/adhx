package com.adhx.share.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.layout
import androidx.compose.ui.unit.TextUnit
import kotlin.math.roundToInt
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import com.adhx.share.R
import androidx.compose.ui.unit.sp

/** The ADHX colours (docs/specs/phone-app.md → Colours and type). */
object AdhxColors {
    val Background = Color(0xFF0F0E0C)
    val Black = Color(0xFF000000)
    val Surface = Color(0xFF1A1814)
    val Raised = Color(0xFF2A2620)
    val Placeholder = Color(0xFF2A2825)
    val Hairline = Color(0xFF4A453E)
    val Accent = Color(0xFFFFD23F)
    val Cream = Color(0xFFF4F1EA)
    val Muted = Color(0xFFC9BFAB)
    val Faint = Color(0xFFA39B8B)
    val Good = Color(0xFF7DDC8A)
    val Warn = Color(0xFFFFB59A)
    /** The designs' "white" for words and icons is a warm off-white (#f4f1ea). */
    val White = Color(0xFFF4F1EA)

    /** A card on a card (the share card's people row, the why sheet's post). */
    val Card = Color(0xFF262320)

    /** The red dot of Live. */
    val Live = Color(0xFFFF5A3C)

    /** Buttons that sit on a surface (Open in ADHX, See what's live). */
    val Button = Color(0xFF262320)
}

/**
 * Headings are Instrument Serif and everything else is Hanken Grotesk, as on
 * the web (both bundled in res/font, with their licences in assets/licenses).
 */
val SerifFamily: FontFamily = FontFamily(Font(R.font.instrument_serif, FontWeight.Normal))

/**
 * Serif headings set tighter than the font (34sp on 33sp lines) as CSS sets
 * them: Compose keeps Instrument Serif's full ascent over the first line and
 * descent under the last (1.3em in all), where a CSS line box splits the
 * difference to line-height evenly. This trims that much off the top and/or
 * bottom, so the words around a heading sit where the boards put them.
 */
fun Modifier.serifLineBox(fontSize: TextUnit, lineHeight: TextUnit, top: Boolean = true, bottom: Boolean = true): Modifier =
    layout { measurable, constraints ->
        val placeable = measurable.measure(constraints)
        val trim = ((1.3f * fontSize.toPx() - lineHeight.toPx()) / 2f).coerceAtLeast(0f).roundToInt()
        val cut = (if (top) trim else 0) + (if (bottom) trim else 0)
        layout(placeable.width, (placeable.height - cut).coerceAtLeast(0)) {
            placeable.place(0, if (top) -trim else 0)
        }
    }

/**
 * Hanken Grotesk is one variable font (the web's latin subset, weights
 * 100–900): each weight is the same file at that point on its weight axis.
 */
val SansFamily: FontFamily = FontFamily(
    listOf(100, 200, 300, 400, 500, 600, 700, 800, 900).map { weight ->
        Font(
            R.font.hanken_grotesk,
            weight = FontWeight(weight),
            variationSettings = FontVariation.Settings(FontVariation.weight(weight)),
        )
    },
)

private val colors = darkColorScheme(
    primary = AdhxColors.Accent,
    onPrimary = AdhxColors.Black,
    secondary = AdhxColors.Cream,
    onSecondary = AdhxColors.Black,
    background = AdhxColors.Background,
    onBackground = AdhxColors.White,
    surface = AdhxColors.Surface,
    onSurface = AdhxColors.White,
    surfaceVariant = AdhxColors.Raised,
    onSurfaceVariant = AdhxColors.Muted,
    surfaceContainerHigh = AdhxColors.Surface,
    outline = AdhxColors.Hairline,
    outlineVariant = AdhxColors.Hairline,
    error = AdhxColors.Warn,
    onError = AdhxColors.Black,
)

private val sans = Typography().let { base ->
    fun TextStyle.sans() = copy(fontFamily = SansFamily)
    base.copy(
        displayLarge = base.displayLarge.sans(),
        displayMedium = base.displayMedium.sans(),
        headlineLarge = base.headlineLarge.sans(),
        headlineMedium = base.headlineMedium.sans(),
        titleLarge = base.titleLarge.sans(),
        titleMedium = base.titleMedium.sans(),
        titleSmall = base.titleSmall.sans(),
        labelMedium = base.labelMedium.sans(),
        labelSmall = base.labelSmall.sans(),
    )
}

private val typography = sans.copy(
    displaySmall = TextStyle(fontFamily = SerifFamily, fontWeight = FontWeight.Normal, fontSize = 40.sp, lineHeight = 40.sp),
    headlineSmall = TextStyle(fontFamily = SerifFamily, fontWeight = FontWeight.Normal, fontSize = 30.sp, lineHeight = 32.sp),
    bodyLarge = TextStyle(fontFamily = SansFamily, fontSize = 15.sp, lineHeight = 22.sp),
    bodyMedium = TextStyle(fontFamily = SansFamily, fontSize = 14.sp, lineHeight = 20.sp),
    bodySmall = TextStyle(fontFamily = SansFamily, fontSize = 13.sp, lineHeight = 18.sp),
    labelLarge = TextStyle(fontFamily = SansFamily, fontSize = 15.sp, fontWeight = FontWeight.ExtraBold),
)

@Composable
fun AdhxTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = colors, typography = typography, content = content)
}
