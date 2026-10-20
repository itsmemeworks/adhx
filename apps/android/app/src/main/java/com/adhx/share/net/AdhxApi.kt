package com.adhx.share.net

import kotlinx.serialization.builtins.serializer

import com.adhx.share.data.Connection
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json
import okhttp3.Call
import okhttp3.Callback
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** What an API call came back with. */
sealed interface ApiResult<out T> {
    data class Ok<T>(val value: T, val status: Int) : ApiResult<T>

    /** The server answered with an error. `message` is plain words fit to show. */
    data class Failed(val status: Int, val code: String?, val message: String?) : ApiResult<Nothing>

    /** No answer, a timeout, or 502/503/504: try again later. */
    data object Offline : ApiResult<Nothing>
}

/**
 * The phone app API. Every call except [pair] sends the phone key as a
 * bearer token.
 */
class AdhxApi(private val server: String, private val key: String?) {

    constructor(connection: Connection) : this(connection.server, connection.key)

    suspend fun pair(code: String, name: String?): ApiResult<PairResponse> {
        val url = url("api/app/pair") ?: return badAddress
        val body = json.encodeToString(PairRequest.serializer(), PairRequest(code, name))
        val request = Request.Builder().url(url).post(body.toRequestBody(JSON)).build()
        return send(request, PairResponse.serializer())
    }

    suspend fun me(): ApiResult<MeResponse> {
        val url = url("api/app/me") ?: return badAddress
        return send(authed(url).get().build(), MeResponse.serializer())
    }

    suspend fun save(link: String, justForMe: Boolean = false): ApiResult<SaveResponse> {
        val url = url("api/app/save") ?: return badAddress
        val body = json.encodeToString(SaveRequest.serializer(), saveRequest(link, justForMe))
        return send(authed(url).post(body.toRequestBody(JSON)).build(), SaveResponse.serializer())
    }

    /**
     * Save [link] in the background (`Prefer: respond-async`), then follow it
     * with `GET /api/app/save?id=` every [interval] until it's saved or failed.
     * An older server saves at once and answers 200 straight away. A timeout
     * or 5xx on the POST is [ApiResult.Offline]; once queued, missed polls are
     * only waited out, since the server carries on by itself. After [limitMs]
     * still queued, it's `Failed` with [STILL_SAVING].
     */
    suspend fun saveAndFollow(
        link: String,
        interval: () -> Long,
        limitMs: Long = FOLLOW_LIMIT_MS,
        justForMe: Boolean = false,
        explicit: Boolean = false,
        onQueued: (String) -> Unit = {},
        deferPublish: Boolean = false,
        requestId: String? = null,
        note: String? = null,
    ): ApiResult<SaveResponse> {
        val url = url("api/app/save") ?: return badAddress
        val body = json.encodeToString(
            SaveRequest.serializer(),
            saveRequest(link, justForMe, explicit).copy(deferPublish = deferPublish, requestId = requestId, note = cleanNote(note)),
        )
        val request = authed(url).header("Prefer", "respond-async").post(body.toRequestBody(JSON)).build()
        val started = send(request) { code, text ->
            if (code == 202) json.decodeFromString(QueuedBody.serializer(), text).id
            else json.decodeFromString(SaveResponse.serializer(), text)
        }
        val queueId = when (started) {
            is ApiResult.Ok -> when (val value = started.value) {
                is SaveResponse -> return ApiResult.Ok(value, started.status)
                is String -> value.ifBlank { return ApiResult.Failed(started.status, "bad_answer", NOT_ADHX) }
                else -> return ApiResult.Failed(started.status, "bad_answer", NOT_ADHX)
            }
            is ApiResult.Failed -> return started
            ApiResult.Offline -> return ApiResult.Offline
        }
        onQueued(queueId)
        return followQueued(queueId, interval, limitMs)
    }

    /** Resume a durably remembered share without posting the link again. */
    suspend fun followQueued(
        queueId: String,
        interval: () -> Long,
        limitMs: Long = FOLLOW_LIMIT_MS,
    ): ApiResult<SaveResponse> {
        val until = System.currentTimeMillis() + limitMs
        while (System.currentTimeMillis() < until) {
            delay(interval())
            when (val polled = queued(queueId)) {
                is ApiResult.Ok -> {
                    val q = polled.value
                    when (q.state) {
                        QueuedState.SAVED -> if (q.post != null) return ApiResult.Ok(q.post, 200)
                        QueuedState.FAILED -> return ApiResult.Failed(200, q.code ?: "failed", q.error?.takeIf { it.isNotBlank() })
                    }
                }
                is ApiResult.Failed -> if (polled.status == 401 || polled.status == 404) return polled
                ApiResult.Offline -> Unit
            }
        }
        return ApiResult.Failed(0, STILL_SAVING, null)
    }

    /** How a queued link is going. */
    suspend fun queued(id: String): ApiResult<QueuedSave> {
        val base = url("api/app/save") ?: return badAddress
        val url = base.newBuilder().addQueryParameter("id", id).build()
        return send(authed(url).get().build(), QueuedSave.serializer())
    }

    /** Acknowledge the latest durable choice without ever submitting the link again. */
    suspend fun queuedPrivacy(id: String, choice: Boolean?, intentVersion: Long? = null): ApiResult<Unit> {
        val url = url("api/app/save") ?: return badAddress
        val body = json.encodeToString(QueuedPrivacyRequest.serializer(), QueuedPrivacyRequest(id, choice, intentVersion))
        return send(authed(url).patch(body.toRequestBody(JSON)).build()) { _, _ -> Unit }
    }

    suspend fun status(platform: String, id: String): ApiResult<StatusResponse> {
        val base = url("api/app/status") ?: return badAddress
        val url = base.newBuilder()
            .addQueryParameter("platform", platform)
            .addQueryParameter("id", id)
            .build()
        return send(authed(url).get().build(), StatusResponse.serializer())
    }

    /** A page of your saves for the player, newest first. */
    suspend fun saves(offset: Int, limit: Int = PAGE): ApiResult<SavesResponse> {
        val base = url("api/app/saves") ?: return badAddress
        val url = base.newBuilder()
            .addQueryParameter("offset", offset.toString())
            .addQueryParameter("limit", limit.toString())
            .build()
        return send(authed(url).get().build(), SavesResponse.serializer())
    }

    /** One of your saves, archived or not (Shared lately opens it in the player). */
    suspend fun post(platform: String, id: String): ApiResult<SavedPostResponse> {
        val base = url("api/app/saves") ?: return badAddress
        val url = base.newBuilder()
            .addQueryParameter("platform", platform)
            .addQueryParameter("id", id)
            .build()
        return send(authed(url).get().build(), SavedPostResponse.serializer())
    }

    /** Search saves by meaning: yours, or everyone's on this server ([SearchScope]). */
    suspend fun search(q: String, offset: Int = 0, scope: String = SearchScope.MINE): ApiResult<SearchResponse> {
        val base = url("api/app/search") ?: return badAddress
        val url = base.newBuilder()
            .addQueryParameter("q", q)
            .addQueryParameter("offset", offset.toString())
            .addQueryParameter("scope", scope)
            .build()
        return send(authed(url).get().build(), SearchResponse.serializer())
    }

    /** Switch one of your saves "Just for me" (or back). Answers what it is now. */
    suspend fun setPrivate(platform: String, id: String, justForMe: Boolean): ApiResult<Boolean> {
        val url = url("api/app/private") ?: return badAddress
        val body = json.encodeToString(PrivateRequest.serializer(), PrivateRequest(platform, id, justForMe))
        return send(authed(url).post(body.toRequestBody(JSON)).build()) { _, text ->
            if (text.isBlank()) justForMe else json.decodeFromString(PrivateResponse.serializer(), text).isPrivate
        }
    }

    /** A page of the friends feed ([FeedMode]), only of [types] ([MediaType]) when given. */
    suspend fun feed(mode: String, cursor: String? = null, types: Collection<String>? = null): ApiResult<FeedResponse> {
        val base = url("api/app/feed") ?: return badAddress
        val url = base.newBuilder()
            .addQueryParameter("mode", mode)
            .apply { if (cursor != null) addQueryParameter("cursor", cursor) }
            .apply { if (!types.isNullOrEmpty()) addQueryParameter("types", MediaType.all.filter { it in types }.joinToString(",")) }
            .build()
        return send(authed(url).get().build(), FeedResponse.serializer())
    }

    /** Your feed filter, as the server keeps it. */
    suspend fun feedTypes(): ApiResult<FeedTypesBody> {
        val url = url("api/app/feed/types") ?: return badAddress
        return send(authed(url).get().build(), FeedTypesBody.serializer())
    }

    /** Keep your feed filter on the server. */
    suspend fun setFeedTypes(types: Collection<String>): ApiResult<Unit> {
        val url = url("api/app/feed/types") ?: return badAddress
        val body = json.encodeToString(FeedTypesBody.serializer(), FeedTypesBody(MediaType.all.filter { it in types }))
        return send(authed(url).put(body.toRequestBody(JSON)).build()) { _, _ -> }
    }

    /** "Show less / more from …": your choices so far. */
    suspend fun feedWeights(): ApiResult<FeedWeights> {
        val url = url("api/app/feed/weights") ?: return badAddress
        return send(authed(url).get().build(), FeedWeights.serializer())
    }

    /** More (1), less (-1) or back to normal (0) from one member; answers with every choice. */
    suspend fun setFeedWeight(username: String, weight: Int): ApiResult<FeedWeights> {
        val url = url("api/app/feed/weights") ?: return badAddress
        val body = json.encodeToString(FeedWeightRequest.serializer(), FeedWeightRequest(username, weight.coerceIn(-1, 1)))
        return send(authed(url).put(body.toRequestBody(JSON)).build(), FeedWeights.serializer())
    }

    /** Mark posts seen (204). At most [SeenBatcher.MAX_BATCH] at a time. */
    suspend fun seen(posts: List<PostRef>): ApiResult<Unit> {
        val url = url("api/app/seen") ?: return badAddress
        val body = json.encodeToString(SeenRequest.serializer(), SeenRequest(posts))
        return send(authed(url).post(body.toRequestBody(JSON)).build()) { _, _ -> }
    }

    suspend fun channels(): ApiResult<ChannelsResponse> {
        val url = url("api/app/channels") ?: return badAddress
        return send(authed(url).get().build(), ChannelsResponse.serializer())
    }

    /** One channel's posts: [ChannelKind] and its slug (a friend's is their username). */
    suspend fun channel(kind: String, slug: String): ApiResult<ChannelItemsResponse> {
        val base = url("api/app/channels") ?: return badAddress
        val url = base.newBuilder().addPathSegment(kind).addPathSegment(slug).build()
        return send(authed(url).get().build(), ChannelItemsResponse.serializer())
    }

    suspend fun live(): ApiResult<LiveResponse> {
        val url = url("api/app/live") ?: return badAddress
        return send(authed(url).get().build(), LiveResponse.serializer())
    }

    suspend fun liveMoment(slug: String, session: String? = null, known: List<String> = emptyList()): ApiResult<LiveDetail> {
        val base = url("api/app/live") ?: return badAddress
        val url = base.newBuilder().addPathSegment(slug).build()
        val body = "{\"known\":" + json.encodeToString(kotlinx.serialization.builtins.ListSerializer(String.serializer()), known.take(200)) + "}"
        val request = authed(url).post(body.toRequestBody(JSON))
        if (session != null) request.header("X-ADHX-Watch", session)
        val result = send(request.build(), LiveDetail.serializer())
        return if (result is ApiResult.Failed && result.status == 405) send(authed(url).get().build(), LiveDetail.serializer()) else result
    }

    suspend fun leaveLive(slug: String, session: String): ApiResult<Unit> {
        val base = url("api/app/live") ?: return badAddress
        val url = base.newBuilder().addPathSegment(slug).build()
        return send(authed(url).header("X-ADHX-Watch", session).delete().build()) { _, _ -> }
    }

    /** React to a post in a moment: one [Reaction.emoji], or a few words (at most [Reaction.MAX_TEXT]). */
    suspend fun react(slug: String, platform: String, id: String, emoji: String? = null, text: String? = null): ApiResult<Unit> {
        val base = url("api/app/live") ?: return badAddress
        val url = base.newBuilder().addPathSegment(slug).addPathSegment("react").build()
        val request = ReactRequest(emoji = emoji, text = text?.trim()?.let(Reaction::clip), platform = platform, id = id)
        val body = json.encodeToString(ReactRequest.serializer(), request)
        return send(authed(url).post(body.toRequestBody(JSON)).build()) { _, _ -> }
    }

    /** Your people and, for an admin, who's waiting to be let in. */
    suspend fun people(): ApiResult<PeopleResponse> {
        val url = url("api/app/people") ?: return badAddress
        return send(authed(url).get().build(), PeopleResponse.serializer())
    }

    /** An admin's answer to a join request ([JoinDecision]). Answers what the account is now. */
    suspend fun decideJoin(requestId: String, decision: String): ApiResult<JoinDecisionResponse> {
        val base = url("api/app/people/requests") ?: return badAddress
        val url = base.newBuilder().addPathSegment(requestId).build()
        val body = json.encodeToString(JoinDecisionRequest.serializer(), JoinDecisionRequest(decision))
        return send(authed(url).post(body.toRequestBody(JSON)).build(), JoinDecisionResponse.serializer())
    }

    /** What your ADHX is doing: posts on their way, stuck, or just finished ([DoingScope]). */
    suspend fun doing(scope: String = DoingScope.ALL): ApiResult<DoingResponse> {
        val base = url("api/app/doing") ?: return badAddress
        val url = base.newBuilder().addQueryParameter("scope", scope).build()
        return send(authed(url).get().build(), DoingResponse.serializer())
    }

    /** Try a stuck post again (for someone who saved it). */
    suspend fun retry(platform: String, id: String): ApiResult<RetryResponse> {
        val url = url("api/app/doing/retry") ?: return badAddress
        val body = json.encodeToString(PostRef.serializer(), PostRef(platform, id))
        return send(authed(url).post(body.toRequestBody(JSON)).build(), RetryResponse.serializer())
    }

    /**
     * `private` is sent when it's on, or when [explicit] (the phone has its
     * own "Just for me by default", or the switch was touched). Otherwise
     * it's left out and the server's default for the account applies.
     */
    /**
     * Add [note] to a save that's already done (the share card's "Add a note",
     * typed after the save went out): the same `POST /api/app/save` with
     * `note`, and the save's privacy said outright so it can't change. A
     * server without notes ignores the field.
     */
    suspend fun saveNote(link: String, note: String, justForMe: Boolean): ApiResult<SaveResponse> {
        val url = url("api/app/save") ?: return badAddress
        val body = json.encodeToString(SaveRequest.serializer(), SaveRequest(link, isPrivate = justForMe, note = cleanNote(note)))
        return send(authed(url).post(body.toRequestBody(JSON)).build(), SaveResponse.serializer())
    }

    /**
     * `POST /api/app/note { platform, id, note }`: set your own note on a
     * save. Answers `{ note }`, the server's cleaned copy.
     */
    suspend fun setNote(platform: String, id: String, note: String): ApiResult<NoteResponse> {
        val url = url("api/app/note") ?: return badAddress
        val body = json.encodeToString(NoteRequest.serializer(), NoteRequest(platform, id, cleanNote(note) ?: return ApiResult.Failed(400, "empty_note", null)))
        return send(authed(url).post(body.toRequestBody(JSON)).build(), NoteResponse.serializer())
    }

    private fun cleanNote(note: String?): String? = note?.trim()?.takeIf { it.isNotEmpty() }?.take(NOTE_MAX)

    private fun saveRequest(link: String, justForMe: Boolean, explicit: Boolean = false) =
        SaveRequest(link, isPrivate = if (justForMe) true else if (explicit) false else null)

    private fun url(path: String): HttpUrl? = resolve(server, path)

    private fun authed(url: HttpUrl): Request.Builder {
        val builder = Request.Builder().url(url).header("Accept", "application/json")
        if (key != null) builder.header("Authorization", "Bearer $key")
        return builder
    }

    // On the IO dispatcher: reading the body blocks, and callers are on Main.
    private suspend fun <T> send(request: Request, serializer: KSerializer<T>): ApiResult<T> =
        send(request) { _, text -> json.decodeFromString(serializer, text) }

    private suspend fun <T> send(
        request: Request,
        decode: (code: Int, text: String) -> T,
    ): ApiResult<T> = withContext(Dispatchers.IO) {
        try {
            client.newCall(request).await().use { response ->
                val text = response.body?.string().orEmpty()
                when {
                    response.code in 502..504 -> ApiResult.Offline
                    response.isSuccessful -> try {
                        ApiResult.Ok(decode(response.code, text), response.code)
                    } catch (e: IllegalArgumentException) {
                        ApiResult.Failed(response.code, "bad_answer", NOT_ADHX)
                    }
                    else -> {
                        val error = try {
                            json.decodeFromString(ErrorBody.serializer(), text)
                        } catch (e: IllegalArgumentException) {
                            null
                        }
                        ApiResult.Failed(response.code, error?.code, error?.error)
                    }
                }
            }
        } catch (e: IOException) {
            ApiResult.Offline
        }
    }

    companion object {
        const val PAGE = 20

        /** `saveAndFollow` gave up waiting, but the server is still on it. */
        const val STILL_SAVING = "still_saving"

        /** The server retries a queued save for about 15 minutes. */
        const val FOLLOW_LIMIT_MS = 16 * 60 * 1_000L

        /** Notes on saves are at most this long. */
        const val NOTE_MAX = 140
        private val JSON = "application/json; charset=utf-8".toMediaType()
        private const val NOT_ADHX = "That address didn’t answer like an ADHX."

        private val badAddress = ApiResult.Failed(0, "bad_address", "That address doesn’t look right.")

        val json = Json {
            ignoreUnknownKeys = true
            explicitNulls = false
            coerceInputValues = true
        }

        private val client: OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .writeTimeout(15, TimeUnit.SECONDS)
            .callTimeout(15, TimeUnit.SECONDS)
            .build()

        /**
         * Why a file won't play: a video the server can't serve answers 404 or
         * 410 with `{ reason }` in plain words. Null when it didn't say.
         */
        suspend fun reason(url: String): String? = withContext(Dispatchers.IO) {
            val request = try {
                Request.Builder().url(url).header("Range", "bytes=0-1").build()
            } catch (e: IllegalArgumentException) {
                return@withContext null
            }
            try {
                client.newCall(request).await().use { response ->
                    if (response.code != 404 && response.code != 410) return@use null
                    val text = response.body?.string().orEmpty()
                    try {
                        json.decodeFromString(ReasonBody.serializer(), text).reason?.takeIf { it.isNotBlank() }
                    } catch (e: IllegalArgumentException) {
                        null
                    }
                }
            } catch (e: IOException) {
                null
            }
        }

        /**
         * Resolve a path (or an absolute URL) against the server address, as
         * `posterUrl` and `openPath` need. Returns null for a broken address.
         */
        fun resolve(server: String, path: String): HttpUrl? {
            val base = server.trimEnd('/').plus("/").toHttpUrlOrNull() ?: return null
            return base.resolve(path)
        }
    }
}

private suspend fun Call.await(): Response = suspendCancellableCoroutine { cont ->
    enqueue(object : Callback {
        override fun onResponse(call: Call, response: Response) {
            cont.resume(response)
        }

        override fun onFailure(call: Call, e: IOException) {
            cont.resumeWithException(e)
        }
    })
    cont.invokeOnCancellation {
        try {
            cancel()
        } catch (_: Throwable) {
        }
    }
}
