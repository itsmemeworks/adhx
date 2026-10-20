import Foundation

/// "What your ADHX is doing" (`/api/app/doing`): posts on their way, stuck or
/// just finished. Asked every 5 s while something that shows it is on screen
/// (the player's pill, its sheet, the full list), and not at all otherwise.
@MainActor
final class DoingModel: ObservableObject {
    @Published private(set) var items: [DoingItem] = []
    @Published private(set) var summary = DoingSummary()
    @Published private(set) var loadedOnce = false
    @Published private(set) var loadError: String?
    /// This ADHX has no `/api/app/doing` yet (404).
    @Published private(set) var unsupported = false
    /// Posts a Retry is on its way for.
    @Published private(set) var retrying: Set<String> = []
    /// What went wrong with a Retry, by post.
    @Published private(set) var retryErrors: [String: String] = [:]

    var onBadKey: () -> Void = {}

    static let interval: UInt64 = 5_000_000_000

    private var watchers = Set<String>()
    private var loop: Task<Void, Never>?

    /// Still on their way (working, waiting or needing you).
    var active: [DoingItem] { items.filter { !$0.isReady } }
    var needsYou: Int { summary.needsYou }
    var onTheirWay: Int { summary.onTheirWay }
    /// On their way and not stuck.
    var moving: Int { max(0, summary.onTheirWay - summary.needsYou) }

    /// "3 on their way · 1 needs you", or nil when there's nothing.
    var line: String? {
        var parts: [String] = []
        if moving > 0 { parts.append("\(moving) on \(moving == 1 ? "its" : "their") way") }
        if needsYou > 0 { parts.append("\(needsYou) \(needsYou == 1 ? "needs" : "need") you") }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    // MARK: Watching

    /// Something showing this is on screen: ask now and every 5 s.
    func watch(_ who: String) {
        watchers.insert(who)
        guard loop == nil, !unsupported else { return }
        loop = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                await self.refresh()
                if self.unsupported {
                    self.loop = nil
                    return
                }
                try? await Task.sleep(nanoseconds: Self.interval)
            }
        }
    }

    /// It went away: stop asking once nothing is watching.
    func unwatch(_ who: String) {
        watchers.remove(who)
        guard watchers.isEmpty else { return }
        loop?.cancel()
        loop = nil
    }

    func refresh() async {
        guard let client = Store.client() else { return }
        do {
            let answer = try await client.doing()
            items = answer.items
            summary = answer.summary
            loadError = nil
            unsupported = false
        } catch APIError.badKey {
            onBadKey()
        } catch let error as APIError where error.isMissing {
            unsupported = true
        } catch is CancellationError {
            return
        } catch let error as APIError {
            loadError = error.message
        } catch {
            loadError = APIError.offline.message
        }
        loadedOnce = true
    }

    // MARK: Retry

    func retry(_ item: DoingItem) async {
        guard let client = Store.client(), !retrying.contains(item.id) else { return }
        retrying.insert(item.id)
        retryErrors[item.id] = nil
        defer { retrying.remove(item.id) }
        do {
            try await client.retry(item.ref)
            await refresh()
        } catch APIError.badKey {
            onBadKey()
        } catch let error as APIError {
            retryErrors[item.id] = error.message
        } catch {
            retryErrors[item.id] = "Couldn’t retry that. Try again."
        }
    }
}
