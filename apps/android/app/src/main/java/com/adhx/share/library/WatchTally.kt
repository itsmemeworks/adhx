package com.adhx.share.library

import kotlinx.serialization.Serializable

/** One post's plays, finishes and seconds (with fractions) not sent yet. */
@Serializable
data class WatchTally(val plays: Int = 0, val finishes: Int = 0, val seconds: Double = 0.0)

/** A post's tally on its way to `POST /api/app/watched` (whole seconds). */
data class WatchSent(val platform: String, val id: String, val plays: Int, val finishes: Int, val seconds: Int) {
    val key: String get() = "$platform:$id"
}

/**
 * Counting how a video is watched (pure: no clock, no storage, no network).
 * Same rules as the web (`src/lib/watch/tally.ts`) and the iPhone (`WatchTally.swift`):
 *
 * - A **play** is a pass that starts at the top (or a loop round) and then
 *   really plays for a second (half the video when it's shorter). Picking up
 *   part-way, or scrubbing back, isn't a new play.
 * - A **finish** is reaching the end, once per pass; Repeat's loop wrapping
 *   from the end to the top counts one too.
 * - **Seconds** are the position's forward steps while it plays, each at
 *   most [MAX_STEP] (a seek or a jump isn't watching).
 */
class WatchTracker {
    private class Pass(val fromTop: Boolean = false) {
        var counted = false
        var watched = 0.0
        var finished = false
    }

    var key: String? = null
        private set
    private var last: Double? = null
    private var pass = Pass()

    /** Not sent yet, by post (`platform:id`). */
    val tallies = LinkedHashMap<String, WatchTally>()

    /**
     * A post is on screen (null: nothing playing). Its first sample says where
     * it starts, unless [at] (seconds) says so first: picking up part-way.
     */
    fun begin(key: String?, at: Double? = null) {
        this.key = key
        last = at
        pass = Pass(fromTop = at != null && at < START)
    }

    /** Where the video is now, and how long it is (0 when unknown), in seconds. */
    fun sample(position: Double, duration: Double) {
        val key = key ?: return
        if (!position.isFinite() || position < 0) return
        val before = last
        last = position
        if (before == null) {
            pass = Pass(fromTop = position < START)
            return
        }
        val step = position - before
        if (step > 0 && step <= MAX_STEP) {
            add(key) { it.copy(seconds = it.seconds + step) }
            pass.watched += step
            val needed = if (duration > 0) minOf(PLAY_AFTER, duration / 2) else PLAY_AFTER
            if (pass.fromTop && !pass.counted && pass.watched >= needed) {
                pass.counted = true
                add(key) { it.copy(plays = it.plays + 1) }
            }
            return
        }
        val wrapped = step < 0 && position < START &&
            (pass.finished || (duration > 0 && before >= duration - END))
        if (wrapped) {
            if (!pass.finished) add(key) { it.copy(finishes = it.finishes + 1) }
            pass = Pass(fromTop = true)
        }
    }

    /** It played to the end. A replay from the top starts the next pass. */
    fun ended() {
        val key = key ?: return
        if (pass.finished) return
        pass.finished = true
        add(key) { it.copy(finishes = it.finishes + 1) }
    }

    /** What's ready to send (at most [max] posts), in whole seconds; the fractions stay behind. */
    fun takeBatch(max: Int = MAX_BATCH): List<WatchSent> {
        val out = ArrayList<WatchSent>()
        for (key in tallies.keys.toList()) {
            if (out.size >= max) break
            val t = tallies[key] ?: continue
            val whole = t.seconds.toInt()
            if (t.plays == 0 && t.finishes == 0 && whole == 0) continue
            val colon = key.indexOf(':')
            if (colon <= 0) {
                tallies.remove(key)
                continue
            }
            out.add(WatchSent(key.substring(0, colon), key.substring(colon + 1), t.plays, t.finishes, whole))
            val rest = t.seconds - whole
            if (rest > 0) tallies[key] = WatchTally(seconds = rest) else tallies.remove(key)
        }
        return out
    }

    /** A batch didn't get through: add it back. */
    fun putBack(batch: List<WatchSent>) {
        for (sent in batch) {
            add(sent.key) {
                WatchTally(it.plays + sent.plays, it.finishes + sent.finishes, it.seconds + sent.seconds)
            }
        }
    }

    private inline fun add(key: String, change: (WatchTally) -> WatchTally) {
        tallies[key] = change(tallies[key] ?: WatchTally())
    }

    companion object {
        const val PLAY_AFTER = 1.0
        /** Within this of the top counts as starting there. */
        const val START = 1.5
        /** Within this of the end, a jump back to the top is a loop. */
        const val END = 1.5
        const val MAX_STEP = 2.0
        /** The server takes at most 50 a time. */
        const val MAX_BATCH = 50
    }
}
