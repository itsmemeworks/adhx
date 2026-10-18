package com.adhx.share.net

import com.adhx.share.data.Connection
import kotlinx.coroutines.suspendCancellableCoroutine
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

    private fun url(path: String): HttpUrl? = resolve(server, path)

    private fun authed(url: HttpUrl): Request.Builder {
        val builder = Request.Builder().url(url).header("Accept", "application/json")
        if (key != null) builder.header("Authorization", "Bearer $key")
        return builder
    }

    private suspend fun <T> send(request: Request, serializer: KSerializer<T>): ApiResult<T> {
        return try {
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
