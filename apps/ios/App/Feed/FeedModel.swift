import Foundation

/// New: the friends feed (`/api/app/feed`), a page at a time, and the posts
/// you've watched (`/api/app/seen`). A post counts as seen after 2 s on
/// screen, or as soon as you swipe past it; they go to the server in batches.
@MainActor
final class FeedModel: ObservableObject {
    @Published private(set) var mode: FeedMode = .new
    @Published private(set) var items: [PhonePost] = []
    @Published private(set) var loadedOnce = false
    @Published private(set) var loading = false
    @Published private(set) var loadError: String?
    /// No more pages.
    @Published private(set) var atEnd = false
    /// The server says you've seen everything (New).
    @Published private(set) var caughtUp = false
    /// There's nothing new on the server at all yet (not "all caught up").
    @Published private(set) var nothingYet = false
    /// This ADHX has no feed yet (404): Home plays your saves instead.
    @Published private(set) var unsupported = false
    /// Where you are, so coming back to New starts on the same post.
    @Published private(set) var currentIndex = 0
    /// What New plays: videos and photos unless you've said otherwise.
    @Published private(set) var types: Set<FeedType> = FeedModel.savedTypes
    /// Posts the filter is leaving out, for "4 text posts waiting".
    @Published private(set) var hidden: [FeedType: Int] = [:]
    private var hiddenKeys = Set<String>()
    var currentKey: String? {
        currentIndex < items.count ? items[currentIndex].key : (items.isEmpty ? nil : PlayerView.endKey)
    }

    private var nextCursor: String?
    private var generation = UUID()

    // Seen
    private var shownKey: String?
    private var dwell: Task<Void, Never>?
    private var pending: [PostRef] = []
    private var sent = Set<String>()
    private var flushSoon: Task<Void, Never>?

    static let dwellNanos: UInt64 = 2_000_000_000
    static let batch = 10

    var onBadKey: () -> Void = {}

    // MARK: Show more / less from someone

    /// Who you asked to see more (1) or less (-1) of; nil until loaded, or on
    /// a server without `/api/app/feed/weights`.
    @Published private(set) var weights: [String: Int]?
    /// The person a change is on its way for.
    @Published private(set) var weighing: String?
    @Published private(set) var weightError: String?

    /// Asks once (and again after a change elsewhere is likely: each Why).
    func loadWeights() async {
        guard let client = Store.client() else { return }
        do {
            weights = try await client.feedWeights()
        } catch APIError.badKey {
            onBadKey()
        } catch {
            // A 404 (older server) or a blip: the buttons stay away.
        }
    }

    /// "Show more from Ana" (1), "Show less" (-1), or back to normal (0).
    func setWeight(_ username: String, _ weight: Int) async {
        guard let client = Store.client(), weighing == nil else { return }
        weighing = username
        weightError = nil
        defer { weighing = nil }
        do {
            weights = try await client.setFeedWeight(username, weight)
        } catch APIError.badKey {
            onBadKey()
        } catch let error as APIError {
            weightError = error.code == "no_member" ? "They’re not on your ADHX any more."
                : error.isMissing ? "Your ADHX needs an update for that." : error.message
        } catch {
            weightError = APIError.offline.message
        }
    }

    // MARK: Filter

    private static let typesKey = "feedTypes"

    /// The last filter this phone knows (the server's, when it has one).
    private static var savedTypes: Set<FeedType> {
        let names = AppGroup.defaults.stringArray(forKey: typesKey) ?? []
        let types = Set(names.compactMap(FeedType.init(rawValue:)))
        return types.isEmpty ? FeedType.standard : types
    }

    /// Takes the server's saved filter, if it keeps one (a 404 keeps ours).
    func loadTypes() async {
        guard let client = Store.client(),
              let theirs = try? await client.feedTypes(), theirs != types else { return }
        types = theirs
        AppGroup.defaults.set(FeedType.allCases.filter(theirs.contains).map(\.rawValue), forKey: Self.typesKey)
        if loadedOnce { await reload() }
    }

    /// Switches the filter (at least one type stays on), saves it and plays again.
    func setTypes(_ new: Set<FeedType>) async {
        guard !new.isEmpty, new != types else { return }
        types = new
        AppGroup.defaults.set(FeedType.allCases.filter(new.contains).map(\.rawValue), forKey: Self.typesKey)
        if let client = Store.client() {
            // Older servers don't keep it: the phone still does.
            try? await client.setFeedTypes(new)
        }
        await flushSeen()
        items = []
        currentIndex = 0
        loadedOnce = false
        await reload()
    }

    /// From the top, in the current mode.
    func reload() async {
        let generation = UUID()
        self.generation = generation
        nextCursor = nil
        atEnd = false
        hidden = [:]
        hiddenKeys = []
        await load(cursor: nil, replacing: true, generation: generation)
    }

    /// Everyone · Friends only · Mine, or New again.
    func setMode(_ mode: FeedMode) async {
        guard mode != self.mode || !loadedOnce else { return }
        await flushSeen()
        self.mode = mode
        items = []
        currentIndex = 0
        caughtUp = false
        loadedOnce = false
        await reload()
    }

    func loadMoreIfNeeded(at index: Int) {
        guard index >= items.count - 4, !atEnd, !loading, let cursor = nextCursor else { return }
        let generation = generation
        Task { await load(cursor: cursor, replacing: false, generation: generation) }
    }

    private func load(cursor: String?, replacing: Bool, generation: UUID, depth: Int = 0) async {
        guard let client = Store.client() else { return }
        loading = true
        defer { if generation == self.generation { loading = false } }
        do {
            let types = types
            let page = try await client.feed(mode: mode, cursor: cursor, types: types)
            guard generation == self.generation else { return }
            // A server that ignores `types` still gets filtered here. A post
            // someone sent you shows whatever its kind, as the server's New does.
            let inFeed = { (post: PhonePost) in types.contains(FeedType(kind: post.kind)) || post.sentToYou }
            let shown = page.items.filter(inFeed)
            var hidden = replacing ? [:] : self.hidden
            for post in page.items where !inFeed(post) {
                if hiddenKeys.insert(post.key).inserted { hidden[FeedType(kind: post.kind), default: 0] += 1 }
            }
            // The server's own count wins where it gives one.
            for (type, count) in page.hidden { hidden[type] = max(hidden[type] ?? 0, count) }
            self.hidden = hidden
            if replacing {
                items = shown
                currentIndex = 0
            } else {
                let have = Set(items.map(\.key))
                items += shown.filter { !have.contains($0.key) }
            }
            nextCursor = page.nextCursor
            atEnd = page.nextCursor == nil || page.items.isEmpty
            caughtUp = page.caughtUp && atEnd
            if replacing { nothingYet = page.nothingYet && shown.isEmpty }
            loadError = nil
            unsupported = false
            KnownPeople.remember(page.items.flatMap(\.savers))
            // The filter left almost nothing on this page: look at the next few.
            if items.count < 3, !atEnd, let next = nextCursor, depth < 4 {
                await load(cursor: next, replacing: false, generation: generation, depth: depth + 1)
                return
            }
        } catch APIError.badKey {
            onBadKey()
        } catch is CancellationError {
            return
        } catch let error as APIError where error.isMissing {
            unsupported = true
        } catch let error as APIError {
            if replacing || items.isEmpty { loadError = error.message }
        } catch {
            if replacing || items.isEmpty { loadError = APIError.offline.message }
        }
        loadedOnce = true
        // The player may have asked for more while this page was loading.
        if generation == self.generation {
            Task { [weak self] in
                guard let self else { return }
                self.loadMoreIfNeeded(at: self.currentIndex)
            }
        }
    }

    // MARK: Seen

    /// The player moved to `index` (`items.count` is the end page).
    func shown(_ index: Int) {
        currentIndex = index
        loadMoreIfNeeded(at: index)
        let key = index < items.count ? items[index].key : nil
        guard key != shownKey else { return }
        // Swiped past: the one before counts as seen.
        if let previous = shownKey, let post = items.first(where: { $0.key == previous }) {
            markSeen(post)
        }
        shownKey = key
        dwell?.cancel()
        guard index < items.count else {
            Task { await flushSeen() }
            return
        }
        let post = items[index]
        dwell = Task { [weak self] in
            try? await Task.sleep(nanoseconds: Self.dwellNanos)
            guard !Task.isCancelled else { return }
            self?.markSeen(post)
        }
    }

    private func markSeen(_ post: PhonePost) {
        guard sent.insert(post.key).inserted else { return }
        pending.append(post.ref)
        if pending.count >= Self.batch {
            Task { await flushSeen() }
        } else {
            flushSoon?.cancel()
            flushSoon = Task { [weak self] in
                try? await Task.sleep(nanoseconds: 5_000_000_000)
                guard !Task.isCancelled else { return }
                await self?.flushSeen()
            }
        }
    }

    /// Sends what's waiting (leaving New, going to the background, a full batch).
    func flushSeen() async {
        flushSoon?.cancel()
        guard !pending.isEmpty, let client = Store.client() else { return }
        let batch = Array(pending.prefix(50))
        pending.removeFirst(batch.count)
        do {
            try await client.seen(batch)
        } catch let error as APIError where error.isMissing {
            // An older ADHX: nothing to tell.
        } catch {
            // Try again with the next batch.
            pending.insert(contentsOf: batch, at: 0)
        }
    }

    /// Leaving New: the post on screen keeps its 2 s, but nothing waits.
    func pause() {
        dwell?.cancel()
        shownKey = nil
        Task { await flushSeen() }
    }

    // MARK: For the caught-up card

    /// The people behind what you just watched, most first.
    var sessionPeople: [Saver] {
        var counts: [String: (Saver, Int)] = [:]
        for post in items {
            for saver in post.savers where !saver.isYou {
                counts[saver.username, default: (saver, 0)].1 += 1
            }
        }
        return counts.values.sorted { $0.1 > $1.1 }.map(\.0)
    }

}
