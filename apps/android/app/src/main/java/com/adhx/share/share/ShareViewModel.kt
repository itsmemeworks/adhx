package com.adhx.share.share

import android.app.Application
import android.content.Context
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.adhx.share.data.Connection
import com.adhx.share.data.ConnectionStore
import com.adhx.share.data.HistoryStore
import com.adhx.share.data.HistoryWriteException
import com.adhx.share.data.SettingsPrefs
import com.adhx.share.data.ShareState
import com.adhx.share.links.Links
import com.adhx.share.net.AdhxApi
import com.adhx.share.net.ApiResult
import com.adhx.share.net.KeepStatus
import com.adhx.share.net.SaveResponse
import com.adhx.share.net.Saver
import com.adhx.share.net.StatusResponse
import com.adhx.share.work.SaveQueue
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

enum class Phase { Saving, Saved, AlreadySaved, NotAPost, Offline, NotConnected, Failed }

data class ShareUi(
    val phase: Phase = Phase.Saving,
    /** The shared link, or null when the shared text had none. */
    val link: String? = null,
    /** The platform id: guessed from the link at first, then the server's. */
    val platform: String? = null,
    val server: String? = null,
    val post: SaveResponse? = null,
    val keep: StatusResponse? = null,
    val message: String? = null,
    /** "Just for me": no one else sees, counts or is told about this save. */
    val justForMe: Boolean = false,
    /** The switch is being sent to the server. */
    val switching: Boolean = false,
    /** Who will see it (your people), once known. */
    val people: List<Saver> = emptyList(),
)

class ShareViewModel(app: Application) : AndroidViewModel(app) {

    private val _ui = MutableStateFlow(ShareUi())
    val ui: StateFlow<ShareUi> = _ui.asStateFlow()

    private var started = false
    private var itemId: String? = null

    /** Start saving what was shared. Safe to call again (after rotation): it only runs once. */
    fun start(sharedText: String?) {
        if (started) return
        started = true

        val context: Context = getApplication<Application>()
        val link = Links.firstLink(sharedText)
        val platform = link?.let(Links::guessPlatform)
        // This phone's "Just for me by default", when it has one; else the server's default stands.
        val phoneDefault = SettingsPrefs.get(context).privateDefault
        _ui.value = ShareUi(link = link, platform = platform, justForMe = phoneDefault == true)

        val connection = ConnectionStore.get(context).current()
        if (connection == null) {
            _ui.update { it.copy(phase = Phase.NotConnected) }
            return
        }
        _ui.update { it.copy(server = connection.server) }
        if (link == null) {
            _ui.update { it.copy(phase = Phase.NotAPost) }
            return
        }

        val history = HistoryStore.get(context)
        val itemId = try {
            history.addShare(link, platform, privateDefault = phoneDefault, connection = connection)
        } catch (_: HistoryWriteException) {
            storageFailed()
            return
        }
        this.itemId = itemId
        // Durable work is registered before any network call. Closing/killing the sheet cannot lose intent.
        SaveQueue.enqueue(context, link, itemId)
        viewModelScope.launch {
            delay(15_000)
            try {
                history.update(itemId) {
                    if (it.state == ShareState.SAVING && it.queueId == null && it.postId == null)
                        it.copy(state = ShareState.QUEUED) else it
                }
            } catch (_: HistoryWriteException) { storageFailed() }
        }
        var polling = false
        viewModelScope.launch {
            history.items.collect { items ->
                val item = items.firstOrNull { it.id == itemId } ?: return@collect
                val post = item.asPost()
                _ui.update {
                    it.copy(
                        phase = when {
                            item.state == ShareState.FAILED && (item.errorStatus == 401 || item.errorCode == "bad_key") -> Phase.NotConnected
                            item.state == ShareState.FAILED && (item.errorStatus == 422 || item.errorCode == "not_a_post" || item.errorCode == "no_link") -> Phase.NotAPost
                            item.state == ShareState.FAILED -> Phase.Failed
                            item.state == ShareState.QUEUED -> Phase.Offline
                            post != null && !item.publishPending && item.queueId == null ->
                                if (item.alreadySaved) Phase.AlreadySaved else Phase.Saved
                            else -> Phase.Saving
                        },
                        post = post,
                        platform = item.platform ?: it.platform,
                        justForMe = if (item.publishPending) item.privateChoice ?: item.privateDefault ?: it.justForMe else item.isPrivate,
                        switching = item.publishPending && post != null,
                        message = item.error,
                    )
                }
                if (!polling && post != null && !item.publishPending && item.queueId == null) {
                    polling = true
                    pollStatus(connection, post, itemId)
                    loadPeople(connection)
                }
            }
        }
    }

    /** Persist the switch before scheduling its acknowledgement, even while metadata is still arriving. */
    fun setJustForMe(on: Boolean) {
        val context: Context = getApplication<Application>()
        val id = itemId ?: return
        val history = HistoryStore.get(context)
        val current = history.find(id) ?: return
        if (_ui.value.justForMe == on) return
        try { history.update(id) { it.choosePrivate(on) } }
        catch (_: HistoryWriteException) { storageFailed(); return }
        _ui.update { it.copy(justForMe = on) }
        // Append behind current work rather than cancelling a POST whose receipt is still arriving.
        SaveQueue.enqueue(context, current.link, id)
    }

    private fun storageFailed() {
        _ui.update { it.copy(phase = Phase.Failed,
            message = "Couldn’t remember that choice on this phone. Free some space and try again.") }
    }

    /** Your people's names for "Ana, Ben and Jo will see it" (from the channels list; quietly none on older servers). */
    private fun loadPeople(connection: Connection) {
        viewModelScope.launch {
            val result = AdhxApi(connection).channels()
            if (result is ApiResult.Ok) {
                _ui.update { it.copy(people = result.value.friends.map { f -> f.asSaver }) }
            }
        }
    }

    /** Ask how the copy is coming along every 1.5 s while the sheet is open. */
    private fun pollStatus(connection: Connection, post: SaveResponse, itemId: String) {
        if (post.platform.isBlank() || post.id.isBlank()) return
        val history = HistoryStore.get(getApplication<Application>())
        val api = AdhxApi(connection)
        viewModelScope.launch {
            while (isActive) {
                when (val result = api.status(post.platform, post.id)) {
                    is ApiResult.Ok -> {
                        val status = result.value
                        _ui.update { it.copy(keep = status) }
                        history.update(itemId) { it.withStatus(status) }
                        if (KeepStatus.isFinal(status.status)) return@launch
                    }
                    is ApiResult.Failed -> if (result.status == 404) {
                        history.update(itemId) { it.copy(keep = KeepStatus.NOT_SAVED) }
                        return@launch
                    }
                    is ApiResult.Offline -> Unit
                }
                delay(1_500)
            }
        }
    }
}
