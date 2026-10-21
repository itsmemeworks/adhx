package com.adhx.share.ui

import androidx.compose.runtime.compositionLocalOf
import com.adhx.share.net.AvatarSource

/**
 * Who "you" are on this phone, for drawing your own face: your username and
 * your picture as `/api/app/me` last said (refreshed on resume and after you
 * change it). [known] is true when the server said where the picture comes
 * from, so a null [avatarUrl] really means "no picture" rather than an older
 * server that doesn't send it.
 */
data class Me(
    val username: String? = null,
    val avatarUrl: String? = null,
    val known: Boolean = false,
) {
    /** [username] (with or without "@") is you. */
    fun isMe(username: String?): Boolean {
        val mine = clean(this.username) ?: return false
        return clean(username)?.equals(mine, ignoreCase = true) == true
    }

    /**
     * The picture to draw for someone: yours (the freshest) when it's you,
     * else what the server sent. A letter only when you genuinely have none.
     */
    fun pictureFor(username: String?, isYou: Boolean, avatarUrl: String?): String? {
        if (!isYou && !isMe(username)) return avatarUrl
        this.avatarUrl?.takeIf { it.isNotBlank() }?.let { return it }
        return if (known) null else avatarUrl
    }

    companion object {
        private fun clean(name: String?): String? = name?.trim()?.removePrefix("@")?.takeIf { it.isNotEmpty() }

        /** From the connection's picture and `/api/app/me`'s `avatarSource` (null on older servers). */
        fun of(username: String?, avatarUrl: String?, avatarSource: String?): Me =
            Me(
                username = username,
                avatarUrl = avatarUrl?.takeIf { it.isNotBlank() && avatarSource != AvatarSource.GENERATED },
                known = avatarSource != null,
            )
    }
}

/** You, on this phone. Provided once at the top of the app. */
val LocalMe = compositionLocalOf { Me() }
