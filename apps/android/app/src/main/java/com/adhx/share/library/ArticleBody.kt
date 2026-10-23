package com.adhx.share.library

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.adhx.share.net.Entities
import com.adhx.share.ui.AdhxColors
import com.adhx.share.ui.SerifFamily
import com.adhx.share.ui.openUrl

/**
 * A kept X article's whole body (`article.body`), read from the markdown the
 * server makes of it (`articleBlocksToMarkdown`): blocks a blank line apart,
 * `#`–`###` headings, `- ` and `1. ` lists, `> ` quotes, `---` rules and
 * `![](img)` pictures (left out here); inside them `**bold**`, `*italic*` and
 * `[text](url)` links. HTML entities are decoded.
 */
object ArticleBody {
    sealed interface Block
    data class Heading(val level: Int, val runs: List<Run>) : Block
    data class Paragraph(val runs: List<Run>) : Block
    data class Bullet(val runs: List<Run>) : Block
    data class Numbered(val number: Int, val runs: List<Run>) : Block
    data class Quote(val runs: List<Run>) : Block
    data object Rule : Block

    /** A stretch of words with one look: bold, italic, and where it links to. */
    data class Run(val text: String, val bold: Boolean = false, val italic: Boolean = false, val url: String? = null)

    private val IMAGE = Regex("""^!\[[^\]]*]\([^)]*\)$""")
    private val NUMBERED = Regex("""^(\d{1,4})\.\s+(.*)$""", RegexOption.DOT_MATCHES_ALL)
    private val RULE = Regex("""^(-{3,}|\*{3,}|_{3,})$""")

    fun parse(markdown: String?): List<Block> {
        if (markdown.isNullOrBlank()) return emptyList()
        val blocks = mutableListOf<Block>()
        var number = 0
        // Blocks are a blank line apart; a list written line by line is one item a line.
        val chunks = markdown.replace("\r\n", "\n").split(Regex("\n\\s*\n")).flatMap { raw ->
            val lines = raw.trim().lines().filter { it.isNotBlank() }
            val listed = lines.size > 1 && (lines.all { it.startsWith("- ") || it.startsWith("* ") } || lines.all { NUMBERED.matches(it) })
            if (listed) lines else listOf(raw)
        }
        for (raw in chunks) {
            val chunk = raw.trim()
            if (chunk.isEmpty()) continue
            val numbered = NUMBERED.find(chunk)
            if (numbered == null) number = 0
            val block: Block? = when {
                RULE.matches(chunk) -> Rule
                IMAGE.matches(chunk) -> null
                chunk.startsWith("### ") -> Heading(3, inline(chunk.removePrefix("### ")))
                chunk.startsWith("## ") -> Heading(2, inline(chunk.removePrefix("## ")))
                chunk.startsWith("# ") -> Heading(1, inline(chunk.removePrefix("# ")))
                chunk.startsWith(">") -> Quote(inline(chunk.lines().joinToString("\n") { it.removePrefix(">").removePrefix(" ") }))
                chunk.startsWith("- ") || chunk.startsWith("* ") -> Bullet(inline(chunk.drop(2)))
                numbered != null -> {
                    // The server numbers every item "1."; count them here.
                    number += 1
                    Numbered(number, inline(numbered.groupValues[2]))
                }
                else -> Paragraph(inline(chunk))
            }
            if (block != null && (block !is Paragraph || block.runs.any { it.text.isNotBlank() })) blocks += block
        }
        return blocks
    }

    /** `**bold**`, `*italic*`, `***both***` and `[text](url)`; anything unclosed stays as it is. */
    fun inline(text: String, bold: Boolean = false, italic: Boolean = false, url: String? = null): List<Run> {
        val runs = mutableListOf<Run>()
        val plain = StringBuilder()
        fun flush() {
            if (plain.isNotEmpty()) runs += Run(Entities.decode(plain.toString()), bold, italic, url)
            plain.clear()
        }
        var i = 0
        while (i < text.length) {
            val c = text[i]
            if (c == '[' && url == null) {
                val close = text.indexOf("](", i + 1)
                val end = if (close > 0) text.indexOf(')', close + 2) else -1
                val href = if (end > 0) text.substring(close + 2, end).trim() else ""
                if (close > 0 && end > 0 && (href.startsWith("http://") || href.startsWith("https://"))) {
                    flush()
                    runs += inline(text.substring(i + 1, close), bold, italic, href)
                    i = end + 1
                    continue
                }
            }
            if (c == '*') {
                val marker = when {
                    text.startsWith("***", i) -> "***"
                    text.startsWith("**", i) -> "**"
                    else -> "*"
                }
                val close = text.indexOf(marker, i + marker.length)
                if (close > i + marker.length) {
                    flush()
                    val inner = text.substring(i + marker.length, close)
                    runs += inline(inner, bold || marker.length >= 2, italic || marker.length != 2, url)
                    i = close + marker.length
                    continue
                }
            }
            plain.append(c)
            i += 1
        }
        flush()
        return runs
    }

    /** The words alone, for a screen reader or a quick look. */
    fun plain(runs: List<Run>): String = runs.joinToString("") { it.text }
}

/** [runs] as styled words, with links that open in the browser. */
@Composable
private fun rememberRuns(runs: List<ArticleBody.Run>): AnnotatedString {
    val context = LocalContext.current
    return remember(runs) {
        buildAnnotatedString {
            for (run in runs) {
                val style = SpanStyle(
                    fontWeight = if (run.bold) FontWeight.Bold else null,
                    fontStyle = if (run.italic) FontStyle.Italic else null,
                )
                if (run.url != null) {
                    val link = LinkAnnotation.Clickable(run.url, TextLinkStyles(style.merge(SpanStyle(color = AdhxColors.Accent)))) { openUrl(context, run.url) }
                    withLink(link) { append(run.text) }
                } else {
                    withStyle(style) { append(run.text) }
                }
            }
        }
    }
}

/**
 * The article's body, block by block: headings bigger, lists with their
 * marks, quotes with a bar. [size] is the paragraphs' type.
 */
@Composable
fun ArticleBodyText(blocks: List<ArticleBody.Block>, size: TextUnit = 22.sp, lineHeight: TextUnit = 32.sp, color: androidx.compose.ui.graphics.Color = AdhxColors.Ink) {
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        for (block in blocks) {
            when (block) {
                is ArticleBody.Heading -> {
                    val (s, l) = when (block.level) {
                        1 -> size * 1.45f to lineHeight * 1.3f
                        2 -> size * 1.25f to lineHeight * 1.15f
                        else -> size * 1.1f to lineHeight * 1.05f
                    }
                    Text(
                        rememberRuns(block.runs),
                        fontFamily = SerifFamily,
                        fontSize = s,
                        lineHeight = l,
                        color = AdhxColors.Ink,
                        modifier = Modifier.padding(top = 6.dp).semantics { heading() },
                    )
                }
                is ArticleBody.Paragraph -> Text(rememberRuns(block.runs), fontFamily = SerifFamily, fontSize = size, lineHeight = lineHeight, color = color)
                is ArticleBody.Bullet -> Marked("•", block.runs, size, lineHeight, color)
                is ArticleBody.Numbered -> Marked("${block.number}.", block.runs, size, lineHeight, color)
                is ArticleBody.Quote -> Row(Modifier.height(IntrinsicSize.Min)) {
                    Box(Modifier.width(3.dp).fillMaxHeight().background(AdhxColors.Accent))
                    Spacer(Modifier.width(12.dp))
                    Text(rememberRuns(block.runs), fontFamily = SerifFamily, fontStyle = FontStyle.Italic, fontSize = size, lineHeight = lineHeight, color = AdhxColors.InkSoft)
                }
                ArticleBody.Rule -> Box(Modifier.fillMaxWidth().padding(vertical = 6.dp).height(1.dp).background(AdhxColors.Hairline))
            }
        }
    }
}

@Composable
private fun Marked(mark: String, runs: List<ArticleBody.Run>, size: TextUnit, lineHeight: TextUnit, color: androidx.compose.ui.graphics.Color) {
    Row {
        Text(mark, fontFamily = SerifFamily, fontSize = size, lineHeight = lineHeight, color = AdhxColors.Accent, modifier = Modifier.width((size.value * 1.3f).dp))
        Text(rememberRuns(runs), fontFamily = SerifFamily, fontSize = size, lineHeight = lineHeight, color = color, modifier = Modifier.weight(1f))
    }
}
