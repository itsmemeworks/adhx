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
