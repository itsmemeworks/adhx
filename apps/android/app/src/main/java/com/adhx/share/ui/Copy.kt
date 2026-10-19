package com.adhx.share.ui

import androidx.compose.ui.graphics.Color
import com.adhx.share.data.HistoryItem
import com.adhx.share.data.ShareState
import com.adhx.share.net.KeepStatus
import com.adhx.share.net.StatusResponse
import java.time.Instant
import java.util.concurrent.TimeUnit

/** The words the app shows, in one place. */
object Copy {
    const val SAVING = "Saving to your ADHX…"
    const val SAVING_NOTE = "You can close this. It carries on, and the post is in My saves as soon as it lands."
    const val SAVED = "Saved to your ADHX"
    const val ALREADY = "Already in your saves"
    const val NOT_A_POST_TITLE = "That’s not one post"
    const val NOT_A_POST_BODY = "ADHX keeps single posts. Open the post itself (a Reel, a photo, a video) and share that."
    const val OFFLINE_TITLE = "Saved for later"
    const val OFFLINE_BODY = "Your ADHX can’t be reached right now. This goes as soon as it can."
    const val NOT_CONNECTED_TITLE = "Connect the app first"
    const val NOT_CONNECTED_BODY = "Open ADHX Share and scan the code in Settings → Phone app on your ADHX."
    const val FAILED_TITLE = "Couldn’t save this"
    const val FAILED_BODY = "Something went wrong on your ADHX. Try again in a moment."
    const val GONE = "The post is gone, private or can’t be read."
    const val GAVE_UP = "Couldn’t reach your ADHX"

    /** Words for a save the server turned down. */
    fun shareError(status: Int, code: String?, message: String?): String = when {
        status == 401 || code == "bad_key" -> NOT_CONNECTED_TITLE
        status == 422 || code == "not_a_post" || code == "no_link" -> NOT_A_POST_TITLE
        !message.isNullOrBlank() -> message
        status == 404 || code == "unavailable" -> GONE
        else -> FAILED_TITLE
    }

    /** "Keeping a copy · 720p · 60%", "Kept a copy · 4K"… for the share sheet. */
    fun keepLine(status: StatusResponse?): String? {
        if (status == null) return "Keeping a copy"
        return when (status.status) {
            KeepStatus.WAITING, KeepStatus.KEEPING ->
                listOfNotNull("Keeping a copy", status.quality, status.percent?.let { "$it%" }).joinToString(" · ")
            KeepStatus.RETRYING -> "Keeping a copy · trying again"
            KeepStatus.KEPT -> listOfNotNull("Kept a copy", status.quality).joinToString(" · ")
            KeepStatus.UNAVAILABLE -> "Couldn’t keep a copy"
            else -> null
        }
    }

    /** "Saved 3 days ago · kept in 4K" for a post that was already saved. */
    fun alreadyLine(savedAt: String?, status: StatusResponse?, now: Long = System.currentTimeMillis()): String {
        val whenSaved = parseIso(savedAt)?.let { "Saved ${ago(it, now)}" } ?: "Saved before"
        val keep = when (status?.status) {
            KeepStatus.KEPT -> status?.quality?.let { "kept in $it" } ?: "kept"
            KeepStatus.WAITING, KeepStatus.KEEPING, KeepStatus.RETRYING -> "keeping a copy"
            KeepStatus.UNAVAILABLE -> "couldn’t keep a copy"
            else -> null
        }
        return listOfNotNull(whenSaved, keep).joinToString(" · ")
    }

    /** The status line under a share in "Shared lately", and its colour. */
    fun historyLine(item: HistoryItem): Pair<String, Color> = when (item.state) {
        ShareState.SAVING -> "Saving…" to AdhxColors.Accent
        ShareState.QUEUED -> "Waiting for a connection" to AdhxColors.Accent
        ShareState.FAILED -> (item.error ?: FAILED_TITLE) to AdhxColors.Warn
        else -> when (item.keep) {
            KeepStatus.KEEPING, KeepStatus.WAITING, null ->
                (item.percent?.let { "Keeping a copy · $it%" } ?: "Keeping a copy") to AdhxColors.Accent
            KeepStatus.RETRYING -> "Keeping a copy · trying again" to AdhxColors.Accent
            // A post with only words has no files to keep: it's simply saved.
            KeepStatus.KEPT -> (keptWhat(item)?.let { "Kept · $it" } ?: "Saved") to AdhxColors.Muted
            KeepStatus.UNAVAILABLE -> "Couldn’t keep a copy" to AdhxColors.Warn
            KeepStatus.NOT_SAVED -> "Not in your saves any more" to AdhxColors.Faint
            else -> "Saved" to AdhxColors.Muted
        }
    }

    private fun keptWhat(item: HistoryItem): String? = when {
        item.quality != null -> "${item.quality} video"
        item.videos > 1 -> "${item.videos} videos"
        item.videos == 1 -> "video"
        item.photos > 1 -> "${item.photos} photos"
        item.photos == 1 -> "photo"
        item.audio > 0 -> "audio"
        else -> null
    }

    /** The title of a share: the author, or else the post's words, or else the link. */
    fun historyTitle(item: HistoryItem): String =
        handle(item.author) ?: item.authorName?.takeIf { it.isNotBlank() }
            ?: item.text?.takeIf { it.isNotBlank() }?.lineSequence()?.first()
            ?: com.adhx.share.links.Links.display(item.link)

    fun handle(author: String?): String? =
        author?.trim()?.takeIf { it.isNotEmpty() }?.let { if (it.startsWith("@")) it else "@$it" }

    /** "now", "2m", "1h", "3d", "2w", "1y" for the list. */
    fun shortAgo(millis: Long, now: Long = System.currentTimeMillis()): String {
        val seconds = TimeUnit.MILLISECONDS.toSeconds((now - millis).coerceAtLeast(0))
        return when {
            seconds < 60 -> "now"
            seconds < 3600 -> "${seconds / 60}m"
            seconds < 86_400 -> "${seconds / 3600}h"
            seconds < 7 * 86_400 -> "${seconds / 86_400}d"
            seconds < 365 * 86_400 -> "${seconds / (7 * 86_400)}w"
            else -> "${seconds / (365 * 86_400)}y"
        }
    }

    /** "just now", "5 minutes ago", "yesterday", "3 days ago"… */
    fun ago(millis: Long, now: Long = System.currentTimeMillis()): String {
        val seconds = TimeUnit.MILLISECONDS.toSeconds((now - millis).coerceAtLeast(0))
        val minutes = seconds / 60
        val hours = minutes / 60
        val days = hours / 24
        return when {
            minutes < 1 -> "just now"
            minutes < 60 -> plural(minutes, "a minute", "minutes") + " ago"
            hours < 24 -> plural(hours, "an hour", "hours") + " ago"
            days < 2 -> "yesterday"
            days < 7 -> "$days days ago"
            days < 30 -> plural(days / 7, "a week", "weeks") + " ago"
            days < 365 -> plural(days / 30, "a month", "months") + " ago"
            else -> plural(days / 365, "a year", "years") + " ago"
        }
    }

    private fun plural(n: Long, one: String, many: String) = if (n == 1L) one else "$n $many"

    private fun parseIso(text: String?): Long? = try {
        text?.let { Instant.parse(it).toEpochMilli() }
    } catch (e: Exception) {
        null
    }
}
