import Foundation
import Combine

// swiftc apps/ios/App/Library/PostPeopleModel.swift apps/ios/Tests/PostPeopleTests.swift -o /tmp/adhx-post-people && /tmp/adhx-post-people
struct Saver { let username: String; var savedAt: String? = nil; var displayName: String { username } }
struct PostRef { let key: String }
struct PhonePost { let key: String; var savers: [Saver] = []; var ref: PostRef { PostRef(key: key) } }
struct LiveReactionEvent { let saver: Saver; var emoji: String? = nil }
struct PostPeople { var savers: [Saver] = []; var reactions: [LiveReactionEvent] = []; var watched: [Saver] = [] }
enum Format { static func parseISO(_ value: String) -> Date? { ISO8601DateFormatter().date(from: value) } }
@MainActor final class FakeClient {
    var pending: [String: CheckedContinuation<PostPeople, Error>] = [:]
    func who(_ post: PostRef) async throws -> PostPeople {
        try await withCheckedThrowingContinuation { pending[post.key] = $0 }
    }
}
@MainActor enum Store {
    static var server = URL(string: "https://one.example")
    static var key: String? = "first-key"
    static var current = FakeClient()
    static func client() -> FakeClient? { current }
}
@main struct PostPeopleTests {
    @MainActor static func main() async {
        let model = PostPeopleModel()
        let old = Task { await model.load(PhonePost(key: "twitter:old")) }
        while Store.current.pending["twitter:old"] == nil { await Task.yield() }
        let newer = Task { await model.load(PhonePost(key: "twitter:new")) }
        while Store.current.pending["twitter:new"] == nil { await Task.yield() }
        Store.current.pending.removeValue(forKey: "twitter:new")!.resume(returning: PostPeople(savers: [Saver(username: "new")]))
        await newer.value
        Store.current.pending.removeValue(forKey: "twitter:old")!.resume(returning: PostPeople(savers: [Saver(username: "old")]))
        await old.value
        precondition(model.everyone.map(\.id) == ["new"], "late results cannot replace the newer post")

        let stale = Task { await model.load(PhonePost(key: "twitter:other", savers: [Saver(username: "old-fallback")])) }
        while Store.current.pending["twitter:other"] == nil { await Task.yield() }
        Store.server = URL(string: "https://two.example")
        Store.key = "second-key"
        let previous = Store.current
        Store.current = FakeClient()
        previous.pending.removeValue(forKey: "twitter:other")!.resume(returning: PostPeople(savers: [Saver(username: "previous-account")]))
        await stale.value
        precondition(!model.everyone.contains { $0.id == "previous-account" }, "old connection must not publish identity")

        precondition(model.everyone.isEmpty, "fallback identities also disappear after connection replacement")
        let reload = Task { await model.load(PhonePost(key: "twitter:other")) }
        while Store.current.pending["twitter:other"] == nil { await Task.yield() }
        Store.current.pending.removeValue(forKey: "twitter:other")!.resume(returning: PostPeople())
        await reload.value
        precondition(model.everyone.isEmpty, "same post must reload after a connection change")

        let cancelled = Task { await model.load(PhonePost(key: "twitter:cancelled")) }
        while Store.current.pending["twitter:cancelled"] == nil { await Task.yield() }
        cancelled.cancel()
        Store.current.pending.removeValue(forKey: "twitter:cancelled")!.resume(returning: PostPeople(savers: [Saver(username: "cancelled")]))
        await cancelled.value
        precondition(!model.everyone.contains { $0.id == "cancelled" }, "cancelled loads cannot publish identity")
        PostPeopleModel.forget()
        let reconnect = Task { await model.load(PhonePost(key: "twitter:other")) }
        while Store.current.pending["twitter:other"] == nil { await Task.yield() }
        PostPeopleModel.forget()
        Store.current.pending.removeValue(forKey: "twitter:other")!.resume(returning: PostPeople(savers: [Saver(username: "old-session")]))
        await reconnect.value
        precondition(model.everyone.isEmpty, "reconnecting the same credentials rejects the old session")
        print("PostPeopleTests: late post, account replacement, same-post reload and cancellation passed")
    }
}
