package com.adhx.share.feed

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/** One foreground subscription; reconnect resync, bounded signals and serial refreshes.
 * A local timer checks fallback eligibility; healthy streams never poll every five seconds. */
internal suspend fun followLiveUpdates(
    stream: () -> Flow<Unit>,
    active: () -> Boolean,
    fallbackMs: Long = 5_000,
    now: () -> Long = { System.nanoTime() / 1_000_000 },
    jitter: () -> Long = { (0L..250L).random() },
    refresh: suspend () -> Unit,
) = coroutineScope {
    var streaming = false
    var refreshed = now()
    val signals = Channel<Unit>(Channel.CONFLATED)
    val connection = launch {
        var retry = 1_000L
        while (isActive && active()) {
            try {
                stream().collect {
                    streaming = true
                    retry = 1_000
                    signals.trySend(Unit)
                }
            } catch (cancelled: CancellationException) { throw cancelled
            } catch (_: Exception) { /* Older/offline server: keep REST recovery available. */
            } finally { streaming = false }
            delay(retry + jitter())
            retry = (retry * 2).coerceAtMost(30_000)
        }
    }
    val reconcile = launch {
        try {
            signals.trySend(Unit)
            while (isActive && active()) {
                delay(1_000)
                if (now() - refreshed >= if (streaming) 30_000 else fallbackMs) signals.trySend(Unit)
            }
        } finally { signals.close() }
    }
    try {
        for (signal in signals) {
            if (!isActive || !active()) break
            refresh()
            refreshed = now()
            if (!active()) break
            delay(1_000) // Bursts make one pending snapshot, without overlapping requests.
        }
    } finally { connection.cancel(); reconcile.cancel(); signals.cancel() }
}
