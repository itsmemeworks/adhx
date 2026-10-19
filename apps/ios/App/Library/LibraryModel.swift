import Foundation

/// Your saves for the player, page by page, and search by meaning over them
/// (`/api/app/saves`, `/api/app/search`). The server does the work; this keeps
/// what's on screen.
@MainActor
final class LibraryModel: ObservableObject {
    // My saves
    @Published private(set) var saves: [PhonePost] = []
    @Published private(set) var loadedOnce = false
    @Published private(set) var loading = false
    @Published private(set) var loadError: String?
    /// Saves that arrived at the top since you last looked (from a share, the
    /// web, or a sync), shown as a pill that jumps to them.
    @Published var newAtTop = 0
    /// Saves on their way (still being kept on the server), not in `saves` yet.
    @Published private(set) var preparing = 0
    private var nextOffset: Int? = 0

    // Search
    @Published var query = "" {
        didSet { if query != oldValue { scheduleSearch() } }
    }
    @Published private(set) var results: [PhonePost] = []
    @Published private(set) var searching = false
    @Published private(set) var searched = false
    @Published private(set) var understood = true
    @Published private(set) var close = true
    @Published private(set) var searchError: String?
    @Published private(set) var loadingMoreSearch = false
    @Published private(set) var searchMoreError: String?
    private var searchTask: Task<Void, Never>?
    private var searchMoreTask: Task<Void, Never>?
    private var nextSearchOffset: Int?
    private var searchGeneration = UUID()

    /// The phone was removed on the server.
    var onBadKey: () -> Void = {}

    /// From the top: on open, pull to refresh, back in the foreground.
    func reload() async {
        nextOffset = 0
        await loadMore(replacing: true)
    }

    /// The next page, when the player gets near the end.
    func loadMoreIfNeeded(at index: Int) {
        guard index >= saves.count - 4, nextOffset != nil, !loading else { return }
        Task { await loadMore(replacing: false) }
    }

    private func loadMore(replacing: Bool) async {
        guard let offset = nextOffset, let client = Store.client() else { return }
        loading = true
        defer { loading = false }
        do {
            let page = try await client.saves(offset: offset)
            if replacing { preparing = page.preparing ?? 0 }
            if replacing {
                if loadedOnce, let firstOld = saves.first?.key {
                    let fresh = page.items.prefix { $0.key != firstOld }.count
                    if fresh > 0, fresh < page.items.count { newAtTop = fresh }
                }
                saves = page.items
            } else {
                let have = Set(saves.map(\.key))
                saves += page.items.filter { !have.contains($0.key) }
            }
            nextOffset = page.nextOffset
            loadError = nil
        } catch APIError.badKey {
            onBadKey()
        } catch is CancellationError {
            return
        } catch let error as APIError {
            loadError = error.message
        } catch {
            loadError = APIError.offline.message
        }
        loadedOnce = true
    }

    /// One save, to open from Shared lately.
    func post(platform: String, id: String) async -> PhonePost? {
        guard let client = Store.client() else { return nil }
        do {
            return try await client.post(platform: platform, id: id)
        } catch APIError.badKey {
            onBadKey()
            return nil
        } catch {
            return nil
        }
    }

    private func scheduleSearch() {
        searchTask?.cancel()
        resetSearchPaging()
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else {
            results = []
            searched = false
            searching = false
            searchError = nil
            return
        }
        searching = true
        searchTask = Task { [weak self] in
            // Wait for a pause in typing.
            try? await Task.sleep(nanoseconds: 350_000_000)
            guard !Task.isCancelled else { return }
            await self?.runSearch(q)
        }
    }

    /// Search now (the keyboard's Search key, or a suggestion).
    func searchNow() {
        searchTask?.cancel()
        resetSearchPaging()
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { return }
        searching = true
        searchTask = Task { [weak self] in await self?.runSearch(q) }
    }

    private func runSearch(_ q: String) async {
        guard let client = Store.client() else { return }
        do {
            let page = try await client.search(q)
            guard !Task.isCancelled else { return }
            results = page.items
            nextSearchOffset = page.nextOffset
            understood = page.understood
            close = page.close
            searchError = nil
        } catch APIError.badKey {
            onBadKey()
        } catch is CancellationError {
            return
        } catch let error as APIError {
            guard !Task.isCancelled else { return }
            searchError = error.message
        } catch {
            guard !Task.isCancelled else { return }
            searchError = APIError.offline.message
        }
        searching = false
        searched = true
    }

    private func resetSearchPaging() {
        searchMoreTask?.cancel()
        searchGeneration = UUID()
        nextSearchOffset = nil
        loadingMoreSearch = false
        searchMoreError = nil
    }

    /// Continue through every page, in both the search grid and its player.
    func loadMoreSearchIfNeeded(at index: Int) {
        guard index >= results.count - 4, !searching, !loadingMoreSearch,
              let offset = nextSearchOffset, let client = Store.client() else { return }
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let generation = searchGeneration
        loadingMoreSearch = true
        searchMoreError = nil
        searchMoreTask = Task { [weak self] in
            guard let self else { return }
            defer { if generation == searchGeneration { loadingMoreSearch = false } }
            do {
                let page = try await client.search(q, offset: offset)
                guard !Task.isCancelled, generation == searchGeneration else { return }
                let have = Set(results.map(\.key))
                results += page.items.filter { !have.contains($0.key) }
                nextSearchOffset = page.nextOffset
            } catch APIError.badKey {
                if generation == searchGeneration { onBadKey() }
            } catch {
                guard !Task.isCancelled, generation == searchGeneration else { return }
                searchMoreError = (error as? APIError)?.message ?? APIError.offline.message
            }
        }
    }

}
