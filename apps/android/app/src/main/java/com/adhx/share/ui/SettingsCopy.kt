package com.adhx.share.ui

import com.adhx.share.net.DoingItem
import com.adhx.share.net.DoingStatus
import com.adhx.share.net.DoingSummary
import com.adhx.share.net.JoinRequest
import com.adhx.share.net.MediaType
import com.adhx.share.net.Person
import com.adhx.share.net.PersonRole
import java.time.Instant

/** The words of Settings, Your people and "On their way". */
object SettingsCopy {
    const val TITLE = "Settings"
    const val BACK = "Back to the feed"
    const val CHANGE_PICTURE = "Change picture"
    const val WAITING_FOR_YOU = "WAITING FOR YOU"
    const val NOT_NOW = "Not now"
    const val DECLINE = "Decline"
    const val DECISION_FAILED = "Couldn’t do that just now. Try again."
    const val YOUR_PEOPLE = "Your people"
    const val INVITE = "Invite someone"
    const val FEED = "What’s in your feed"
    const val PRIVATE_DEFAULT = "Just for me by default"
    const val PRIVATE_DEFAULT_NOTE = "New saves start private"
    const val PRIVATE_DEFAULT_UNSET = "New saves follow your ADHX’s setting"
    const val PRIVATE_DEFAULT_OFF = "New saves are shared with your people"
    const val SOUND_DEFAULT = "Sound on by default"
    const val DOING = "What your ADHX is doing"
    const val SHARED_LATELY = "Shared lately"
    const val SEND_WAITING = "Send waiting links now"
    const val REMOVE_PHONE = "Remove this phone"
    const val REMOVE_TITLE = "Remove this phone?"
    const val REMOVE_BODY = "This phone forgets its key, the list of shared posts and links still waiting. " +
        "To take it off your ADHX’s list of phones too, use Settings → Phone app there."
    const val REMOVE = "Remove"
    const val CANCEL = "Cancel"
    const val TAGLINE = "Your friends have better taste than the algorithm."
    const val PEOPLE_EMPTY = "Just you so far. Invite someone from Settings."
    const val PEOPLE_CANT_LOAD = "Your people didn’t load. Try again."
    const val PEOPLE_UNAVAILABLE = "This ADHX needs an update to show your people here."
    const val BANNED = "Banned"

    // On their way
    const val SEE_EVERYTHING = "See everything your ADHX is doing"
    const val ON_YOUR_SERVER = "All on your server. Nothing sent anywhere."
    const val RETRY = "Retry"
    const val RETRYING = "Trying again."
    const val ALREADY_ON_ITS_WAY = "It’s already on its way."
    const val DOING_EMPTY = "Nothing on its way. Everything’s ready."
    const val DOING_CANT_LOAD = "Couldn’t ask your ADHX just now. Try again."
    const val DOING_UNAVAILABLE = "This ADHX needs an update to show what it’s doing."
    const val READY = "Ready"
    const val PLAYS_NOW = "Plays now"
    const val COULDNT_KEEP = "Couldn’t keep it"
    const val YOUR_SAVE = "Your save"
    val DOING_FILTERS = listOf("On their way", "Needs you", "Ready")

    /** Under Shared lately: links waiting on this phone. */
    fun waitingLinks(count: Int): String? = when (count) {
        0 -> null
        1 -> "1 link is waiting for a connection"
        else -> "$count links are waiting for a connection"
    }

    /** After Send waiting links now. */
    fun sending(count: Int): String = when (count) {
        0 -> "Nothing is waiting."
        1 -> "Sending 1 link as soon as there’s a connection."
        else -> "Sending $count links as soon as there’s a connection."
    }

    /** "Ben wants in". */
    fun wantsIn(request: JoinRequest) = "${request.label} wants in"

    /** "Let Ben in". */
    fun letIn(request: JoinRequest) = "Let ${request.label} in"

    /** "Invited by Jo · 10 minutes ago". */
    fun requestLine(request: JoinRequest, now: Long = System.currentTimeMillis()): String =
        listOfNotNull(
            request.invitedBy?.let { "Invited by ${it.label}" },
            parseIso(request.askedAt)?.let { Copy.ago(it, now) },
        ).joinToString(" · ").ifEmpty { "Joined with an invite" }

    /** "@pete · 214 saves". */
    fun youLine(username: String?, saves: Int?): String =
        listOfNotNull(username?.takeIf { it.isNotBlank() }?.let { "@$it" }, saves?.let(Copy::saves)).joinToString(" · ")

    /** "@ana · 96 saves · Owner". */
    fun personLine(person: Person): String = listOfNotNull(
        "@${person.username}",
        Copy.saves(person.saves),
        roleLabel(person.role),
    ).joinToString(" · ")

    fun roleLabel(role: String): String? = when (role) {
        PersonRole.OWNER -> "Owner"
        PersonRole.ADMIN -> "Admin"
        else -> null
    }

    /** "Connected to Ana’s ADHX", or "your ADHX" when it's yours or the owner isn't known. */
    fun connectedTo(owner: Person?): String = when {
        owner == null || owner.isYou -> "Connected to your ADHX"
        else -> "Connected to ${possessive(owner.label)} ADHX"
    }

    fun possessive(label: String) = if (label.endsWith("s")) "$label’" else "$label’s"

    /** "Videos, photos" for the feed row. */
    fun feedTypes(types: Set<String>): String {
        val words = MediaType.all.filter { it in types }.map {
            when (it) {
                MediaType.VIDEO -> "videos"
                MediaType.PHOTO -> "photos"
                MediaType.TEXT -> "text"
                else -> "articles"
            }
        }
        return words.joinToString(", ").replaceFirstChar { it.uppercase() }
    }

    /** "3 on their way · 1 needs you", "Nothing on its way". */
    fun doingSummary(summary: DoingSummary?): String? {
        if (summary == null) return null
        if (summary.onTheirWay <= 0) return "Nothing on its way"
        val needs = summary.needsYou.takeIf { it > 0 }?.let(::needsYou)
        return listOfNotNull(onTheirWay(summary.onTheirWay), needs).joinToString(" · ")
    }

    /** "1 on its way" / "3 on their way". */
    fun onTheirWay(count: Int): String = if (count == 1) "1 on its way" else "$count on their way"

    fun needsYou(count: Int): String = if (count == 1) "1 needs you" else "$count need you"

    /**
     * A row's title: the post, or for a download that gave up, why
     * ("Private on Instagram"), which is what you'd act on.
     */
    fun doingTitle(item: DoingItem): String {
        val reason = item.reason?.trim()?.removeSuffix(".")?.takeIf { it.isNotEmpty() }
        if (item.needsYou && item.step <= 3 && reason != null) {
            return reason.removePrefix("It’s ").removePrefix("It's ").replaceFirstChar { it.uppercase() }
        }
        return item.title.ifBlank { item.network.ifBlank { "A post" } }
    }

    /**
     * The line under a row: "Keeping a copy · 62%", "Making it play
     * everywhere · Jo", "Plays now · listening to what’s said", "Couldn’t
     * keep it · Mum’s save", "Ready · 4K".
     */
    fun doingLine(item: DoingItem): String {
        val other = item.savers.firstOrNull { !it.isYou }?.label
        val percent = item.percent?.let { "${it.toInt().coerceIn(0, 100)}%" }
        val step = item.stepLabel.ifBlank { null }
        return when (item.status) {
            DoingStatus.NEEDS_YOU -> if (item.step <= 3) {
                listOf(COULDNT_KEEP, whose(item)).joinToString(" · ")
            } else {
                listOfNotNull(item.reason?.trim()?.removeSuffix("."), whose(item)).joinToString(" · ")
            }
            DoingStatus.WAITING -> listOfNotNull(
                step,
                item.reason?.trim()?.removeSuffix(".") ?: "waiting",
            ).joinToString(" · ")
            DoingStatus.READY -> listOfNotNull(READY, item.quality, other).joinToString(" · ")
            else -> if (item.playable && step != null) {
                listOfNotNull(PLAYS_NOW, step.replaceFirstChar { it.lowercase() }, percent).joinToString(" · ")
            } else {
                listOfNotNull(step, percent, other).joinToString(" · ")
            }
        }
    }

    /** "Your save", "Mum’s save". */
    fun whose(item: DoingItem): String {
        if (item.savers.isEmpty() || item.savers.any { it.isYou }) return YOUR_SAVE
        return "${possessive(item.savers.first().label)} save"
    }

    /** How far along the bar is, 0–1: the step's own percent when it says, else the step. */
    fun doingProgress(item: DoingItem): Float {
        if (item.ready) return 1f
        val steps = item.steps.coerceAtLeast(1)
        val step = item.step.coerceIn(1, steps)
        val within = item.percent?.toFloat()?.div(100f)?.coerceIn(0f, 1f)
        return if (within != null && item.step <= 2) within else ((step - 1) + (within ?: 0.5f)) / steps
    }

    private fun parseIso(text: String?): Long? = try {
        text?.let { Instant.parse(it).toEpochMilli() }
    } catch (e: Exception) {
        null
    }
}
