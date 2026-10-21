package com.adhx.share.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withLink
import com.adhx.share.links.Links

/** How a link reads in a post's words: yellow and a little bolder. */
private val LinkStyle = SpanStyle(color = AdhxColors.Accent, fontWeight = FontWeight.SemiBold)

/**
 * A post's words with every http(s) link shortened to its site and path
 * ("youtube.com/watch") and tappable: a tap opens it in the browser.
 */
@Composable
fun rememberLinked(text: String): AnnotatedString {
    val context = LocalContext.current
    return remember(text) { linked(text) { openUrl(context, it) } }
}

/** [text] with its links shortened and wired to [open]. */
fun linked(text: String, open: (String) -> Unit): AnnotatedString = buildAnnotatedString {
    var at = 0
    for (span in Links.spans(text)) {
        append(text, at, span.start)
        withLink(LinkAnnotation.Clickable(span.url, TextLinkStyles(LinkStyle)) { open(span.url) }) {
            append(Links.short(span.url))
        }
        at = span.end
    }
    append(text, at, text.length)
}
