package com.adhx.share.library

import android.content.Context
import com.adhx.share.data.ConnectionStore
import com.adhx.share.feed.FeedViewModel
import com.adhx.share.net.AdhxApi
import com.adhx.share.net.ApiResult
import com.adhx.share.net.WatchedPost
import kotlinx.coroutines.Job
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.security.MessageDigest

/**
 * Watch counts on the way to your ADHX (`POST /api/app/watched`): the player
 * feeds the one [WatchTracker] here. What isn't sent yet is kept on this
 * phone, tied to the server and key it was counted for, so an app restart
 * doesn't lose it and another account never sends it (a new credential also
 * clears it, in [ConnectionStore.save]). Sent every 30 s while there's
 * something to send, when 50 posts wait, and when the app stops.
 */
class WatchCounts private constructor(context: Context) {
    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private val connections = ConnectionStore.get(context)
    private val json = Json { ignoreUnknownKeys = true }
    private val scope = MainScope()
    private var tracker = WatchTracker()
    private var owner: String? = null
    private var sending = false
    private var flushSoon: Job? = null
    private var savedAt = 0L

    @Serializable
    private data class Saved(val scope: String, val tallies: Map<String, WatchTally>)

    init {
        load()
    }

    private fun connectionScope(): String? = connections.current()?.let {
        MessageDigest.getInstance("SHA-256").digest((it.server + "|" + it.key).toByteArray())
            .joinToString("") { byte -> "%02x".format(byte) }
    }

    /** Another connection since: what was counted for the old one is dropped, never sent with the new key. */
    private fun checkScope(): Boolean {
        val now = connectionScope()
        if (now != owner) {
            tracker = WatchTracker()
            load()
        }
        return owner != null
    }

    private fun load() {
        owner = connectionScope()
        val scope = owner ?: return
        val saved = runCatching {
            prefs.getString(KEY, null)?.let { json.decodeFromString(Saved.serializer(), it) }
        }.getOrNull() ?: return
        if (saved.scope == scope) tracker.tallies.putAll(saved.tallies) else prefs.edit().remove(KEY).apply()
    }

    private fun save(now: Boolean = false) {
        val at = System.currentTimeMillis()
        if (!now && at - savedAt < SAVE_EVERY_MS) return
        val scope = owner ?: return
        savedAt = at
        val tallies = tracker.tallies
        while (tallies.size > MOST) tallies.remove(tallies.keys.first())
        if (tallies.isEmpty()) {
            prefs.edit().remove(KEY).apply()
        } else {
            prefs.edit().putString(KEY, json.encodeToString(Saved.serializer(), Saved(scope, HashMap(tallies)))).apply()
        }
    }

    // From the player

    /** The post on screen plays (null: nothing does); [atMs] when it carries on part-way. */
    fun begin(key: String?, atMs: Long? = null) {
        if (!checkScope()) return
        tracker.begin(key, atMs?.let { it / 1000.0 })
    }

    /** Where it is, every quarter second. */
    fun sample(positionMs: Long, durationMs: Long) {
        if (!checkScope()) return
        val key = tracker.key ?: return
        val before = tracker.tallies[key]?.plays ?: 0
        tracker.sample(positionMs / 1000.0, durationMs.coerceAtLeast(0L) / 1000.0)
        val counted = (tracker.tallies[key]?.plays ?: 0) != before
        save(now = counted)
        if (counted) sendSoon()
    }

    fun ended() {
        if (!checkScope()) return
        tracker.ended()
        save(now = true)
        sendSoon()
    }

    // Sending

    private fun sendSoon() {
        if (tracker.tallies.size >= WatchTracker.MAX_BATCH) {
            flush()
            return
        }
        if (flushSoon?.isActive == true) return
        flushSoon = scope.launch {
            delay(FLUSH_MS)
            flush()
        }
    }

    /** Sends what's waiting (the app stopping or starting, a full batch, every 30 s). */
    fun flush() {
        flushSoon?.cancel()
        flushSoon = null
        if (sending || !checkScope()) return
        val connection = connections.current() ?: return
        val owner = owner
        val batch = tracker.takeBatch()
        save(now = true)
        if (batch.isEmpty()) return
        // Debug builds can look around a test server without counting anything.
        if (!FeedViewModel.sendSeen) return
        sending = true
        scope.launch {
            val result = AdhxApi(connection).watched(batch.map { WatchedPost(it.platform, it.id, it.plays, it.finishes, it.seconds) })
            sending = false
            val retry = when (result) {
                is ApiResult.Ok -> false
                // An older ADHX without counts (404), or a batch it won't take (400): let it go.
                is ApiResult.Failed -> result.status != 404 && result.status != 400
                ApiResult.Offline -> true
            }
            // Only ever back into the account it was counted for.
            if (retry && owner == this@WatchCounts.owner) {
                tracker.putBack(batch)
                save(now = true)
                sendSoon()
            }
        }
    }

    companion object {
        const val PREFS = "adhx.watched"
        private const val KEY = "tallies"
        const val FLUSH_MS = 30_000L
        private const val SAVE_EVERY_MS = 5_000L
        /** Posts kept waiting at most (the oldest go first). */
        private const val MOST = 500

        @Volatile
        private var instance: WatchCounts? = null

        fun get(context: Context): WatchCounts =
            instance ?: synchronized(this) {
                instance ?: WatchCounts(context.applicationContext).also { instance = it }
            }
    }
}
