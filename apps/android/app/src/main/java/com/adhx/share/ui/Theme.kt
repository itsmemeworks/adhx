package com.adhx.share.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import com.adhx.share.R
import androidx.compose.ui.text.font.FontWeight
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
 * Headings are Instrument Serif, as on the web (bundled in res/font, with its
 * licence in assets/licenses); everything else is the system sans.
 */
val SerifFamily: FontFamily = FontFamily(Font(R.font.instrument_serif, FontWeight.Normal))

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

private val typography = Typography(
    displaySmall = TextStyle(fontFamily = SerifFamily, fontWeight = FontWeight.Normal, fontSize = 40.sp, lineHeight = 40.sp),
    headlineSmall = TextStyle(fontFamily = SerifFamily, fontWeight = FontWeight.Normal, fontSize = 30.sp, lineHeight = 32.sp),
    bodyLarge = TextStyle(fontSize = 15.sp, lineHeight = 22.sp),
    bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 20.sp),
    bodySmall = TextStyle(fontSize = 13.sp, lineHeight = 18.sp),
    labelLarge = TextStyle(fontSize = 15.sp, fontWeight = FontWeight.ExtraBold),
)

@Composable
fun AdhxTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = colors, typography = typography, content = content)
}
