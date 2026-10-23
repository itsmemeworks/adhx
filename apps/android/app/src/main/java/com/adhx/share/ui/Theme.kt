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

/**
 * The ADHX colours: the shared design system's colour tokens (one dark theme),
 * named as in its tokens.json (`ink-soft` is [InkSoft]). Network, Gob and
 * extra tokens aren't here until something on the phone draws them.
 */
object AdhxColors {
    /** The app ground (warm black) behind every page, header and tab. */
    val Bg = Color(0xFF0F0E0C)

    /** Behind media: the player, sheets over it, the gap ring round faces on it. */
    val Stage = Color(0xFF000000)

    /** The deep hero and strip ground (the web's signed-out hero, Just saved). */
    val Deep = Color(0xFF12110F)

    /** Raised cards on [Bg]: settings cards, rows, the search field, sheets here. */
    val Surface = Color(0xFF1A1814)

    /** Menus, popovers and sheet panels. */
    val Sheet = Color(0xFF1C1B19)

    /** A card on a card: thumbnail and cover backgrounds. */
    val Raised = Color(0xFF2A2620)

    /** Quiet filled controls: raised buttons, icon plates in sheets, the current row. */
    val Plate = Color(0xFF262320)

    /** [Plate] under a pointer (the web's hover; phones have none). */
    val PlateHover = Color(0xFF2F2B27)

    /** Skeleton bars and pictures before they load. */
    val Placeholder = Color(0xFF2A2825)

    /** Quiet dividers only (decorative, 1.28:1 on [Bg]): never a control's edge. */
    val Hairline = Color(0xFF2A2620)

    /** Control borders: fields at rest, the switch-off track, spinner tracks, page dots. */
    val Line = Color(0xFF4A453E)

    /** The yellow: the one thing to press, on-states, focus, progress, count badges. */
    val Accent = Color(0xFFFFD23F)

    /** Words and icons on [Accent] (and on [DangerFill]). */
    val OnAccent = Color(0xFF000000)

    /** Selected: the chosen tab, segment and chip; toasts, Read all, Retry, the off knob. */
    val Cream = Color(0xFFF2EAD9)

    /** Words and icons on [Cream]. */
    val OnCream = Color(0xFF141414)

    /** Second lines on [Cream]. */
    val OnCreamSoft = Color(0xFF5C5446)

    /** Outlines and rules on [Cream] only (decorative). */
    val Bone = Color(0xFFB8AB92)

    /** Primary words and icons on every dark ground (a warm off-white). */
    val Ink = Color(0xFFF4F1EA)

    /** Second lines on dark: sub lines, captions, pending steps. */
    val InkSoft = Color(0xFFC9BFAB)

    /** Third lines on dark: placeholders, meta, footnotes, counts. */
    val InkFaint = Color(0xFFA89F8D)

    /** Success, done, connected, ready (always with a word or a tick). */
    val Good = Color(0xFF7DDC8A)

    /** Soft errors and "can't reach it". */
    val Warn = Color(0xFFFFB59A)

    /** The red of Live and of needs-you. */
    val Live = Color(0xFFFF5A3C)

    /** Destructive words and borders: Remove, Decline, error lines. */
    val Danger = Color(0xFFFF8A7A)

    /** The one solid destructive button, with [OnAccent] words. */
    val DangerFill = Color(0xFFE5484D)

    /** The ring round people watching live, and the "Tuned in" tick. */
    val Watching = Color(0xFF5EE38A)

    /** Notes from friends on paper. */
    val Paper = Color(0xFFE4DAC8)

    /** Words on [Paper]. */
    val PaperInk = Color(0xFF141414)

    /** Footer and meta words on [Paper]; also the send sheet's tiles and track. */
    val PaperInkSoft = Color(0xFF3A352D)

    /** Face colour 0 (Ben, green); see [faceColor]. */
    val Person1 = Color(0xFF7FD1AE)

    /** Face colour 1 (Ana, pink); also the Live big card's ring. */
    val Person2 = Color(0xFFFF8FA3)

    /** Face colour 2 (Pete, blue). */
    val Person3 = Color(0xFF6B8CFF)

    /** Face colour 3 (Jo, purple). */
    val Person4 = Color(0xFFC4A7FF)

    /** Face colour 4 (Mum, orange). */
    val Person5 = Color(0xFFFFB35C)

    /** Live moment hues 1–9, in the server's order (src/lib/moments/config.ts HUES). */
    val Moment1 = Color(0xFF7EE08A)
    val Moment2 = Color(0xFFFF9A62)
    val Moment3 = Color(0xFFFF9EC7)
    val Moment4 = Color(0xFFF6C35C)
    val Moment5 = Color(0xFF86C2FF)
    val Moment6 = Color(0xFFC3A6FF)
    val Moment7 = Color(0xFF7FE3D6)
    val Moment8 = Color(0xFFFF8A8A)
    val Moment9 = Color(0xFFD6E36B)
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
 * Hanken Grotesk's full height in Compose is about 1.69em, where a CSS `normal`
 * line is about 1.35em (13sp: 22dp against the boards' 17.6). This trims the
 * difference evenly off the first line's top and the last line's bottom.
 */
fun Modifier.sansLineBox(fontSize: TextUnit): Modifier =
    layout { measurable, constraints ->
        val placeable = measurable.measure(constraints)
        val trim = (0.169f * fontSize.toPx()).roundToInt()
        layout(placeable.width, (placeable.height - 2 * trim).coerceAtLeast(0)) {
            placeable.place(0, -trim)
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
    onPrimary = AdhxColors.OnAccent,
    secondary = AdhxColors.Cream,
    onSecondary = AdhxColors.OnCream,
    background = AdhxColors.Bg,
    onBackground = AdhxColors.Ink,
    surface = AdhxColors.Surface,
    onSurface = AdhxColors.Ink,
    surfaceVariant = AdhxColors.Raised,
    onSurfaceVariant = AdhxColors.InkSoft,
    surfaceContainerHigh = AdhxColors.Surface,
    outline = AdhxColors.Line,
    outlineVariant = AdhxColors.Hairline,
    error = AdhxColors.Warn,
    onError = AdhxColors.OnAccent,
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
