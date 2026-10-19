package com.adhx.share.data

import android.content.Context
import com.adhx.share.net.AdhxApi
import com.adhx.share.net.KeepStatus
import com.adhx.share.net.SaveResponse
import com.adhx.share.net.StatusResponse
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import java.util.UUID

/** Delivery must stop before network work when its intent could not reach disk. */
class HistoryWriteException : IllegalStateException("Could not persist queued share")

/** One link shared to ADHX from this phone. */
@Serializable
data class HistoryItem(
    val id: String,
    val link: String,
    val sharedAt: Long,
    /** saving · queued · saved · failed — see [ShareState]. */
    val state: String = ShareState.SAVING,
    /** Server queue receipt, retained across app/worker restarts. */
    val queueId: String? = null,
    val platform: String? = null,
    val network: String? = null,
    val postId: String? = null,
    val author: String? = null,
    val authorName: String? = null,
    val text: String? = null,
    val posterUrl: String? = null,
    val openPath: String? = null,
    val alreadySaved: Boolean = false,
    val savedAt: String? = null,
    /** The server's keep status (waiting, keeping, kept…), once saved. */
    val keep: String? = null,
    val percent: Int? = null,
    val quality: String? = null,
    val videos: Int = 0,
    val photos: Int = 0,
    val audio: Int = 0,
    val error: String? = null,
    val errorStatus: Int? = null,
    val errorCode: String? = null,
    /** Shared "Just for me": sent as `private` with the save (the offline queue too). */
    val isPrivate: Boolean = false,
    /** Nullable preserves omitted/default semantics, including existing private repeats. */
    val privateChoice: Boolean? = null,
    val privateDefault: Boolean? = null,
    val publishPending: Boolean = false,
    /** Reused on retries; incremented only for a changed user intent. */
    val privacyIntentVersion: Long = 1,
    /** Bind waiting work to its account, without persisting the phone secret here. */
    val ownerServer: String? = null,
    val ownerUsername: String? = null,
) {
    internal fun belongsTo(connection: Connection, allowLegacy: Boolean): Boolean =
        if (ownerServer == null && ownerUsername == null) allowLegacy
        else ownerServer == connection.server && ownerUsername == connection.username

    /** Nothing more will change, so there's no need to ask the server again. */
    val isFinal: Boolean
        get() = when (state) {
            ShareState.FAILED -> true
            ShareState.SAVED -> !publishPending && queueId == null && KeepStatus.isFinal(keep)
            else -> false
        }

    fun savedWith(post: SaveResponse): HistoryItem = copy(
        state = ShareState.SAVED,
        queueId = if (publishPending) queueId else null,
        platform = post.platform.ifBlank { platform },
        network = post.network ?: network,
        postId = post.id.ifBlank { null },
        author = post.author,
        authorName = post.authorName,
        text = post.text,
        posterUrl = post.posterUrl,
        openPath = post.openPath,
        alreadySaved = post.alreadySaved,
        savedAt = post.savedAt,
        isPrivate = if (publishPending) privateChoice ?: privateDefault ?: post.isPrivate else post.isPrivate,
        keep = keep ?: KeepStatus.WAITING,
        error = null, errorStatus = null, errorCode = null,
    )

    /** Untouched false defaults apply to new saves only; explicit false applies to repeats too. */
    fun publicationChoice(post: SaveResponse): Boolean? =
        privateChoice ?: privateDefault?.takeIf { !post.alreadySaved || it }

    fun choosePrivate(on: Boolean): HistoryItem = copy(
        isPrivate = on, privateChoice = on, publishPending = true, privacyIntentVersion = privacyIntentVersion + 1,
        error = null, errorStatus = null, errorCode = null,
    )

    fun acknowledged(choice: Boolean?, post: SaveResponse, version: Long): HistoryItem {
        // A newer toggle made during the request still needs its own acknowledgement.
        if (privacyIntentVersion != version || publicationChoice(post) != choice) return this
        return copy(publishPending = false, isPrivate = choice ?: post.isPrivate)
    }

    fun asPost(): SaveResponse? = postId?.let { post ->
        SaveResponse(platform = platform.orEmpty(), id = post, network = network, author = author,
            authorName = authorName, text = text, posterUrl = posterUrl, openPath = openPath,
            alreadySaved = alreadySaved, savedAt = savedAt, isPrivate = isPrivate)
    }

    fun queuedWith(id: String): HistoryItem = copy(state = ShareState.SAVING, queueId = id)

    fun withStatus(status: StatusResponse): HistoryItem = copy(
        keep = status.status,
        percent = status.percent,
        quality = status.quality,
        videos = status.kept?.videos ?: videos,
        photos = status.kept?.photos ?: photos,
        audio = status.kept?.audio ?: audio,
    )
}

object ShareState {
    const val SAVING = "saving"
    const val QUEUED = "queued"
    const val SAVED = "saved"
    const val FAILED = "failed"
}

/** Recent shares plus every unfinished delivery, as JSON in SharedPreferences. */
class HistoryStore private constructor(context: Context) {

    private val prefs = context.getSharedPreferences(FILE, Context.MODE_PRIVATE)
    private val lock = Any()
    private val _items = MutableStateFlow(load())
    val items: StateFlow<List<HistoryItem>> = _items.asStateFlow()

    fun find(id: String?): HistoryItem? = id?.let { wanted -> _items.value.firstOrNull { it.id == wanted } }

    /**
     * Add a fresh share at the top. Sharing the same link again moves it up
     * instead of listing it twice. Returns the item's id.
     */
    fun addShare(link: String, platform: String?, state: String = ShareState.SAVING, privateDefault: Boolean? = null, connection: Connection? = null, allowLegacy: Boolean = true): String {
        synchronized(lock) {
            val existing = _items.value.firstOrNull { it.link == link &&
                (connection == null || it.belongsTo(connection, allowLegacy)) }
            if (existing != null && (existing.publishPending || existing.state == ShareState.SAVING || existing.state == ShareState.QUEUED)) return existing.id
            val item = HistoryItem(id = UUID.randomUUID().toString(), link = link, sharedAt = 0)
                .copy(sharedAt = System.currentTimeMillis(), state = state, platform = existing?.platform ?: platform, error = null,
                    privateDefault = privateDefault, publishPending = true, privateChoice = null,
                    isPrivate = privateDefault ?: existing?.isPrivate ?: false,
                    ownerServer = connection?.server, ownerUsername = connection?.username)
            val list = listOf(item) + _items.value.filter { it.link != link }
            // Active receipts/intent are durable work, never evicted by the recent-history cap.
            val durable = list.filter { it.publishPending || it.queueId != null || it.state == ShareState.SAVING || it.state == ShareState.QUEUED }
            write(durable + list.filter { it !in durable }.take(MAX))
            return item.id
        }
    }

    fun update(id: String?, transform: (HistoryItem) -> HistoryItem) {
        if (id == null) return
        synchronized(lock) {
            val list = _items.value
            if (list.none { it.id == id }) return
            write(list.map { if (it.id == id) transform(it) else it })
        }
    }

    fun clear() {
        synchronized(lock) { write(emptyList()) }
    }

    private fun write(list: List<HistoryItem>) {
        val edit = prefs.edit().putString(K_ITEMS, AdhxApi.json.encodeToString(serializer, list))
        // Only delivery changes require a synchronous durability boundary. Frequent keep-progress
        // updates remain asynchronous, so a slow flash write cannot stall the share UI each poll.
        fun deliveryState(items: List<HistoryItem>) = items.associate { item ->
            item.id to listOf(item.queueId, item.privateChoice, item.privateDefault, item.publishPending, item.privacyIntentVersion,
                item.ownerServer, item.ownerUsername)
        }
        if (deliveryState(list) != deliveryState(_items.value)) {
            if (!edit.commit()) throw HistoryWriteException()
        } else edit.apply()
        _items.value = list
    }

    private fun load(): List<HistoryItem> {
        val text = prefs.getString(K_ITEMS, null) ?: return emptyList()
        return try {
            AdhxApi.json.decodeFromString(serializer, text)
        } catch (e: IllegalArgumentException) {
            emptyList()
        }
    }

    companion object {
        private const val FILE = "adhx_history"
        private const val K_ITEMS = "items"
        private const val MAX = 50
        private val serializer = ListSerializer(HistoryItem.serializer())

        @Volatile
        private var instance: HistoryStore? = null

        fun get(context: Context): HistoryStore =
            instance ?: synchronized(this) {
                instance ?: HistoryStore(context.applicationContext).also { instance = it }
            }
    }
}
