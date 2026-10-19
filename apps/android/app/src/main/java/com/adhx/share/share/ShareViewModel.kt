package com.adhx.share.share

import android.app.Application
import android.content.Context
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.adhx.share.data.Connection
import com.adhx.share.data.ConnectionStore
import com.adhx.share.data.HistoryStore
import com.adhx.share.data.SettingsPrefs
import com.adhx.share.data.ShareState
import com.adhx.share.links.Links
import com.adhx.share.net.AdhxApi
import com.adhx.share.net.ApiResult
import com.adhx.share.net.KeepStatus
import com.adhx.share.net.SaveResponse
import com.adhx.share.net.Saver
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
    /** "Just for me": no one else sees, counts or is told about this save. */
    val justForMe: Boolean = false,
    /** The switch is being sent to the server. */
    val switching: Boolean = false,
    /** Who will see it (your people), once known. */
    val people: List<Saver> = emptyList(),
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
    private var itemId: String? = null

    /** The switch as you set it, or null while untouched (then the server's answer stands). */
    @Volatile
    private var wanted: Boolean? = null

    /** "Just for me by default" on this phone, or null when it was never set here. */
    @Volatile
    private var phoneDefault: Boolean? = null

    /** Start saving what was shared. Safe to call again (after rotation): it only runs once. */
    fun start(sharedText: String?) {
        if (started) return
        started = true

        val context: Context = getApplication<Application>()
        val link = Links.firstLink(sharedText)
        val platform = link?.let(Links::guessPlatform)
        // This phone's "Just for me by default", when it has one; else the server's default stands.
        phoneDefault = SettingsPrefs.get(context).privateDefault
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
        val itemId = history.addShare(link, platform)
        this.itemId = itemId
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
                            justForMe = post.isPrivate,
                        )
                    }
                    pollStatus(connection, post, itemId)
                    loadPeople(connection)
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

    /**
     * The "Just for me" switch. Once the post is saved it's `POST
     * /api/app/private`; while the save is still on its way the choice is
     * applied when it lands; a link waiting offline sends `private` with it.
     */
    fun setJustForMe(on: Boolean) {
        val context: Context = getApplication<Application>()
        val now = _ui.value
        if (now.switching || now.justForMe == on) return
        wanted = on
        _ui.update { it.copy(justForMe = on) }
        val post = now.post
        val connection = ConnectionStore.get(context).current() ?: return
        when {
            post != null && post.platform.isNotBlank() && post.id.isNotBlank() -> {
                _ui.update { it.copy(switching = true) }
                viewModelScope.launch {
                    val result = AdhxApi(connection).setPrivate(post.platform, post.id, on)
                    _ui.update {
                        when (result) {
                            is ApiResult.Ok -> it.copy(switching = false, justForMe = result.value, post = post.copy(isPrivate = result.value))
                            // Didn't take: the switch goes back to what the save is.
                            else -> it.copy(switching = false, justForMe = post.isPrivate)
                        }
                    }
                    if (result !is ApiResult.Ok) wanted = post.isPrivate
                }
            }
            // Waiting on the phone: the worker reads this when it sends the link.
            now.phase == Phase.Offline -> HistoryStore.get(context).update(itemId) { it.copy(isPrivate = on) }
            // Still saving: [saveInBackground] applies it when the save comes back.
            else -> Unit
        }
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

    private fun saveInBackground(
        context: Context,
        connection: Connection,
        link: String,
        itemId: String,
    ): Deferred<ApiResult<SaveResponse>> = appScope.async {
        val history = HistoryStore.get(context)
        // Every 1.5 s while the sheet is open; after that, now and then, so
        // Shared lately catches up while the app is still around.
        val api = AdhxApi(connection)
        var result = api.saveAndFollow(
            link,
            interval = { if (open) 1_500L else 10_000L },
            // On by default here: sent as `private`. Off by default only goes out
            // once the post is known to be new (below), so a repeat share never
            // makes a private save shared.
            justForMe = wanted ?: (phoneDefault == true),
            explicit = wanted != null,
            onQueued = { id -> history.update(itemId) { it.queuedWith(id) } },
        )
        // The switch was flipped while saving, or a new save didn't come back
        // as this phone's default: apply it now, even if the sheet has closed.
        val done = result
        val want = wanted ?: phoneDefault?.takeIf { done is ApiResult.Ok && !done.value.alreadySaved }
        if (done is ApiResult.Ok && want != null && want != done.value.isPrivate && done.value.id.isNotBlank()) {
            val switched = api.setPrivate(done.value.platform, done.value.id, want)
            if (switched is ApiResult.Ok) result = ApiResult.Ok(done.value.copy(isPrivate = switched.value), done.status)
        }
        when (result) {
            is ApiResult.Ok -> history.update(itemId) { it.savedWith(result.value) }
            is ApiResult.Offline -> {
                val justForMe = wanted ?: (phoneDefault == true)
                history.update(itemId) { it.copy(state = ShareState.QUEUED, isPrivate = justForMe) }
                SaveQueue.enqueue(context, link, itemId, justForMe = justForMe)
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
