import CryptoKit
import Foundation

/// Watch counts on the way to your ADHX (`POST /api/app/watched`): every
/// player's `Playback` feeds the one tracker here (rules in `WatchTally.swift`).
/// What isn't sent yet is kept on this phone, tied to the server and key it
/// was counted for, so an app restart doesn't lose it and another account
/// never sends it. Sent every 30 s while there's something to send, when 50
/// posts wait, and when the app goes to the background.
@MainActor
final class WatchCounts {
    static let shared = WatchCounts()

    static let flushEvery: UInt64 = 30_000_000_000
    private static let storageKey = "watchCounts"
    /// Posts kept waiting at most (the oldest go first).
    private static let most = 500

    private struct Pending: Codable {
        let batchId: String
        let posts: [WatchedPost]
    }

    private struct Saved: Codable {
        let scope: String
        let tallies: [String: WatchTracker.Tally]
        let pending: Pending?
    }

    private var tracker = WatchTracker()
    private var pending: Pending?
    private var scope: String?
    private var sending = false
    private var flushSoon: Task<Void, Never>?
    private var savedAt = Date.distantPast

    init() {
        load()
    }

    private static func connectionScope() -> String? {
        guard let server = Store.server, let key = Store.key else { return nil }
        return SHA256.hash(data: Data((server.absoluteString + "|" + key).utf8))
            .map { String(format: "%02x", $0) }.joined()
    }

    /// Another connection since: what was counted for the old one is dropped,
    /// never sent with the new key.
    private func checkScope() -> Bool {
        let now = Self.connectionScope()
        if now != scope {
            scope = now
            tracker = WatchTracker()
            pending = nil
            load()
        }
        return scope != nil
    }

    private func load() {
        scope = Self.connectionScope()
        guard let scope, let data = AppGroup.defaults.data(forKey: Self.storageKey),
              let saved = try? JSONDecoder().decode(Saved.self, from: data) else { return }
        if saved.scope == scope {
            tracker.tallies = saved.tallies
            pending = saved.pending
        } else {
            AppGroup.defaults.removeObject(forKey: Self.storageKey)
        }
    }

    private func save(now: Bool = false) {
        guard now || Date().timeIntervalSince(savedAt) >= 5, let scope else { return }
        savedAt = Date()
        if tracker.tallies.count > Self.most {
            for key in tracker.tallies.keys.sorted().prefix(tracker.tallies.count - Self.most) {
                tracker.tallies[key] = nil
            }
        }
        if tracker.tallies.isEmpty && pending == nil {
            AppGroup.defaults.removeObject(forKey: Self.storageKey)
        } else {
            AppGroup.defaults.set(try? JSONEncoder().encode(Saved(scope: scope, tallies: tracker.tallies, pending: pending)),
                                  forKey: Self.storageKey)
        }
    }

    // MARK: From the player

    /// The post on screen plays (nil: nothing does); `at` when it carries on part-way.
    func begin(_ key: String?, at: Double? = nil) {
        guard checkScope() else { return }
        tracker.begin(key, at: at)
    }

    /// Where it is, every quarter second.
    func sample(_ position: Double, duration: Double) {
        guard checkScope(), tracker.key != nil else { return }
        let before = tracker.tallies[tracker.key ?? ""]?.plays ?? 0
        tracker.sample(position, duration: duration)
        let counted = (tracker.tallies[tracker.key ?? ""]?.plays ?? 0) != before
        save(now: counted)
        if counted { sendSoon() }
    }

    func ended() {
        guard checkScope() else { return }
        tracker.ended()
        save(now: true)
        sendSoon()
    }

    // MARK: Sending

    private func sendSoon() {
        if tracker.tallies.count >= 50 {
            Task { await flush() }
            return
        }
        guard flushSoon == nil else { return }
        flushSoon = Task { [weak self] in
            try? await Task.sleep(nanoseconds: Self.flushEvery)
            guard !Task.isCancelled else { return }
            self?.flushSoon = nil
            await self?.flush()
        }
    }

    /// Sends what's waiting (going to the background, a full batch, every 30 s).
    func flush() async {
        flushSoon?.cancel()
        flushSoon = nil
        guard !sending, checkScope(), let client = Store.client() else { return }
        let scope = self.scope
        if pending == nil {
            let posts = tracker.takeBatch(max: 50).map {
                WatchedPost(platform: $0.platform, id: $0.id, plays: $0.plays, finishes: $0.finishes, seconds: $0.seconds)
            }
            guard !posts.isEmpty else { return }
            pending = Pending(batchId: UUID().uuidString, posts: posts)
        }
        guard let batch = pending else { return }
        // The immutable request survives process termination and uncertain replies.
        save(now: true)
        sending = true
        defer { sending = false }
        var acknowledged = false
        do {
            try await client.watched(batch.posts, batchId: batch.batchId)
            acknowledged = true
        } catch let error as APIError where error.isMissing || error.code == "bad_posts" {
            acknowledged = true // Old server or invalid body: do not retry forever.
        } catch { /* Retain the identical request and receipt id for retry. */ }
        guard scope == self.scope, scope == Self.connectionScope() else { return }
        if acknowledged { pending = nil }
        save(now: true)
        if pending != nil || !tracker.tallies.isEmpty { sendSoon() }
    }
}
