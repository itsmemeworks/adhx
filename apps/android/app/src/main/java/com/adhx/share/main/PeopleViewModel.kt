package com.adhx.share.main

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.adhx.share.data.ConnectionStore
import com.adhx.share.net.AdhxApi
import com.adhx.share.net.ApiResult
import com.adhx.share.net.JoinDecision
import com.adhx.share.net.JoinRequest
import com.adhx.share.net.PeopleResponse
import com.adhx.share.ui.SettingsCopy
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class PeopleUi(
    val people: PeopleResponse? = null,
    val loading: Boolean = false,
    /** The server has no `/api/app/people` yet (404). */
    val unavailable: Boolean = false,
    val error: String? = null,
    /** Join requests being answered, by id. */
    val deciding: Set<String> = emptySet(),
    /** What went wrong answering one, by id. */
    val decisionErrors: Map<String, String> = emptyMap(),
)

/**
 * Settings → Your people (`GET /api/app/people`) and, for an admin, the
 * join requests waiting for an answer (`POST /api/app/people/requests/{id}`).
 */
class PeopleViewModel(app: Application) : AndroidViewModel(app) {

    private val store = ConnectionStore.get(app)
    private val _ui = MutableStateFlow(PeopleUi())
    val ui: StateFlow<PeopleUi> = _ui.asStateFlow()

    init {
        store.connection
            .map { it?.server to it?.key }
            .distinctUntilChanged()
            .onEach { _ui.value = PeopleUi() }
            .launchIn(viewModelScope)
    }

    fun load() {
        val connection = store.current() ?: return
        if (_ui.value.loading) return
        _ui.update { it.copy(loading = true) }
        viewModelScope.launch {
            val result = AdhxApi(connection).people()
            _ui.update {
                when (result) {
                    is ApiResult.Ok -> it.copy(people = result.value, loading = false, error = null, unavailable = false)
                    is ApiResult.Failed -> when {
                        result.status == 404 -> it.copy(loading = false, unavailable = true)
                        else -> it.copy(loading = false, error = result.message ?: SettingsCopy.PEOPLE_CANT_LOAD)
                    }
                    ApiResult.Offline -> it.copy(loading = false, error = SettingsCopy.PEOPLE_CANT_LOAD)
                }
            }
            if (result is ApiResult.Failed && (result.status == 401 || result.code == "bad_key")) {
                store.clear(removedByServer = true, expected = connection)
            }
        }
    }

    /** Let in, Not now or Decline ([JoinDecision]). The card goes once the server agrees. */
    fun decide(request: JoinRequest, decision: String) {
        val connection = store.current() ?: return
        if (request.id in _ui.value.deciding) return
        _ui.update { it.copy(deciding = it.deciding + request.id, decisionErrors = it.decisionErrors - request.id) }
        viewModelScope.launch {
            val result = AdhxApi(connection).decideJoin(request.id, decision)
            _ui.update { now ->
                val done = now.copy(deciding = now.deciding - request.id)
                when {
                    // Answered, or nobody is waiting with that invite any more: either way the card goes.
                    result is ApiResult.Ok || (result is ApiResult.Failed && result.status == 404) -> done.copy(
                        people = done.people?.let { p -> p.copy(requests = p.requests.filterNot { it.id == request.id }) },
                    )
                    result is ApiResult.Failed -> done.copy(
                        decisionErrors = done.decisionErrors + (request.id to (result.message ?: SettingsCopy.DECISION_FAILED)),
                    )
                    else -> done.copy(decisionErrors = done.decisionErrors + (request.id to SettingsCopy.DECISION_FAILED))
                }
            }
            // Let in: they join the list of people.
            if (result is ApiResult.Ok && decision == JoinDecision.APPROVE) load()
        }
    }
}
