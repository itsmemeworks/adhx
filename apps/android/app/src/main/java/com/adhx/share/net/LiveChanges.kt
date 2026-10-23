package com.adhx.share.net

import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.buffer
import kotlinx.coroutines.flow.callbackFlow
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener
import okhttp3.sse.EventSources
import java.io.IOException
import java.util.concurrent.TimeUnit

/** Official OkHttp SSE framing, connection ownership and cancellation. No key in URLs. */
private val liveClient = OkHttpClient.Builder()
    .connectTimeout(15, TimeUnit.SECONDS).readTimeout(45, TimeUnit.SECONDS)
    .callTimeout(0, TimeUnit.SECONDS).followRedirects(false).followSslRedirects(false).build()

internal fun openLiveChanges(request: Request): Flow<Unit> = callbackFlow {
    val source = EventSources.createFactory(liveClient).newEventSource(request, object : EventSourceListener() {
        override fun onOpen(eventSource: EventSource, response: Response) { trySend(Unit) }
        override fun onEvent(eventSource: EventSource, id: String?, type: String?, data: String) {
            if (type == "refresh") trySend(Unit)
        }
        override fun onClosed(eventSource: EventSource) { close() }
        override fun onFailure(eventSource: EventSource, t: Throwable?, response: Response?) {
            close(IOException("Live stream closed (${response?.code ?: 0})", t))
        }
    })
    awaitClose { source.cancel() }
}.buffer(Channel.CONFLATED) // Invalidation signals coalesce; the REST snapshot is authoritative.
