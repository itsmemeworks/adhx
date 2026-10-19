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
    /** The server's keep status (waiting, keeping, kept…), once saved. */
    val keep: String? = null,
    val percent: Int? = null,
    val quality: String? = null,
    val videos: Int = 0,
    val photos: Int = 0,
    val audio: Int = 0,
    val error: String? = null,
    /** Shared "Just for me": sent as `private` with the save (the offline queue too). */
    val isPrivate: Boolean = false,
) {
    /** Nothing more will change, so there's no need to ask the server again. */
    val isFinal: Boolean
        get() = when (state) {
            ShareState.FAILED -> true
            ShareState.SAVED -> KeepStatus.isFinal(keep)
            else -> false
        }

    fun savedWith(post: SaveResponse): HistoryItem = copy(
        state = ShareState.SAVED,
        queueId = null,
        platform = post.platform.ifBlank { platform },
        network = post.network ?: network,
        postId = post.id.ifBlank { null },
        author = post.author,
        authorName = post.authorName,
        text = post.text,
        posterUrl = post.posterUrl,
        openPath = post.openPath,
        alreadySaved = post.alreadySaved,
        isPrivate = post.isPrivate,
        keep = keep ?: KeepStatus.WAITING,
        error = null,
    )

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

/** The last 50 shares, as a small JSON list in SharedPreferences. */
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
    fun addShare(link: String, platform: String?, state: String = ShareState.SAVING): String {
        synchronized(lock) {
            val existing = _items.value.firstOrNull { it.link == link }
            val item = (existing ?: HistoryItem(id = UUID.randomUUID().toString(), link = link, sharedAt = 0))
                .copy(sharedAt = System.currentTimeMillis(), state = state, platform = existing?.platform ?: platform, error = null)
            val list = listOf(item) + _items.value.filter { it.id != item.id }
            write(list.take(MAX))
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
        val receiptChanged = list.any { next ->
            next.queueId != null && _items.value.firstOrNull { it.id == next.id }?.queueId != next.queueId
        }
        val edit = prefs.edit().putString(K_ITEMS, AdhxApi.json.encodeToString(serializer, list))
        // Persist a new server receipt before a worker can be stopped and retried.
        if (receiptChanged) edit.commit() else edit.apply()
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
