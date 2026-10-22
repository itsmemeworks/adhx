package com.adhx.share.library

import android.content.Context
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
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
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

/** The spots, on this phone only (nothing goes to the server). */
class ResumeStore private constructor(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("adhx.resume", Context.MODE_PRIVATE)
    private val json = Json { ignoreUnknownKeys = true }
    private val serializer = MapSerializer(String.serializer(), ResumeSpot.serializer())

    private fun read(): Map<String, ResumeSpot> = try {
        prefs.getString(KEY, null)?.let { json.decodeFromString(serializer, it) } ?: emptyMap()
    } catch (e: Exception) {
        emptyMap()
    }

    private fun write(spots: Map<String, ResumeSpot>) {
        prefs.edit().putString(KEY, json.encodeToString(serializer, Resume.tidy(spots, System.currentTimeMillis()))).apply()
    }

    /** Remember where you are in [post], or forget it near the start or the end. */
    fun leave(post: String, positionMs: Long, durationMs: Long) {
        if (!Resume.counts(durationMs)) return
        val spots = read().toMutableMap()
        val spot = Resume.spotFor(positionMs, durationMs, System.currentTimeMillis())
        if (spot == null) spots.remove(post) else spots[post] = spot
        write(spots)
    }

    fun spot(post: String): ResumeSpot? =
        read()[post]?.takeIf { System.currentTimeMillis() - it.atMs < Resume.KEEP_MS }

    fun forget(post: String) {
        val spots = read()
        if (post in spots) write(spots - post)
    }

    companion object {
        private const val KEY = "spots"

        @Volatile
        private var instance: ResumeStore? = null

        fun get(context: Context): ResumeStore =
            instance ?: synchronized(this) { instance ?: ResumeStore(context).also { instance = it } }
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
            .clip(RoundedCornerShape(24.dp))
            .background(AdhxColors.Surface.copy(alpha = 0.92f))
            .border(1.dp, Color.White.copy(alpha = 0.1f), RoundedCornerShape(24.dp))
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
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            PrimaryButton("Resume from ${Resume.clock(spot.positionMs)}", onClick = onResume, modifier = Modifier.weight(1f))
            OutlineButton("Start over", onClick = onStartOver, minHeight = 48.dp)
        }
    }
}
