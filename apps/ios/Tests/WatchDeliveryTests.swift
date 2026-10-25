import Foundation

// Production WatchCounts + WatchTally against isolated storage and transport.
struct WatchedPost: Codable, Equatable {
    let platform: String; let id: String; let plays: Int; let finishes: Int; let seconds: Int
}
enum APIError: Error {
    case offline, badPosts
    var isMissing: Bool { false }
    var code: String { self == .badPosts ? "bad_posts" : "offline" }
}
@MainActor enum AppGroup {
    static let defaults = UserDefaults(suiteName: "adhx-watch-tests-\(UUID().uuidString)")!
}
@MainActor final class Client {
    var fails = true
    var calls: [(String?, [WatchedPost])] = []
    var held: CheckedContinuation<Void, Error>?
    var hold = false
    func watched(_ posts: [WatchedPost], batchId: String?) async throws {
        calls.append((batchId, posts))
        if hold { try await withCheckedThrowingContinuation { held = $0 }; return }
        if fails { throw APIError.offline }
    }
}
@MainActor enum Store {
    static var server: URL? = URL(string: "https://test.example")
    static var key: String? = "first"
    static let transport = Client()
    static func client() -> Client? { transport }
}
@main struct WatchDeliveryTests {
    @MainActor static func main() async {
        func play(_ model: WatchCounts, from: Int = 0, to: Int = 5) {
            model.begin("twitter:1")
            for second in from...to { model.sample(Double(second), duration: 20) }
        }
        let first = WatchCounts()
        play(first)
        await first.flush() // Ambiguous failure must leave a durable request.
        let sent = Store.transport.calls[0]
        precondition(sent.0 != nil && sent.1[0].plays == 1)
        let saved = AppGroup.defaults.data(forKey: "watchCounts")!
        let value = try! JSONSerialization.jsonObject(with: saved) as! [String: Any]
        precondition((value["pending"] as! [String: Any])["batchId"] as? String == sent.0)

        // Simulated process restart: only persisted state survives.
        let restarted = WatchCounts()
        Store.transport.fails = false
        await restarted.flush()
        precondition(Store.transport.calls[1].0 == sent.0)
        precondition(Store.transport.calls[1].1 == sent.1)
        precondition(AppGroup.defaults.data(forKey: "watchCounts") == nil)

        // New watching has a new receipt; an old connection cannot clear it.
        Store.transport.hold = true
        play(restarted)
        let request = Task { await restarted.flush() }
        while Store.transport.held == nil { await Task.yield() }
        precondition(Store.transport.calls[2].0 != sent.0)
        Store.key = "second"
        play(restarted)
        Store.transport.hold = false
        Store.transport.held!.resume()
        await request.value
        await restarted.flush()
        precondition(Store.transport.calls[3].0 != Store.transport.calls[2].0)
        precondition(Store.transport.calls[3].1[0].plays == 1)
        print("Watch delivery: durable retry, restart, new batches and connection isolation passed")
    }
}
