package com.adhx.share.library

import android.content.Context
import com.adhx.share.data.ConnectionStore
import com.adhx.share.ui.SquircleShape
import java.security.MessageDigest
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.adhx.share.ui.AdhxColors
import com.adhx.share.ui.OutlineButton
import com.adhx.share.ui.PrimaryButton
import com.adhx.share.ui.SerifFamily
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.time.Instant
import java.time.ZoneId
import java.time.temporal.ChronoUnit

/** Where you left a long post: [positionMs] into [durationMs], at [atMs] (epoch). */
@Serializable
data class ResumeSpot(val positionMs: Long, val durationMs: Long, val atMs: Long)

/**
 * The rules for picking up where you left off (board 14.2), without storage:
 * only posts at least [SHORTEST_MS] long; less than [MARGIN_MS] in, or that
 * close to the end, starts from the top; spots older than [KEEP_MS] are
 * forgotten, and at most [MOST] are kept.
 */
object Resume {
    const val SHORTEST_MS = 60_000L
    const val MARGIN_MS = 15_000L
    const val KEEP_MS = 30L * 86_400_000L
    const val MOST = 300

    /** The spot to keep for leaving at [positionMs] of [durationMs], or null to forget it. */
    fun spotFor(positionMs: Long, durationMs: Long, nowMs: Long): ResumeSpot? {
        if (durationMs < SHORTEST_MS) return null
        if (positionMs < MARGIN_MS || positionMs > durationMs - MARGIN_MS) return null
        return ResumeSpot(positionMs, durationMs, nowMs)
    }

    /** Whether a long post is worth remembering at all (short ones are never touched). */
    fun counts(durationMs: Long): Boolean = durationMs >= SHORTEST_MS

    /** Drops spots past [KEEP_MS], then the oldest beyond [MOST]. */
    fun tidy(spots: Map<String, ResumeSpot>, nowMs: Long): Map<String, ResumeSpot> {
        val fresh = spots.filterValues { nowMs - it.atMs < KEEP_MS }
        if (fresh.size <= MOST) return fresh
        return fresh.entries.sortedByDescending { it.value.atMs }.take(MOST).associate { it.key to it.value }
    }

    /** "12:40", "1:02:05". */
    fun clock(ms: Long): String {
        val s = (ms / 1000).coerceAtLeast(0)
        val h = s / 3600
        val m = (s % 3600) / 60
        val r = s % 60
        return if (h > 0) "%d:%02d:%02d".format(h, m, r) else "%d:%02d".format(m, r)
    }

    /** "a moment ago", "earlier today", "yesterday", "3 days ago". */
    fun whenWords(atMs: Long, nowMs: Long, zone: ZoneId = ZoneId.systemDefault()): String {
        if (nowMs - atMs < 15 * 60_000L) return "a moment ago"
        val day = Instant.ofEpochMilli(atMs).atZone(zone).toLocalDate()
        val today = Instant.ofEpochMilli(nowMs).atZone(zone).toLocalDate()
        val days = ChronoUnit.DAYS.between(day, today)
        return when {
            days <= 0L -> "earlier today"
            days == 1L -> "yesterday"
            else -> "$days days ago"
        }
    }

    /** "You were 12:40 into this, yesterday." */
    fun line(spot: ResumeSpot, nowMs: Long, zone: ZoneId = ZoneId.systemDefault()): String =
        "You were ${clock(spot.positionMs)} into this, ${whenWords(spot.atMs, nowMs, zone)}."
}

/** One bounded, credential-scoped history. Legacy unscoped records are never adopted. */
@Serializable
internal data class ResumeRecord(val scope: String, val spots: Map<String, ResumeSpot>)

/** Shared by the preference adapter and JVM regressions, including late old-player writes. */
internal class ResumeHistory(
    private val scope: String?,
    private val currentScope: () -> String?,
    private val read: () -> ResumeRecord?,
    private val write: (ResumeRecord) -> Unit,
) {
    private fun spots(): Map<String, ResumeSpot> =
        if (scope != null && scope == currentScope()) read()?.takeIf { it.scope == scope }?.spots.orEmpty() else emptyMap()

    fun leave(post: String, positionMs: Long, durationMs: Long, nowMs: Long) {
        if (scope == null || scope != currentScope() || !Resume.counts(durationMs)) return
        val next = spots().toMutableMap()
        val spot = Resume.spotFor(positionMs, durationMs, nowMs)
        if (spot == null) next.remove(post) else next[post] = spot
        write(ResumeRecord(scope, Resume.tidy(next, nowMs)))
    }

    fun spot(post: String, nowMs: Long): ResumeSpot? = spots()[post]?.takeIf { nowMs - it.atMs < Resume.KEEP_MS }

    fun forget(post: String) {
        if (scope == null || scope != currentScope()) return
        write(ResumeRecord(scope, spots() - post))
    }
}

/** The spots, on this phone only. The credential itself is never persisted here. */
class ResumeStore private constructor(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("adhx.resume", Context.MODE_PRIVATE)
    private val json = Json { ignoreUnknownKeys = true }
    private val connections = ConnectionStore.get(context)
    private fun scope(): String? = connections.current()?.let {
        MessageDigest.getInstance("SHA-256").digest((it.server + "|" + it.key).toByteArray())
            .joinToString("") { byte -> "%02x".format(byte) }
    }
    private val history = ResumeHistory(
        scope(), ::scope,
        read = { runCatching { prefs.getString(KEY, null)?.let { json.decodeFromString(ResumeRecord.serializer(), it) } }.getOrNull() },
        write = { prefs.edit().putString(KEY, json.encodeToString(ResumeRecord.serializer(), it)).apply() },
    )

    fun leave(post: String, positionMs: Long, durationMs: Long) =
        history.leave(post, positionMs, durationMs, System.currentTimeMillis())
    fun spot(post: String): ResumeSpot? = history.spot(post, System.currentTimeMillis())
    fun forget(post: String) = history.forget(post)

    companion object {
        private const val KEY = "spots"
        fun get(context: Context): ResumeStore = ResumeStore(context.applicationContext)
    }
}

/** "Pick up where you left off?" over a long post you left part-way (board 14.2). */
@Composable
fun ResumeCard(spot: ResumeSpot, onResume: () -> Unit, onStartOver: () -> Unit, modifier: Modifier = Modifier) {
    val now = System.currentTimeMillis()
    Column(
        modifier
            .padding(horizontal = 24.dp)
            .fillMaxWidth()
            .clip(SquircleShape(24.dp))
            .background(AdhxColors.Surface.copy(alpha = 0.92f))
            .border(1.dp, Color.White.copy(alpha = 0.1f), SquircleShape(24.dp))
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Text(
            "Pick up where you left off?",
            fontFamily = SerifFamily,
            fontSize = 30.sp,
            lineHeight = 32.sp,
            color = AdhxColors.White,
            modifier = Modifier.semantics { heading() },
        )
        Text(Resume.line(spot, now), fontSize = 14.sp, lineHeight = 20.sp, color = AdhxColors.Muted)
        Box(
            Modifier
                .fillMaxWidth()
                .height(4.dp)
                .clip(RoundedCornerShape(50))
                .background(Color.White.copy(alpha = 0.18f)),
        ) {
            val fraction = if (spot.durationMs > 0) (spot.positionMs.toFloat() / spot.durationMs).coerceIn(0f, 1f) else 0f
            Box(Modifier.fillMaxHeight().fillMaxWidth(fraction).background(AdhxColors.Accent))
        }
        // Along the card's foot: 24 − 20 padding = 4, so the 8dp floor.
        val inner = SquircleShape(SquircleShape.nested(24.dp, 20.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            PrimaryButton("Resume from ${Resume.clock(spot.positionMs)}", onClick = onResume, modifier = Modifier.weight(1f), shape = inner)
            OutlineButton("Start over", onClick = onStartOver, minHeight = 48.dp, shape = inner)
        }
    }
}
