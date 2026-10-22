import Foundation
import Combine

/// Reactions kept on posts: the ones already there float up once when you
/// land on a post (the newest 12, oldest first), and yours float at once
/// while they're sent. Live keeps its own room (TunedInModel).
@MainActor
final class PostReactionsModel: ObservableObject {
    @Published private(set) var floating: [FloatingReaction] = []
    /// The newest reaction from someone else on the post on screen, from the
    /// last week: "Pete replied · 2m".
    @Published private(set) var answer: (key: String, reaction: LiveReactionEvent)?
    static let answerFor: TimeInterval = 7 * 86_400
    /// Posts already replayed this run of the app, in any player.
    private static var replayed = Set<String>()
    /// What each post had when it was fetched (plus yours since).
    private static var cache: [String: [LiveReactionEvent]] = [:]
    private static var scope: String?
    private static var generation = UUID()
    private var replay: Task<Void, Never>?

    /// Call at either connection boundary, including reconnecting the same account.
    static func forget() {
        cache.removeAll()
        replayed.removeAll()
        scope = nil
        generation = UUID()
    }

    private static func connectionScope() -> String? {
        guard let server = Store.server, let key = Store.key else { return nil }
        return server.absoluteString + "|" + key
    }

    private static func prepareScope() -> String? {
        let current = connectionScope()
        if scope != current { forget(); scope = current }
        return current
    }

    private static func remember(_ list: [LiveReactionEvent], for key: String) {
        if cache.count >= 500 && cache[key] == nil { cache.removeAll(); replayed.removeAll() }
        cache[key] = list
    }

    static let shown = 12
    static let firstDelay: UInt64 = 600_000_000
    static let gap: UInt64 = 350_000_000

    /// A post settled on screen (nil: nothing to replay). `again` (the
    /// reactions feed) replays it every time, asking the server afresh.
    func arrive(_ post: PostRef?, again: Bool = false) {
        replay?.cancel()
        floating.removeAll()
        answer = nil
        if let post, let cached = Self.cache[post.key] { noteAnswer(cached, for: post.key) }
        guard let scope = Self.prepareScope(), let client = Store.client(), let post,
              again || !Self.replayed.contains(post.key) else { return }
        let generation = Self.generation
        replay = Task { [weak self] in
            try? await Task.sleep(nanoseconds: Self.firstDelay)
            guard !Task.isCancelled else { return }
            let list: [LiveReactionEvent]
            if !again, let cached = Self.cache[post.key] {
                list = cached
            } else {
                // A failed refresh must never replay an older connection's answer.
                guard let fetched = try? await client.reactions(to: post),
                      !Task.isCancelled, Self.generation == generation,
                      Self.connectionScope() == scope else { return }
                Self.remember(fetched, for: post.key)
                list = fetched
            }
            guard !Task.isCancelled, Self.generation == generation,
                  Self.connectionScope() == scope else { return }
            self?.noteAnswer(list, for: post.key)
            Self.replayed.insert(post.key)
            for reaction in list.suffix(Self.shown) {
                guard !Task.isCancelled, Self.generation == generation,
                      Self.connectionScope() == scope, let self else { return }
                self.float(reaction)
                try? await Task.sleep(nanoseconds: Self.gap)
            }
        }
    }

    /// Sends an emoji or a few words. It floats at once, and goes if the server says no.
    func react(_ say: LiveSay, you: Saver, to post: PostRef) async -> Bool {
        guard let scope = Self.prepareScope(), let client = Store.client() else { return false }
        let generation = Self.generation
        let event: LiveReactionEvent
        switch say {
        case .emoji(let emoji): event = LiveReactionEvent(id: UUID().uuidString, saver: you, emoji: emoji, text: nil)
        case .text(let text): event = LiveReactionEvent(id: UUID().uuidString, saver: you, emoji: nil, text: LiveSay.clip(text))
        }
        let item = float(event)
        do {
            try await client.react(say, to: post)
            guard Self.generation == generation, Self.connectionScope() == scope else {
                floating.removeAll { $0.id == item.id }
                return false
            }
            Self.cache[post.key]?.append(event)
            return true
        } catch {
            floating.removeAll { $0.id == item.id }
            return false
        }
    }

    private func noteAnswer(_ list: [LiveReactionEvent], for key: String) {
        let now = Date()
        guard let newest = list.last(where: { reaction in
            guard !reaction.saver.isYou, let at = reaction.at.flatMap(Format.parseISO) else { return false }
            return now.timeIntervalSince(at) < Self.answerFor
        }) else { return }
        answer = (key, newest)
    }

    @discardableResult
    private func float(_ reaction: LiveReactionEvent) -> FloatingReaction {
        let item = FloatingReaction(event: reaction, lane: CGFloat.random(in: 0.05...0.75))
        floating.append(item)
        if floating.count > 12 { floating.removeFirst(floating.count - 12) }
        Task { [weak self] in
            try? await Task.sleep(nanoseconds: FloatingReaction.lifeNanos)
            self?.floating.removeAll { $0.id == item.id }
        }
        return item
    }
}
