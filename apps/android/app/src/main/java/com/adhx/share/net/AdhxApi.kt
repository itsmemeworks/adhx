package com.adhx.share.net

import com.adhx.share.data.Connection
import kotlinx.coroutines.Dispatchers
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

    suspend fun save(link: String): ApiResult<SaveResponse> {
        val url = url("api/app/save") ?: return badAddress
        val body = json.encodeToString(SaveRequest.serializer(), SaveRequest(link))
        return send(authed(url).post(body.toRequestBody(JSON)).build(), SaveResponse.serializer())
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

    /** Search your saves by meaning. */
    suspend fun search(q: String, offset: Int = 0): ApiResult<SearchResponse> {
        val base = url("api/app/search") ?: return badAddress
        val url = base.newBuilder()
            .addQueryParameter("q", q)
            .addQueryParameter("offset", offset.toString())
            .build()
        return send(authed(url).get().build(), SearchResponse.serializer())
    }

    private fun url(path: String): HttpUrl? = resolve(server, path)

    private fun authed(url: HttpUrl): Request.Builder {
        val builder = Request.Builder().url(url).header("Accept", "application/json")
        if (key != null) builder.header("Authorization", "Bearer $key")
        return builder
    }

    // On the IO dispatcher: reading the body blocks, and callers are on Main.
    private suspend fun <T> send(
        request: Request,
        serializer: KSerializer<T>,
    ): ApiResult<T> = withContext(Dispatchers.IO) {
        try {
            client.newCall(request).await().use { response ->
                val text = response.body?.string().orEmpty()
                when {
                    response.code in 502..504 -> ApiResult.Offline
                    response.isSuccessful -> try {
                        ApiResult.Ok(json.decodeFromString(serializer, text), response.code)
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
