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
import com.adhx.share.data.HistoryWriteException
import com.adhx.share.data.ShareState
import com.adhx.share.data.SettingsPrefs
import com.adhx.share.links.Links
import com.adhx.share.net.AdhxApi
import com.adhx.share.net.ApiResult
import com.adhx.share.net.AvatarRequest
import com.adhx.share.net.AvatarResponse
import com.adhx.share.net.AvatarSource
import com.adhx.share.net.PairResponse
import com.adhx.share.net.KeepStatus
import com.adhx.share.net.QueuedState
import com.adhx.share.ui.Copy
import com.adhx.share.work.SaveQueue
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.SharingStarted
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
    val storageError: StateFlow<String?> = store.storageError
    val items: StateFlow<List<HistoryItem>> = combine(store.connection, history.items, store.allowLegacyHistory) { account, rows, legacy ->
        if (account == null) emptyList() else rows.filter { it.belongsTo(account, legacy) }
    }.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

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
                    val problem = connectWith(server, result.value, name)
                    if (problem != null) showError(problem) else _connect.value = ConnectUi()
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

    /**
     * Keep a new phone key (from a pairing code or an emailed code): a
     * different account starts this phone over. Null when it's kept, else
     * what to say.
     */
    private fun connectWith(server: String, value: PairResponse, name: String?): String? {
        val next = Connection(
            server = server,
            key = value.key,
            username = value.username,
            phoneName = value.name ?: name,
        )
        val changedAccount = store.changesAccount(next)
        if (!store.save(next)) {
            return store.storageError.value ?: "Couldn’t keep your connection. Free some space and try again."
        }
        var problem: String? = null
        if (changedAccount) {
            SettingsPrefs.get(getApplication<Application>()).forgetAccount()
            SaveQueue.cancelAll(getApplication<Application>())
            try { history.clear() } catch (_: HistoryWriteException) {
                problem = "Connected, but couldn’t clear the old history. Free some space and reopen ADHX."
            }
        }
        _reach.value = Reach.Connected
        _avatarSource.value = null
        Welcome.pending = true
        return problem
    }

    // Sign in with email

    private val _email = MutableStateFlow(EmailSignInUi())
    val email: StateFlow<EmailSignInUi> = _email.asStateFlow()

    private fun phoneName(): String? = Build.MODEL?.trim()?.take(40)?.ifBlank { null }

    /** Email a 6-digit code for [emailInput]'s account on [serverInput]. */
    fun sendEmailCode(serverInput: String, emailInput: String) {
        if (_email.value.busy) return
        val server = Links.normalizeServer(serverInput)
        if (server == null) {
            _email.value = _email.value.copy(error = EmailSignIn.BAD_ADDRESS)
            return
        }
        val address = EmailSignIn.cleanEmail(emailInput)
        if (address == null) {
            _email.value = _email.value.copy(error = EmailSignIn.BAD_EMAIL)
            return
        }
        _email.value = _email.value.copy(server = server, email = address, busy = true, error = null)
        viewModelScope.launch {
            val result = AdhxApi(server, null).signIn(address, phoneName())
            val now = _email.value
            if (now.server != server || now.email != address) return@launch
            _email.value = when (result) {
                is ApiResult.Ok -> now.copy(step = SignInStep.Code, busy = false, sentAt = System.currentTimeMillis())
                // A code already went to this address in the last minute: type that one.
                is ApiResult.Failed -> if (EmailSignIn.codeAlreadySent(result.code)) {
                    now.copy(step = SignInStep.Code, busy = false, sentAt = if (now.step == SignInStep.Code) now.sentAt else System.currentTimeMillis(),
                        error = EmailSignIn.sendError(result.status, result.code, result.message, server))
                } else {
                    now.copy(busy = false, error = EmailSignIn.sendError(result.status, result.code, result.message, server))
                }
                ApiResult.Offline -> now.copy(busy = false, error = EmailSignIn.sendError(0, null, null, server, offline = true))
            }
        }
    }

    /** "Send a new code", once a minute has passed. */
    fun resendEmailCode() {
        val now = _email.value
        val server = now.server ?: return
        if (EmailSignIn.resendIn(now.sentAt, System.currentTimeMillis()) > 0) return
        sendEmailCode(server, now.email)
    }

    /** Spend the emailed code; on success the phone is connected exactly as after pairing. */
    fun verifyEmailCode(codeInput: String) {
        val now = _email.value
        val server = now.server ?: return
        if (now.busy) return
        val code = EmailSignIn.cleanCode(codeInput)
        if (code.length != EmailSignIn.CODE_LENGTH) return
        _email.value = now.copy(busy = true, error = null)
        viewModelScope.launch {
            val name = phoneName()
            val result = AdhxApi(server, null).verifySignIn(now.email, code, name)
            val current = _email.value
            _email.value = when (result) {
                is ApiResult.Ok -> {
                    val problem = connectWith(server, result.value, name)
                    if (problem == null) EmailSignInUi() else current.copy(busy = false, error = problem)
                }
                is ApiResult.Failed -> current.copy(busy = false, error = EmailSignIn.verifyError(result.status, result.code, result.message, server))
                ApiResult.Offline -> current.copy(busy = false, error = EmailSignIn.verifyError(0, null, null, server, offline = true))
            }
        }
    }

    /** Back from the code to the address and email. */
    fun emailBack() {
        _email.value = _email.value.copy(step = SignInStep.Email, busy = false, error = null)
    }

    // Your picture

    private val _avatarSource = MutableStateFlow<String?>(null)

    /** Where your picture comes from, as `/api/app/me` last said ([com.adhx.share.net.AvatarSource]); null until it says. */
    val avatarSource: StateFlow<String?> = _avatarSource.asStateFlow()

    private val _picture = MutableStateFlow(PictureUi())
    val picture: StateFlow<PictureUi> = _picture.asStateFlow()

    fun clearPictureError() {
        if (_picture.value.error != null) _picture.value = _picture.value.copy(error = null)
    }

    /** A photo, already cropped square, as your picture. */
    fun uploadPicture(jpeg: ByteArray, onDone: () -> Unit = {}) =
        changePicture(onDone) { it.uploadAvatar(jpeg) }

    /** A Gob face in [colour] ([GobColours]). */
    fun useGob(colour: String, onDone: () -> Unit = {}) =
        changePicture(onDone) { it.setAvatar(AvatarRequest(source = AvatarSource.GOB, colour = colour)) }

    /** Your X photo. 409 `no_x_picture` says there isn't one. */
    fun useXPhoto(onDone: () -> Unit = {}) =
        changePicture(onDone) { it.setAvatar(AvatarRequest(source = AvatarSource.X)) }

    /** No picture: the face drawn from your username. */
    fun removePicture(onDone: () -> Unit = {}) =
        changePicture(onDone) { it.removeAvatar() }

    private fun changePicture(onDone: () -> Unit, call: suspend (AdhxApi) -> ApiResult<AvatarResponse>) {
        if (_picture.value.busy) return
        val connection = store.current() ?: return
        _picture.value = PictureUi(busy = true)
        viewModelScope.launch {
            val result = call(AdhxApi(connection))
            if (!connection.sameCredential(store.current())) return@launch
            when (result) {
                is ApiResult.Ok -> {
                    val source = result.value.source ?: if (result.value.avatarUrl == null) AvatarSource.GENERATED else AvatarSource.UPLOAD
                    // Every "you" face reads the connection, so they all change at once.
                    store.updateIdentity(connection, null, null, result.value.avatarUrl)
                    _avatarSource.value = source
                    _picture.value = PictureUi()
                    checkMe()
                    onDone()
                }
                is ApiResult.Failed -> {
                    if (result.status == 401 || result.code == "bad_key") store.clear(removedByServer = true, expected = connection)
                    _picture.value = PictureUi(error = PictureCopy.error(result.status, result.code, result.message))
                }
                ApiResult.Offline -> _picture.value = PictureUi(error = PictureCopy.OFFLINE)
            }
        }
    }

    /** Ask the server who this key saves for. A removed key sends the app back to Connect. */
    fun checkMe() {
        val connection = store.current() ?: return
        viewModelScope.launch {
            val result = AdhxApi(connection).me()
            // Every completion (including revoked/offline) belongs to its requesting origin/key.
            if (!connection.sameCredential(store.current())) return@launch
            when (result) {
                is ApiResult.Ok -> {
                    _reach.value = Reach.Connected
                    store.updateIdentity(connection, result.value.username, result.value.name, result.value.avatarUrl)
                    _avatarSource.value = result.value.avatarSource
                }
                is ApiResult.Failed -> {
                    if (result.status == 401 || result.code == "bad_key") {
                        store.clear(removedByServer = true, expected = connection)
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
        // Recover publication intent after process death even when metadata/keeping already finished.
        items.value.filter { it.publishPending || it.queueId != null }.forEach {
            SaveQueue.enqueue(getApplication<Application>(), it.link, it.id, androidx.work.ExistingWorkPolicy.KEEP)
        }
        val pending = items.value.filter {
            (!it.publishPending && it.state == ShareState.SAVING && it.queueId != null) ||
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
            } catch (_: HistoryWriteException) {
                // The durable worker retries its unchanged receipt when space is available.
            } finally {
                refreshing = false
            }
        }
    }

    /** Returns how many links were waiting. */
    fun sendWaitingNow(): Int = SaveQueue.sendWaitingNow(getApplication<Application>())

    /** Forget the key and the history, and drop links still waiting. */
    fun disconnect(): Boolean {
        if (!store.clear()) return false
        _avatarSource.value = null
        _email.value = EmailSignInUi()
        SaveQueue.cancelAll(getApplication<Application>())
        try { history.clear() } catch (_: HistoryWriteException) {
            showError("Disconnected, but couldn’t clear the old history. Free some space and reopen ADHX.")
        }
        _reach.value = Reach.Checking
        return true
    }
}
