package com.adhx.share.library

import android.app.Application
import androidx.compose.runtime.mutableStateListOf
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.adhx.share.data.Connection
import com.adhx.share.data.ConnectionStore
import com.adhx.share.net.AdhxApi
import com.adhx.share.net.ApiResult
import com.adhx.share.net.PhonePost
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** Where the app is. The last entry of [LibraryViewModel.stack] is on screen. */
sealed interface Route {
    /** My saves: the player, and the home screen. */
    data object Saves : Route
    data object Search : Route

    /** The player on the search results, from the one tapped. */
    data class SearchPlayer(val start: Int) : Route
    data object SharedLately : Route

    /** One post from Shared lately, in the player. */
    data class Post(val post: PhonePost) : Route
    data object Settings : Route
}

data class SavesUi(
    val items: List<PhonePost> = emptyList(),
    val total: Int = 0,
    val nextOffset: Int? = 0,
    val loading: Boolean = false,
    val loadedOnce: Boolean = false,
    val error: String? = null,
    /** Saves that arrived above the one on screen since the last reload (the "N new saves" pill). */
    val newOnTop: Int = 0,
)

data class SearchUi(
    /** What's in the field. */
    val query: String = "",
    /** What these results are for. */
    val searched: String = "",
    val items: List<PhonePost> = emptyList(),
    val total: Int = 0,
    val understood: Boolean = true,
    val close: Boolean = true,
    val nextOffset: Int? = null,
    val loading: Boolean = false,
    val error: String? = null,
) {
    /** The line over the results, if there is something to say about them. */
    val note: String?
        get() = when {
            loading || error != null || items.isEmpty() -> null
            !understood -> STILL_LEARNING
            !close -> NOTHING_CLOSE
            else -> null
        }

    companion object {
        const val STILL_LEARNING = "Still learning your saves: exact words only for now"
        const val NOTHING_CLOSE = "Nothing close; nearest first"
        const val NO_RESULTS = "Nothing in your saves matches that yet. Try describing it another way."
    }
}

/** My saves for the player, search by meaning, and the screen stack. */
@OptIn(FlowPreview::class, ExperimentalCoroutinesApi::class)
class LibraryViewModel(app: Application) : AndroidViewModel(app) {

    private val store = ConnectionStore.get(app)

    val stack = mutableStateListOf<Route>(Route.Saves)

    private val _saves = MutableStateFlow(SavesUi())
    val saves: StateFlow<SavesUi> = _saves.asStateFlow()

    /** The page of My saves on screen, so the player comes back to it. */
    var savesPage = 0

    private val query = MutableStateFlow("")
    private val searchMore = MutableStateFlow<SearchUi?>(null)
    private var savesJob: Job? = null
    private var moreJob: Job? = null

    private val searchFirst: StateFlow<SearchUi> = query
        .map { it.trim() }
        .distinctUntilChanged()
        .debounce { if (it.isEmpty()) 0L else DEBOUNCE_MS }
        .flatMapLatest { q -> if (q.isEmpty()) flowOf(SearchUi()) else runSearch(q) }
        .onEach { searchMore.value = null }
        .stateIn(viewModelScope, SharingStarted.Eagerly, SearchUi())

    /** The search results, with any further pages loaded on the end. */
    val search: StateFlow<SearchUi> = combine(query, searchFirst, searchMore) { typed, first, more ->
        (more ?: first).copy(query = typed)
    }.stateIn(viewModelScope, SharingStarted.Eagerly, SearchUi())

    init {
        // A new pairing (or Disconnect) starts the library over.
        store.connection
            .map { it?.server to it?.key }
            .distinctUntilChanged()
            .onEach { (server, key) ->
                savesJob?.cancel()
                moreJob?.cancel()
                _saves.value = SavesUi()
                savesPage = 0
                query.value = ""
                stack.clear()
                stack.add(Route.Saves)
                if (server != null && key != null) loadMoreSaves()
            }
            .launchIn(viewModelScope)
    }

    fun open(route: Route) {
        stack.add(route)
    }

    /** Back: true when there was somewhere to go back to. */
    fun back(): Boolean {
        if (stack.size <= 1) return false
        stack.removeAt(stack.lastIndex)
        return true
    }

    // My saves

    fun loadMoreSaves() {
        val now = _saves.value
        val offset = now.nextOffset ?: return
        if (now.loading) return
        val connection = store.current() ?: return
        _saves.value = now.copy(loading = true, error = null)
        savesJob = viewModelScope.launch {
            val result = AdhxApi(connection).saves(offset)
            val current = _saves.value
            _saves.value = when (result) {
                is ApiResult.Ok -> {
                    // Pages can overlap when something was saved meanwhile.
                    val seen = current.items.mapTo(HashSet()) { it.key }
                    current.copy(
                        items = current.items + result.value.items.filter { it.key !in seen },
                        total = result.value.total,
                        nextOffset = result.value.nextOffset,
                        loading = false,
                        loadedOnce = true,
                    )
                }
                is ApiResult.Failed -> {
                    signedOut(result, connection)
                    current.copy(loading = false, loadedOnce = true, error = result.message ?: CANT_LOAD)
                }
                ApiResult.Offline -> current.copy(loading = false, loadedOnce = true, error = OFFLINE)
            }
        }
    }

    /** The player is at [page]: fetch the next page when it's close to the end. */
    fun onSavesPage(page: Int) {
        savesPage = page
        val now = _saves.value
        if (now.error == null && page >= now.items.size - NEAR_END) loadMoreSaves()
    }

    /** Back in the app at the top of My saves: show anything saved meanwhile. */
    /**
     * Back in the app: put anything saved meanwhile on top. At the top, the
     * player shows it; further down, it counts them for the "new saves" pill
     * and the post on screen stays put.
     */
    fun refreshSaves() {
        val now = _saves.value
        if (now.loading) return
        if (now.error != null || !now.loadedOnce) {
            reloadSaves()
            return
        }
        val connection = store.current() ?: return
        savesJob = viewModelScope.launch {
            val result = AdhxApi(connection).saves(0)
            val current = _saves.value
            if (result is ApiResult.Ok && !current.loading) {
                val had = current.items.mapTo(HashSet()) { it.key }
                val firstHad = current.items.firstOrNull()?.key
                val above = result.value.items.takeWhile { it.key != firstHad }.filter { it.key !in had }
                if (above.isEmpty()) return@launch
                _saves.value = current.copy(
                    items = above + current.items,
                    total = result.value.total,
                    // The server's offsets moved down by as many as arrived.
                    nextOffset = current.nextOffset?.plus(above.size),
                    newOnTop = if (savesPage == 0) 0 else current.newOnTop + above.size,
                )
            } else if (result is ApiResult.Failed) {
                signedOut(result, connection)
            }
        }
    }

    /** The top of My saves was reached: nothing new is waiting above. */
    fun seenTop() {
        if (_saves.value.newOnTop != 0) _saves.value = _saves.value.copy(newOnTop = 0)
    }

    fun reloadSaves() {
        savesJob?.cancel()
        savesPage = 0
        _saves.value = SavesUi()
        loadMoreSaves()
    }

    /** One save for the player (from Shared lately). */
    suspend fun post(platform: String, id: String): ApiResult<PhonePost> {
        val connection = store.current() ?: return ApiResult.Offline
        return when (val result = AdhxApi(connection).post(platform, id)) {
            is ApiResult.Ok -> ApiResult.Ok(result.value.item, result.status)
            is ApiResult.Failed -> {
                signedOut(result, connection)
                result
            }
            ApiResult.Offline -> ApiResult.Offline
        }
    }

    // Search

    fun setQuery(text: String) {
        if (text.trim() != query.value.trim()) {
            moreJob?.cancel()
            searchMore.value = null
        }
        query.value = text
    }

    /** The results player is at [page]: fetch more results near the end. */
    fun onSearchPage(page: Int) {
        val now = search.value
        if (page >= now.items.size - NEAR_END) loadMoreSearch()
    }

    fun loadMoreSearch() {
        val now = search.value
        val offset = now.nextOffset ?: return
        if (now.loading || moreJob?.isActive == true || now.query.isBlank()) return
        val connection = store.current() ?: return
        val q = now.query.trim()
        moreJob = viewModelScope.launch {
            val result = AdhxApi(connection).search(q, offset)
            val current = search.value
            if (current.query.trim() != q) return@launch
            when (result) {
                is ApiResult.Ok -> {
                    val seen = current.items.mapTo(HashSet()) { it.key }
                    searchMore.value = current.copy(
                        items = current.items + result.value.items.filter { it.key !in seen },
                        nextOffset = result.value.nextOffset,
                    )
                }
                is ApiResult.Failed -> {
                    signedOut(result, connection)
                    searchMore.value = current.copy(nextOffset = null)
                }
                ApiResult.Offline -> Unit
            }
        }
    }

    private fun runSearch(q: String) = flow {
        val connection = store.current()
        if (connection == null) {
            emit(SearchUi(query = q))
            return@flow
        }
        emit(SearchUi(query = q, searched = q, loading = true))
        val ui = when (val result = AdhxApi(connection).search(q)) {
            is ApiResult.Ok -> SearchUi(
                query = q,
                searched = q,
                items = result.value.items,
                total = result.value.total,
                understood = result.value.understood,
                close = result.value.close,
                nextOffset = result.value.nextOffset,
            )
            is ApiResult.Failed -> {
                signedOut(result, connection)
                SearchUi(query = q, searched = q, error = result.message ?: CANT_SEARCH)
            }
            ApiResult.Offline -> SearchUi(query = q, searched = q, error = OFFLINE)
        }
        emit(ui)
    }

    /** A removed key sends the app back to Connect, which says why. */
    private fun signedOut(result: ApiResult.Failed, connection: Connection) {
        if (result.status == 401 || result.code == "bad_key") {
            if (store.current()?.key == connection.key) store.clear(removedByServer = true)
        }
    }

    companion object {
        private const val DEBOUNCE_MS = 350L
        private const val NEAR_END = 5
        const val OFFLINE = "Can’t reach your ADHX right now."
        private const val CANT_LOAD = "Your saves didn’t load. Try again."
        private const val CANT_SEARCH = "Search didn’t work just now. Try again."
    }
}
