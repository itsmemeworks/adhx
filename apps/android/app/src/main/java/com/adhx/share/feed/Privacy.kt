package com.adhx.share.feed

import androidx.compose.runtime.mutableStateMapOf
import com.adhx.share.data.ConnectionStore
import com.adhx.share.net.AdhxApi
import com.adhx.share.net.ApiResult
import com.adhx.share.net.PhonePost
import android.content.Context

/**
 * "Just for me" switched on this phone since the lists were loaded, by post
 * key, so the lock shows (or goes) everywhere at once without a reload.
 */
object Privacy {
    private val changed = mutableStateMapOf<String, Boolean>()

    fun isPrivate(post: PhonePost): Boolean = changed[post.key] ?: post.isPrivate

    /**
     * Ask the server (`POST /api/app/private`) and remember the answer.
     * Returns what it is now, or the failure.
     */
    suspend fun set(context: Context, post: PhonePost, justForMe: Boolean): ApiResult<Boolean> {
        val connection = ConnectionStore.get(context).current() ?: return ApiResult.Offline
        val result = AdhxApi(connection).setPrivate(post.platform, post.id, justForMe)
        if (result is ApiResult.Ok) changed[post.key] = result.value
        return result
    }

    fun clear() = changed.clear()
}
