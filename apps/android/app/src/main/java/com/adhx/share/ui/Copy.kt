package com.adhx.share.ui

import androidx.compose.ui.graphics.Color
import com.adhx.share.data.HistoryItem
import com.adhx.share.data.ShareState
import com.adhx.share.net.KeepStatus
import com.adhx.share.net.Saver
import com.adhx.share.net.StatusResponse
import java.time.Instant
import java.util.concurrent.TimeUnit

/** The words the app shows, in one place. */
object Copy {
    const val SAVING = "Saving to your ADHX…"
    const val SAVING_NOTE = "You can close this. Your ADHX carries on, and the post shows up in My saves once it’s ready."
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

    // Saved for your people, or just for you (the share card and More).

    const val SAVED_SHARED = "Saved for your people"
    const val SAVED_PRIVATE = "Saved, just for you"
    const val JUST_FOR_ME = "Just for me"
    const val JUST_FOR_ME_OFF = "Keep it private. Still kept, still searchable."
    const val JUST_FOR_ME_ON = "Your people won’t see this save"
    const val SHARED_STATE = "Shared with your people"
    const val PRIVATE_NOTE = "Only you will see this save. It’s still kept and searchable."
    const val PRIVATE_LABEL = "Just for you"
    const val NOW_PRIVATE = "Just for you now"
    const val NOW_SHARED = "Your people can see it again"
    const val PRIVATE_FAILED = "Couldn’t change that just now. Try again."
    const val NOT_YOURS = "That one isn’t in your saves."
    const val PRIVATE_LATER = "Saved for later, just for you"

    /** "Ana, Ben, Mum and Jo will see it", or "Your people will see it" when we don't know who. */
    fun willSee(names: List<String>): String =
        if (names.isEmpty()) "Your people will see it" else "${list(names, max = 4)} will see it"

    // Home: New · Channels · Live

    const val TAB_NEW = "New"
    const val TAB_CHANNELS = "Channels"
    const val TAB_LIVE = "Live"
    val TABS = listOf(TAB_NEW, TAB_CHANNELS, TAB_LIVE)

    const val CAUGHT_UP = "You’re all caught up."
    const val TOUCH_GRASS = "Go touch grass."
    const val CAUGHT_UP_NOTE = "That’s everything your people saved since you last looked."
    const val END_TITLE = "That’s the lot."
    const val END_NOTE = "You’ve seen the whole pile. It’ll be here when you’re back."
    const val NOTHING_YET_TITLE = "Nothing new yet."
    const val NOTHING_YET_NOTE = "Save something for your people to find."
    const val NOTHING_NEW_NOTE = "Nothing new since you last looked. Your people must be outside."
    const val BROWSE_CHANNELS = "Browse channels"
    const val SEE_LIVE = "See what’s live"
    const val WATCH_AGAIN = "Watch it all again"
    const val FEED_CANT_LOAD = "The feed didn’t load. Try again."

    /** "12 from Ana, Ben and Mum today" on the caught-up card. */
    fun watchedSummary(count: Int, names: List<String>): String {
        val what = if (count == 1) "1 save" else "$count saves"
        return if (names.isEmpty()) "$what today" else "$count from ${list(names, max = 3)} today"
    }

    /**
     * The badge on the New tab: how many unseen posts are left. [more] when
     * another page may bring more ("19+"). Capped at "99+"; null when there's
     * nothing to count.
     */
    fun newBadge(left: Int, more: Boolean): String? = when {
        left > 99 -> "99+"
        left <= 0 && !more -> null
        more -> "$left+"
        else -> left.toString()
    }

    /** "New, 7 left" for a screen reader. */
    fun newTabDescription(badge: String?): String = when {
        badge == null -> TAB_NEW
        badge.endsWith("+") -> "$TAB_NEW, ${badge.dropLast(1)} or more left"
        else -> "$TAB_NEW, $badge left"
    }

    const val OPEN_SETTINGS = "Settings"
    const val SEARCH = "Search everyone’s saves"

    // What's in your feed (the media filter)

    const val FILTER = "Filter"
    const val FILTER_TITLE = "What’s in your feed"
    const val FILTER_NOTE = "Videos and photos to start with. Words are one switch away."
    const val KEEP_ONE = "Keep at least one on."
    const val DONE = "Done"
    const val SHOW_THEM = "Show them"
    val TYPE_LABELS = mapOf(
        "video" to ("Videos" to "Reels, clips and tracks with sound"),
        "photo" to ("Photos" to "Single shots, albums and memes"),
        "text" to ("Text posts" to "Threads, tweets and hot takes"),
        "article" to ("Articles" to "Long reads, for when you’ve got time"),
    )

    /** "Show videos and photos": the filter's button, naming what will play. */
    fun showKinds(types: Set<String>): String {
        val names = com.adhx.share.net.MediaType.all.filter { it in types }.map { TYPE_LABELS[it]?.first?.lowercase() ?: it }
        return if (names.isEmpty()) DONE else "Show ${list(names, max = 4)}"
    }

    /** "12 text posts and 3 articles are waiting. They’ll still be in search and channels." */
    fun waitingNote(hidden: Map<String, Int>): String? =
        hiddenLine(hidden)?.removeSuffix(" waiting")?.let { "$it ${if (hidden.values.sum() == 1) "is" else "are"} waiting. They’ll still be in search and channels." }

    /** "4 text posts waiting", "4 text posts and 1 article waiting". */
    fun hiddenLine(hidden: Map<String, Int>): String? {
        val parts = com.adhx.share.net.MediaType.all.mapNotNull { t ->
            val n = hidden[t] ?: return@mapNotNull null
            val (one, many) = when (t) {
                "video" -> "video" to "videos"
                "photo" -> "photo" to "photos"
                "article" -> "article" to "articles"
                else -> "text post" to "text posts"
            }
            if (n == 1) "1 $one" else "$n $many"
        }
        return if (parts.isEmpty()) null else "${list(parts, max = 4)} waiting"
    }

    const val SEE_ALL = "See all"
    const val INVITE = "Invite"

    /** "3 new" on a channel's covers. */
    fun newCount(n: Int): String = if (n > 99) "99+ new" else "$n new"

    const val WHY_TOGETHER = "Saved together"
    const val WHY_CLOSE = "Close to you"
    const val WHY_TITLE = "Why this one"
    const val WHOSE_SAVES = "Whose saves"
    const val WHY_NOTE = "No engagement bait. These are the only reasons."
    const val WHY_NONE = "It’s new to you. That’s the whole reason."
    val WHOSE = listOf("Everyone", "Friends only", "Mine")

    // Channels

    const val FROM_EVERYONE = "From everyone"
    const val FROM_EVERYONE_NOTE = "Rabbit holes, dug by your friends"
    const val YOUR_PEOPLE = "Your people"
    const val MADE_FOR_YOU = "Made for you"
    const val MADE_FOR_YOU_NOTE = "Built from what you keep. No ad tech consulted."
    const val MY_SAVES = "My saves"
    const val MY_SAVES_NOTE = "Everything you kept, newest first"
    const val CHANNELS_EMPTY = "No channels yet. They grow out of what your people save."
    const val CHANNELS_CANT_LOAD = "Channels didn’t load. Try again."
    const val CHANNEL_EMPTY = "Nothing in here yet."
    const val PLAY = "Play"

    fun saves(n: Int) = if (n == 1) "1 save" else "$n saves"

    /** "Ana's saves" */
    fun friendsSaves(label: String) = if (label.endsWith("s")) "$label’ saves" else "$label’s saves"

    /** "96 saves · 4 you haven't seen" */
    fun friendLine(size: Int, newCount: Int): String =
        listOfNotNull(saves(size), newCount.takeIf { it > 0 }?.let { "$it you haven’t seen" }).joinToString(" · ")

    /** "38 saves · 3 of you", "41 saves · Mum and you" */
    fun groupLine(size: Int, savers: List<Saver>): String {
        val who = when {
            savers.isEmpty() -> null
            savers.size > 2 -> "${savers.size} of you"
            else -> names(savers)
        }
        return listOfNotNull(saves(size), who).joinToString(" · ")
    }

    /** "Ana's saves, 4 new" for a screen reader. */
    fun friendDescription(label: String, newCount: Int): String =
        friendsSaves(label) + if (newCount > 0) ", $newCount new" else ""

    fun openChannelOf(saver: Saver): String = if (saver.isYou) "Open my saves" else "Open ${friendsSaves(saver.label)}"

    // Live

    const val LIVE_BADGE = "LIVE"
    const val TUNE_IN = "Tune in"
    const val LIVE_EMPTY_TITLE = "Nothing’s live right now."
    const val LIVE_EMPTY_NOTE = "When a few of you save the same kind of thing at once, it shows up here."
    const val LIVE_CANT_LOAD = "Live didn’t load. Try again."
    const val LIVE_ENDED = "This one’s gone quiet."
    const val NEW_UP_NEXT = "A new one, up next"
    const val UP_NEXT = "up next"
    const val LEAVE_LIVE = "Leave live"

    /** "Jo just saved one" (or "You just saved one"). */
    fun justSavedOne(saver: Saver): String = "${if (saver.isYou) "You" else saver.label} just saved one"

    /** "What your lot are into tonight" (or today). */
    fun liveTitle(hour: Int): String = if (hour >= 17 || hour < 4) "What your lot are into tonight" else "What your lot are into today"

    /** "3 of you watching", or nothing when nobody is. */
    fun watching(count: Int): String? = when {
        count <= 0 -> null
        count == 1 -> "1 of you watching"
        else -> "$count of you watching"
    }

    /** "Ana and Ben are watching with you", "Just you, for now". */
    fun watchersLine(watchers: List<Saver>, count: Int = watchers.size): String {
        val others = watchers.filterNot { it.isYou }
        return when {
            others.isEmpty() && count <= 1 -> "Just you, for now"
            others.isEmpty() -> "${count - 1} more watching with you"
            others.size == 1 -> "${others[0].label} is watching with you"
            else -> "${names(others)} are watching with you"
        }
    }

    /** What the chip shows: "watching with you"; the names go to screen readers ([watchersLine]). */
    fun watchersShort(watchers: List<Saver>, count: Int = watchers.size): String {
        val others = watchers.count { !it.isYou }
        return when {
            others == 0 && count <= 1 -> "Just you, for now"
            others == 0 -> "${count - 1} watching with you"
            else -> "watching with you"
        }
    }

    /** "3 saves · Ana, Ben and Jo" under a moment. */
    fun momentLine(posts: Int?, people: Int, savers: List<Saver>): String {
        val what = posts?.takeIf { it > 0 }?.let(::saves)
        val who = if (savers.isNotEmpty()) names(savers, max = 3) else if (people > 0) "$people of you" else null
        return listOfNotNull(what, who).joinToString(" · ")
    }

    const val YOU = "You"
    const val REACT = "React"
    const val CLOSE_REACT = "Close reactions"
    const val QUICK_REACTIONS = "Quick reactions"
    const val SAY_SOMETHING = "Say something to everyone watching"
    const val SEND = "Send"
    const val REACT_FAILED = "That reaction didn’t send. Try again."
    const val FLOATING_LABEL = "Reactions from people watching"

    /** "Ana: fire", "Jo said: who sent this", for a screen reader. */
    fun reactionDescription(who: String?, emoji: String?, text: String?): String {
        val name = who ?: "Someone"
        return when {
            text != null -> "$name said: $text"
            else -> "$name: ${com.adhx.share.net.Reaction.names[emoji] ?: emoji.orEmpty()}"
        }
    }

    /** "12 of 40" under the field, once you're typing. */
    fun charsLeft(used: Int): String = "$used/${com.adhx.share.net.Reaction.MAX_TEXT}"

    // Saver faces

    /** "Ana and Ben saved this", "Ana and 3 others saved this", "You saved this". */
    fun saversLine(savers: List<Saver>): String? {
        if (savers.isEmpty()) return null
        return "${names(savers)} saved this"
    }

    /** A post's words as one run for the byline: paragraphs joined by a full stop when they lack one. */
    fun oneLine(text: String): String =
        text.trim().split(Regex("\\s*\\n+\\s*")).filter { it.isNotBlank() }.reduceOrNull { acc, next ->
            if (acc.last() in ".!?…:;,") "$acc $next" else "$acc. $next"
        } ?: ""

    /** The note to show on the byline: a friend's first (yours when only you left one), trimmed. */
    fun noteOf(savers: List<Saver>): Pair<Saver, String>? {
        val withNotes = savers.mapNotNull { s -> s.note?.trim()?.takeIf { it.isNotEmpty() }?.let { s to it.take(NOTE_MAX) } }
        return withNotes.firstOrNull { !it.first.isYou } ?: withNotes.firstOrNull()
    }

    /** What a screen reader hears for a note: "Ben's note: you're welcome". */
    fun noteDescription(saver: Saver, note: String): String =
        "${if (saver.isYou) "Your" else "${saver.label}’s"} note: $note"

    /** Notes on saves are at most this long. */
    const val NOTE_MAX = 140

    /** "Ana", "Ana and Ben", "Ana and 3 others", with your own save as "you". */
    fun names(savers: List<Saver>, max: Int = 2): String {
        val labels = savers.mapIndexed { i, s -> if (s.isYou) (if (i == 0) "You" else "you") else s.label }
        return if (labels.size > max) {
            val rest = labels.size - (max - 1)
            labels.take(max - 1).joinToString(", ") + " and $rest others"
        } else {
            list(labels, max)
        }
    }

    /** "A", "A and B", "A, B and C"; past [max] it's "A, B and 3 others". */
    fun list(labels: List<String>, max: Int = 3): String = when {
        labels.isEmpty() -> ""
        labels.size == 1 -> labels[0]
        labels.size <= max -> labels.dropLast(1).joinToString(", ") + " and " + labels.last()
        else -> labels.take(max - 1).joinToString(", ") + " and ${labels.size - (max - 1)} others"
    }

    // Search

    const val SCOPE_EVERYONE = "Everyone’s saves"
    const val SCOPE_MINE = "Mine"
    const val NO_RESULTS_EVERYONE = "Nothing anyone here saved matches that yet. Try describing it another way."

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

    /** [shortAgo] for an ISO time from the server, or null when there isn't one. */
    fun shortAgoIso(iso: String?, now: Long = System.currentTimeMillis()): String? = parseIso(iso)?.let { shortAgo(it, now) }

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
