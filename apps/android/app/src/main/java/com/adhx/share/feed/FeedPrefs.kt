package com.adhx.share.feed

import android.content.Context
import com.adhx.share.net.MediaType

/**
 * The feed filter as last chosen on this phone, so it holds while the
 * server can't keep it (`/api/app/feed/types` may 404 until the blend lands).
 */
class FeedPrefs(context: Context) {
    private val prefs = context.getSharedPreferences("feed", Context.MODE_PRIVATE)

    var types: Set<String>
        get() = prefs.getString(K_TYPES, null)?.split(',')?.let(MediaType::clean) ?: MediaType.DEFAULT
        set(value) {
            prefs.edit().putString(K_TYPES, MediaType.clean(value).joinToString(",")).apply()
        }

    fun clear() = prefs.edit().remove(K_TYPES).apply()

    private companion object {
        const val K_TYPES = "types"
    }
}
