package com.adhx.share.library

import android.content.Context
import com.adhx.share.data.ConnectionStore
import com.adhx.share.net.AdhxApi
import com.adhx.share.net.ApiResult
import com.adhx.share.net.PhonePost

/**
 * The rail's Save (the bookmark): keep a friend's post in your own saves too,
 * by saving its original link the way the share card does.
 */
object KeepToo {
    const val KEPT = "In your saves too"
    private const val COULDNT = "Couldn’t save it"

    /** Saves [post]'s original link. Returns whether it worked, and what to say. */
    suspend fun keep(context: Context, post: PhonePost): Pair<Boolean, String> {
        val link = post.sourceUrl?.takeIf { it.isNotBlank() } ?: return false to COULDNT
        val connection = ConnectionStore.get(context).current() ?: return false to COULDNT
        return when (val result = AdhxApi(connection).save(link)) {
            is ApiResult.Ok -> true to KEPT
            is ApiResult.Failed -> false to (result.message ?: COULDNT)
            ApiResult.Offline -> false to LibraryViewModel.OFFLINE
        }
    }
}
