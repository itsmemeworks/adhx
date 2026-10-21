package com.adhx.share.library

import androidx.compose.runtime.mutableStateListOf
import com.adhx.share.feed.Floating
import com.adhx.share.net.LiveReaction
import com.adhx.share.net.Saver

/** How many of a post's kept reactions float up when it comes on screen: the newest. */
internal const val REPLAY_MAX = 12

/** The first one floats this long after the post settles… */
internal const val REPLAY_START_MS = 600L

/** …and the rest this far apart. */
internal const val REPLAY_GAP_MS = 350L

/** "Couldn’t send that. Try again.": a reaction to a post that didn't go. */
internal const val POST_REACT_FAILED = "Couldn’t send that. Try again."

/** One kept reaction to float, and how long after the first one it goes. */
internal data class ReplayStep(val reaction: LiveReaction, val afterMs: Long)

/**
 * What to replay of a post's kept reactions: the newest [REPLAY_MAX], oldest
 * first (the server sends them oldest first; ones with the same time keep
 * their order), [REPLAY_GAP_MS] apart. Ones with nothing to show are left out.
 */
internal fun replayPlan(reactions: List<LiveReaction>): List<ReplayStep> =
    reactions
        .filter { !it.emoji.isNullOrBlank() || !it.text.isNullOrBlank() }
        .sortedBy { it.at.orEmpty() }
        .takeLast(REPLAY_MAX)
        .mapIndexed { i, r -> ReplayStep(r, i * REPLAY_GAP_MS) }

/** How long to wait before the first one, [sinceSettledMs] after the post settled (fetching takes a moment). */
internal fun replayWait(sinceSettledMs: Long): Long = (REPLAY_START_MS - sinceSettledMs).coerceAtLeast(0L)

/**
 * Which posts' reactions this run of the app has fetched and replayed, so a
 * post you come back to doesn't replay again (and isn't fetched again). Keyed
 * by the ADHX and account too, so another connection starts fresh.
 */
object PostReactionsMemory {
    private val fetched = HashMap<String, List<LiveReaction>>()
    private val replayed = HashSet<String>()

    fun key(server: String, username: String?, postKey: String): String = "$server|${username.orEmpty()}|$postKey"

    @Synchronized
    fun fetched(key: String): List<LiveReaction>? = fetched[key]

    @Synchronized
    fun remember(key: String, reactions: List<LiveReaction>) {
        // A few hundred posts' worth is plenty for one run.
        if (fetched.size > 500) fetched.clear()
        fetched[key] = reactions
    }

    @Synchronized
    fun replayed(key: String): Boolean = key in replayed

    /** True the first time: this post's reactions are being replayed now. */
    @Synchronized
    fun markReplayed(key: String): Boolean = replayed.add(key)

    @Synchronized
    internal fun forgetAll() {
        fetched.clear()
        replayed.clear()
    }
}

/**
 * The reactions floating over a post in the player (outside Live, which has
 * its own room): the kept ones replaying, and yours as you send it, taken back
 * with [remove] if it doesn't go.
 */
class PostFloats(private val max: Int = REPLAY_MAX + 4) {
    val items = mutableStateListOf<Floating>()
    private var next = 0L

    /** Floats one up (after [delayMs]); returns its id. */
    fun add(emoji: String?, text: String?, who: Saver?, delayMs: Long = 0): Long {
        if (items.size >= max) items.removeAt(0)
        next += 1
        // Spread them across: the golden ratio keeps neighbours apart.
        val lane = ((next * 0.618034) % 1.0).toFloat()
        items.add(Floating(next, emoji, text, who, lane, delayMs))
        return next
    }

    fun remove(id: Long) {
        items.removeAll { it.id == id }
    }

    fun clear() = items.clear()
}
