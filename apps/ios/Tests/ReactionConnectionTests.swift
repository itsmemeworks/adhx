import Foundation
import Combine

// Compile the production model against deterministic connection/transport fixtures:
// swiftc apps/ios/App/Library/PostReactionsModel.swift apps/ios/Tests/ReactionConnectionTests.swift -o /tmp/adhx-reaction-connections && /tmp/adhx-reaction-connections
struct Saver: Sendable { let username: String; var isYou = false }
struct PostRef: Sendable { let key: String }
struct LiveReactionEvent: Sendable {
    let id: String; let saver: Saver; let emoji: String?; let text: String?
    var at: String? = nil
}
enum Format {
    static func parseISO(_ s: String) -> Date? { ISO8601DateFormatter().date(from: s) }
}
struct FloatingReaction: Sendable {
    let id = UUID()
    let event: LiveReactionEvent
    let lane: CGFloat
    static let lifeNanos: UInt64 = 30_000_000_000
}
enum LiveSay: Sendable {
    case emoji(String), text(String)
    static func clip(_ s: String) -> String { s }
}
enum TestError: Error { case offline }
@MainActor final class FakeClient {
    var result: [LiveReactionEvent]?
    var hold = false
    var calls = 0
    var pending: CheckedContinuation<[LiveReactionEvent], Error>?
    init(_ result: [LiveReactionEvent]?) { self.result = result }
    func reactions(to post: PostRef) async throws -> [LiveReactionEvent] {
        calls += 1
        if hold { return try await withCheckedThrowingContinuation { pending = $0 } }
        guard let result else { throw TestError.offline }
        return result
    }
    func react(_ say: LiveSay, to post: PostRef) async throws {}
}
@MainActor enum Store {
    static var server: URL?
    static var key: String?
    static var current: FakeClient?
    static func client() -> FakeClient? { current }
}
@main struct ReactionConnectionTests {
    @MainActor static func main() async {
        let post = PostRef(key: "twitter:1")
        func event(_ id: String) -> LiveReactionEvent {
            LiveReactionEvent(id: id, saver: Saver(username: id), emoji: "😂", text: nil, at: ISO8601DateFormatter().string(from: Date()))
        }
        func connect(_ host: String, _ key: String, _ client: FakeClient) {
            Store.server = URL(string: "https://\(host).example")
            Store.key = key
            Store.current = client
        }
        func settle() async { try? await Task.sleep(nanoseconds: 700_000_000) }
        let a = FakeClient([event("account-a")])
        connect("a", "credential-a", a)
        let first = PostReactionsModel()
        first.arrive(post)
        await settle()
        precondition(first.floating.map(\.event.id) == ["account-a"])

        // A different server must not use the cache, even without an explicit reset.
        let b = FakeClient(nil)
        connect("b", "credential-b", b)
        first.arrive(post, again: true)
        await settle()
        precondition(first.floating.isEmpty, "failed fresh fetch must not fall back across servers")
        precondition(first.answer == nil, "cached identity cannot cross connections")
        precondition(b.calls == 1)
        b.result = [event("account-b")]
        first.arrive(post)
        await settle()
        precondition(first.floating.map(\.event.id) == ["account-b"])

        // Same-server credential replacement also starts a fresh replay session.
        let c = FakeClient([event("account-c")])
        connect("b", "credential-c", c)
        first.arrive(post)
        await settle()
        precondition(first.floating.map(\.event.id) == ["account-c"])
        precondition(first.answer?.reaction.id == "account-c")
        c.result = [] // e.g. moderation removed the only visible reaction.
        first.arrive(post, again: true)
        await settle()
        precondition(first.answer == nil, "a fresh empty answer removes the cached reply label")
        c.result = nil
        first.arrive(post, again: true)
        await settle()
        precondition(first.floating.isEmpty, "failed refresh never replays a stale cached answer")
        precondition(first.answer == nil, "failed refresh never restores a cached reply label")

        // In-flight old transport results cannot repopulate memory after disconnect.
        PostReactionsModel.forget()
        let slow = FakeClient(nil)
        slow.hold = true
        connect("old", "old-key", slow)
        first.arrive(post)
        await settle()
        precondition(slow.pending != nil)
        PostReactionsModel.forget()
        let next = FakeClient([event("new")])
        connect("new", "new-key", next)
        slow.pending?.resume(returning: [event("stale")])
        let second = PostReactionsModel()
        second.arrive(post)
        await settle()
        precondition(first.floating.isEmpty)
        precondition(second.floating.map(\.event.id) == ["new"])
        let ordinary = PostReactionsModel()
        ordinary.arrive(post)
        await settle()
        precondition(next.calls == 1, "ordinary visits still replay only once")
        PostReactionsModel.forget()
        ordinary.arrive(post)
        await settle()
        precondition(next.calls == 2, "reconnecting the same credentials explicitly clears the session")
        print("ReactionConnectionTests: connection isolation, failed refresh, cancellation and normal replay passed")
    }
}
