package com.adhx.share.doing

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.adhx.share.data.ConnectionStore
import com.adhx.share.net.AdhxApi
import com.adhx.share.net.ApiResult
import com.adhx.share.net.DoingItem
import com.adhx.share.net.DoingResponse
import com.adhx.share.ui.SettingsCopy
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class DoingUi(
    val view: DoingResponse? = null,
    /** The server has no `/api/app/doing` (404): nothing to show, stop asking. */
    val unavailable: Boolean = false,
    val error: String? = null,
    /** Posts whose Retry is being sent, by key. */
    val retrying: Set<String> = emptySet(),
    /** What the last Retry said, by key. */
    val notes: Map<String, String> = emptyMap(),
) {
    val onTheirWay: Int get() = view?.summary?.onTheirWay ?: 0
    val needsYou: Int get() = view?.summary?.needsYou ?: 0
    val items: List<DoingItem> get() = view?.items.orEmpty()
}

/**
 * "On their way" (`GET /api/app/doing`): the pill over the player, its
 * sheet, the full list, and the count in Settings. Asked about every 5 s
 * while one of them is on screen ([poll]).
 */
class DoingViewModel(app: Application) : AndroidViewModel(app) {

    private val store = ConnectionStore.get(app)
    private val _ui = MutableStateFlow(DoingUi())
    val ui: StateFlow<DoingUi> = _ui.asStateFlow()

    private var loading = false

    init {
        store.connection
            .map { it?.server to it?.key }
            .distinctUntilChanged()
            .onEach { _ui.value = DoingUi() }
            .launchIn(viewModelScope)
    }

    /**
     * Ask now, then every [POLL_MS] while posts are on their way and every
     * [IDLE_MS] while nothing is, until cancelled (the caller leaves the
     * screen) or the server turns out not to have it.
     */
    suspend fun poll() {
        while (!_ui.value.unavailable && store.current() != null) {
            load()
            delay(if (_ui.value.onTheirWay > 0) POLL_MS else IDLE_MS)
        }
    }

    fun refresh() {
        viewModelScope.launch { load() }
    }

    private suspend fun load() {
        val connection = store.current() ?: return
        if (loading) return
        loading = true
        try {
            when (val result = AdhxApi(connection).doing()) {
                is ApiResult.Ok -> _ui.update { it.copy(view = result.value, error = null) }
                is ApiResult.Failed -> when {
                    result.status == 401 || result.code == "bad_key" -> {
                        if (store.current()?.key == connection.key) store.clear(removedByServer = true)
                    }
                    result.status == 404 -> _ui.update { it.copy(unavailable = true) }
                    else -> _ui.update { it.copy(error = result.message ?: SettingsCopy.DOING_CANT_LOAD) }
                }
                ApiResult.Offline -> _ui.update { it.copy(error = SettingsCopy.DOING_CANT_LOAD) }
            }
        } finally {
            loading = false
        }
    }

    /** Retry for a stuck post you saved (`POST /api/app/doing/retry`). */
    fun retry(item: DoingItem) {
        val connection = store.current() ?: return
        if (item.key in _ui.value.retrying) return
        _ui.update { it.copy(retrying = it.retrying + item.key, notes = it.notes - item.key) }
        viewModelScope.launch {
            val note = when (val result = AdhxApi(connection).retry(item.platform, item.id)) {
                is ApiResult.Ok -> if (result.value.retried) SettingsCopy.RETRYING else SettingsCopy.ALREADY_ON_ITS_WAY
                is ApiResult.Failed -> result.message ?: SettingsCopy.DECISION_FAILED
                ApiResult.Offline -> SettingsCopy.DOING_CANT_LOAD
            }
            _ui.update { it.copy(retrying = it.retrying - item.key, notes = it.notes + (item.key to note)) }
            load()
        }
    }

    companion object {
        const val POLL_MS = 5_000L
        const val IDLE_MS = 15_000L
    }
}
