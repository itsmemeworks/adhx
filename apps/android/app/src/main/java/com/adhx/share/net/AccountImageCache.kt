package com.adhx.share.net

import coil3.intercept.Interceptor
import coil3.request.ImageResult
import com.adhx.share.data.Connection
import java.security.MessageDigest

/** Separate authenticated image entries when a phone pairs to another account. */
internal class AccountImageCache(private val connection: () -> Connection?) : Interceptor {
    override suspend fun intercept(chain: Interceptor.Chain): ImageResult {
        val request = chain.request
        val account = scope(connection())
        val scoped = request.newBuilder()
            .memoryCacheKeyExtra("adhx-account", account)
            .diskCacheKey("$account:${request.diskCacheKey ?: request.data}")
            .build()
        return chain.withRequest(scoped).proceed()
    }

    companion object {
        // Phone keys never appear in image cache keys or logs. Rotation changes the namespace too.
        fun scope(connection: Connection?): String = if (connection == null) "unpaired" else
            MessageDigest.getInstance("SHA-256")
                .digest("${connection.server}\u0000${connection.key}".toByteArray(Charsets.UTF_8))
                .joinToString("") { "%02x".format(it) }
    }
}
