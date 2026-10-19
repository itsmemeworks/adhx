package com.adhx.share.main

import android.app.Application
import android.net.Uri
import android.os.Build
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.adhx.share.data.Connection
import com.adhx.share.data.ConnectionStore
import com.adhx.share.data.HistoryItem
import com.adhx.share.data.HistoryStore
import com.adhx.share.data.ShareState
import com.adhx.share.links.Links
import com.adhx.share.net.AdhxApi
import com.adhx.share.net.ApiResult
import com.adhx.share.net.KeepStatus
import com.adhx.share.net.QueuedState
import com.adhx.share.ui.Copy
import com.adhx.share.work.SaveQueue
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** How the server answered `GET /api/app/me` last. */
enum class Reach { Checking, Connected, Unreachable }

data class ConnectUi(val busy: Boolean = false, val error: String? = null)

/** A scanned or opened `adhx://pair?server=…&code=…` link. */
data class PairLink(val server: String, val code: String) {
    companion object {
        fun parse(text: String): PairLink? {
            val uri = try {
                Uri.parse(text.trim())
            } catch (e: Exception) {
                return null
            }
            if (!uri.scheme.equals("adhx", ignoreCase = true) || !uri.host.equals("pair", ignoreCase = true)) return null
            val server = uri.getQueryParameter("server")?.takeIf { it.isNotBlank() } ?: return null
            val code = uri.getQueryParameter("code")?.takeIf { it.isNotBlank() } ?: return null
            return PairLink(server, code)
        }
    }
}

class MainViewModel(app: Application) : AndroidViewModel(app) {

    private val store = ConnectionStore.get(app)
    private val history = HistoryStore.get(app)

    val connection: StateFlow<Connection?> = store.connection
    val removedNotice: StateFlow<Boolean> = store.removedNotice
    val items: StateFlow<List<HistoryItem>> = history.items

    private val _connect = MutableStateFlow(ConnectUi())
    val connect: StateFlow<ConnectUi> = _connect.asStateFlow()

    private val _reach = MutableStateFlow(Reach.Checking)
    val reach: StateFlow<Reach> = _reach.asStateFlow()

    private var refreshing = false

    fun lastServer(): String? = store.lastServer()

    fun showError(message: String) {
        _connect.value = ConnectUi(error = message)
    }

    /** A QR code's contents or an opened adhx:// link. */
    fun pairFromLink(text: String) {
        val link = PairLink.parse(text)
        if (link == null) {
            showError("That’s not an ADHX code. Use the one in Settings → Phone app on your ADHX.")
            return
        }
        pair(link.server, link.code)
    }

    fun pair(serverInput: String, codeInput: String) {
        if (_connect.value.busy) return
        val server = Links.normalizeServer(serverInput)
        if (server == null) {
            showError("That address doesn’t look right.")
            return
        }
        val code = codeInput.uppercase().filter { it.isLetterOrDigit() }
        if (code.length != 8) {
            showError("The code is 8 letters and numbers, like ABCD-EFGH.")
            return
        }

        _connect.value = ConnectUi(busy = true)
        viewModelScope.launch {
            val name = Build.MODEL?.trim()?.take(40)?.ifBlank { null }
            when (val result = AdhxApi(server, null).pair(code, name)) {
                is ApiResult.Ok -> {
                    val previous = store.lastServer()
                    if (previous != null && previous != server) {
                        // A different ADHX: the old list and queue belong to the old one.
                        SaveQueue.cancelAll(getApplication<Application>())
                        history.clear()
                    }
                    store.save(
                        Connection(
                            server = server,
                            key = result.value.key,
                            username = result.value.username,
                            phoneName = result.value.name ?: name,
                        ),
                    )
                    _reach.value = Reach.Connected
                    _connect.value = ConnectUi()
                }
                is ApiResult.Failed -> showError(
                    result.message?.takeIf { it.isNotBlank() }
                        ?: "That code didn’t work. Make a new one on your ADHX and try again.",
                )
                is ApiResult.Offline -> showError(
                    "Can’t reach ${Links.host(server)}. Check the address and that your phone is online.",
                )
            }
        }
    }

    /** Ask the server who this key saves for. A removed key sends the app back to Connect. */
    fun checkMe() {
        val connection = store.current() ?: return
        viewModelScope.launch {
            when (val result = AdhxApi(connection).me()) {
                is ApiResult.Ok -> {
                    _reach.value = Reach.Connected
                    store.updateIdentity(result.value.username, result.value.name)
                }
                is ApiResult.Failed -> {
                    if (result.status == 401 || result.code == "bad_key") {
                        if (store.current()?.key == connection.key) store.clear(removedByServer = true)
                    } else {
                        _reach.value = Reach.Unreachable
                    }
                }
                is ApiResult.Offline -> _reach.value = Reach.Unreachable
            }
        }
    }

    /** Ask `/api/app/status` about shares whose copy isn't finished yet. */
    fun refreshStatuses() {
        val connection = store.current() ?: return
        if (refreshing) return
        val pending = items.value.filter {
            (it.state == ShareState.SAVING && it.queueId != null) ||
                (it.state == ShareState.SAVED && !it.isFinal && it.platform != null && it.postId != null)
        }
        if (pending.isEmpty()) return
        refreshing = true
        viewModelScope.launch {
            try {
                val api = AdhxApi(connection)
                for (item in pending) {
                    val queueId = item.queueId
                    if (item.state == ShareState.SAVING && queueId != null) {
                        when (val result = api.queued(queueId)) {
                            is ApiResult.Ok -> {
                                _reach.value = Reach.Connected
                                val progress = result.value
                                when (progress.state) {
                                    QueuedState.SAVED -> progress.post?.let { post ->
                                        history.update(item.id) { it.savedWith(post) }
                                    }
                                    QueuedState.FAILED -> history.update(item.id) {
                                        it.copy(state = ShareState.FAILED, queueId = null,
                                            error = Copy.shareError(200, progress.code, progress.error))
                                    }
                                }
                            }
                            is ApiResult.Failed -> if (result.status == 404) {
                                history.update(item.id) {
                                    it.copy(state = ShareState.FAILED, queueId = null,
                                        error = Copy.shareError(404, result.code, result.message))
                                }
                            }
                            ApiResult.Offline -> break
                        }
                        continue
                    }
                    when (val result = api.status(item.platform!!, item.postId!!)) {
                        is ApiResult.Ok -> {
                            _reach.value = Reach.Connected
                            history.update(item.id) { it.withStatus(result.value) }
                        }
                        is ApiResult.Failed -> if (result.status == 404) {
                            history.update(item.id) { it.copy(keep = KeepStatus.NOT_SAVED) }
                        }
                        is ApiResult.Offline -> break
                    }
                }
            } finally {
                refreshing = false
            }
        }
    }

    /** Returns how many links were waiting. */
    fun sendWaitingNow(): Int = SaveQueue.sendWaitingNow(getApplication<Application>())

    /** Forget the key and the history, and drop links still waiting. */
    fun disconnect() {
        SaveQueue.cancelAll(getApplication<Application>())
        history.clear()
        store.clear()
        _reach.value = Reach.Checking
    }
}
