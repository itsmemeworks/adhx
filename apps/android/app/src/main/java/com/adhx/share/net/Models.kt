package com.adhx.share.net

import kotlinx.serialization.Serializable

// The JSON shapes of the ADHX phone app API (docs/specs/phone-app.md).

@Serializable
data class PairRequest(val code: String, val name: String? = null)

@Serializable
data class PairResponse(
    val key: String,
    val name: String? = null,
    val username: String? = null,
)

@Serializable
data class MeResponse(
    val username: String? = null,
    val name: String? = null,
)

@Serializable
data class SaveRequest(val url: String)

@Serializable
data class SaveResponse(
    val platform: String = "",
    val network: String? = null,
    val id: String = "",
    val author: String? = null,
    val authorName: String? = null,
    val text: String? = null,
    val category: String? = null,
    val posterUrl: String? = null,
    val openPath: String? = null,
    val alreadySaved: Boolean = false,
    val savedAt: String? = null,
)

@Serializable
data class Kept(
    val videos: Int = 0,
    val photos: Int = 0,
    val audio: Int = 0,
)

@Serializable
data class StatusResponse(
    val platform: String = "",
    val id: String = "",
    /** waiting · keeping · kept · retrying · unavailable · off */
    val status: String = KeepStatus.WAITING,
    val percent: Int? = null,
    val quality: String? = null,
    val kept: Kept? = null,
)

/** A saved post as the player shows it (`PhonePost` in docs/specs/phone-app.md). */
@Serializable
data class PhonePost(
    val platform: String = "",
    val id: String = "",
    /** video · audio · photo · article · text — see [PostKind]. */
    val kind: String = PostKind.TEXT,
    val author: PhoneAuthor = PhoneAuthor(),
    val text: String = "",
    val postedAt: String? = null,
    val savedAt: String? = null,
    /** The post on its own network ("Open original"). */
    val sourceUrl: String? = null,
    /** The post on this ADHX (relative). */
    val openPath: String? = null,
    val media: List<PhoneMedia> = emptyList(),
    val article: PhoneArticle? = null,
    /** Why a search found it. Only on search results. */
    val match: PhoneMatch? = null,
    /** Its picture or video isn't understood yet, so it matched on words. */
    val learning: Boolean = false,
) {
    val key: String get() = "$platform:$id"
}

@Serializable
data class PhoneAuthor(
    val handle: String = "",
    val name: String? = null,
    val avatarUrl: String? = null,
)

/** A video (or sound) or a photo. `url` and `posterUrl` are relative to the server. */
@Serializable
data class PhoneMedia(
    /** video · photo */
    val kind: String = "photo",
    val url: String = "",
    val posterUrl: String? = null,
    val width: Double? = null,
    val height: Double? = null,
    val durationMs: Double? = null,
)

@Serializable
data class PhoneArticle(
    val title: String? = null,
    val description: String? = null,
    val url: String? = null,
)

@Serializable
data class PhoneMatch(
    /** strong · good · related */
    val strength: String = "related",
    val on: List<String> = emptyList(),
)

object PostKind {
    const val VIDEO = "video"
    const val AUDIO = "audio"
    const val PHOTO = "photo"
    const val ARTICLE = "article"
    const val TEXT = "text"

    fun plays(kind: String): Boolean = kind == VIDEO || kind == AUDIO
}

@Serializable
data class SavesResponse(
    val items: List<PhonePost> = emptyList(),
    val total: Int = 0,
    val nextOffset: Int? = null,
)

@Serializable
data class SavedPostResponse(val item: PhonePost)

@Serializable
data class SearchResponse(
    val items: List<PhonePost> = emptyList(),
    val total: Int = 0,
    /** false: meaning isn't ready on this server; these matched on exact words. */
    val understood: Boolean = true,
    /** false: nothing matched closely; these are the nearest. */
    val close: Boolean = true,
    val nextOffset: Int? = null,
)

@Serializable
data class ReasonBody(val reason: String? = null)

@Serializable
data class ErrorBody(
    val error: String? = null,
    val code: String? = null,
)

object KeepStatus {
    const val WAITING = "waiting"
    const val KEEPING = "keeping"
    const val KEPT = "kept"
    const val RETRYING = "retrying"
    const val UNAVAILABLE = "unavailable"
    const val OFF = "off"

    /** Not part of the API: `/api/app/status` answered 404 not_saved. */
    const val NOT_SAVED = "not_saved"

    fun isFinal(status: String?): Boolean =
        status == KEPT || status == UNAVAILABLE || status == OFF || status == NOT_SAVED
}
