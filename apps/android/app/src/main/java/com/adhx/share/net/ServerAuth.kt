package com.adhx.share.net

import com.adhx.share.data.Connection
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Interceptor
import okhttp3.Response

/**
 * Adds `Authorization: Bearer <phone key>` to image requests for the
 * connected ADHX only (same scheme, host and port), so members' pictures
 * (`/api/files/avatar/…`, members only) load. Anything else, such as a
 * link's preview picture on another site, goes out without it.
 */
class ServerAuthInterceptor(private val connection: () -> Connection?) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val current = connection()
        if (current == null || request.header("Authorization") != null || !sameServer(request.url, current.server)) {
            return chain.proceed(request)
        }
        return chain.proceed(request.newBuilder().header("Authorization", "Bearer ${current.key}").build())
    }

    companion object {
        fun sameServer(url: HttpUrl, server: String): Boolean {
            val base = server.trim().toHttpUrlOrNull() ?: return false
            return url.scheme == base.scheme && url.host.equals(base.host, ignoreCase = true) && url.port == base.port
        }
    }
}
