package com.adhx.share.share

import android.app.Application
import android.content.Context
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.adhx.share.data.Connection
import com.adhx.share.data.ConnectionStore
import com.adhx.share.data.HistoryStore
import com.adhx.share.data.ShareState
import com.adhx.share.links.Links
import com.adhx.share.net.AdhxApi
import com.adhx.share.net.ApiResult
import com.adhx.share.net.KeepStatus
import com.adhx.share.net.SaveResponse
import com.adhx.share.net.StatusResponse
import com.adhx.share.ui.Copy
import com.adhx.share.work.SaveQueue
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
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
)

/**
 * Lives for the whole app process, so a save that's under way finishes (and
 * lands in the history or the queue) even when the sheet is closed early.
 */
private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

class ShareViewModel(app: Application) : AndroidViewModel(app) {

    private val _ui = MutableStateFlow(ShareUi())
    val ui: StateFlow<ShareUi> = _ui.asStateFlow()

    private var started = false

    /** Start saving what was shared. Safe to call again (after rotation): it only runs once. */
    fun start(sharedText: String?) {
        if (started) return
        started = true

        val context: Context = getApplication<Application>()
        val link = Links.firstLink(sharedText)
        val platform = link?.let(Links::guessPlatform)
        _ui.value = ShareUi(link = link, platform = platform)

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
        val itemId = history.addShare(link, platform)
        val pending = saveInBackground(context, connection, link, itemId)

        viewModelScope.launch {
            when (val result = pending.await()) {
                is ApiResult.Ok -> {
                    val post = result.value
                    _ui.update {
                        it.copy(
                            phase = if (post.alreadySaved) Phase.AlreadySaved else Phase.Saved,
                            post = post,
                            platform = post.platform.ifBlank { null } ?: it.platform,
                        )
                    }
                    pollStatus(connection, post, itemId)
                }
                is ApiResult.Offline -> _ui.update { it.copy(phase = Phase.Offline) }
                is ApiResult.Failed -> {
                    val phase = when {
                        result.status == 401 || result.code == "bad_key" -> {
                            ConnectionStore.get(context).clear(removedByServer = true)
                            Phase.NotConnected
                        }
                        result.code == AdhxApi.STILL_SAVING -> return@launch
                        result.status == 422 || result.code == "not_a_post" || result.code == "no_link" -> Phase.NotAPost
                        else -> Phase.Failed
                    }
                    _ui.update {
                        it.copy(phase = phase, message = result.message?.takeIf { m -> m.isNotBlank() })
                    }
                }
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

    private fun saveInBackground(
        context: Context,
        connection: Connection,
        link: String,
        itemId: String,
    ): Deferred<ApiResult<SaveResponse>> = appScope.async {
        val history = HistoryStore.get(context)
        // Every 1.5 s while the sheet is open; after that, now and then, so
        // Shared lately catches up while the app is still around.
        val result = AdhxApi(connection).saveAndFollow(link, interval = { if (open) 1_500L else 10_000L })
        when (result) {
            is ApiResult.Ok -> history.update(itemId) { it.savedWith(result.value) }
            is ApiResult.Offline -> {
                history.update(itemId) { it.copy(state = ShareState.QUEUED) }
                SaveQueue.enqueue(context, link, itemId)
            }
            is ApiResult.Failed -> if (result.code != AdhxApi.STILL_SAVING) {
                history.update(itemId) {
                    it.copy(state = ShareState.FAILED, error = Copy.shareError(result.status, result.code, result.message))
                }
            }
        }
        result
    }

    /** False once the sheet is gone: the save carries on, polled less often. */
    @Volatile
    private var open = true

    override fun onCleared() {
        open = false
    }
}
