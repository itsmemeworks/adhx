import Combine
import Foundation

struct Saver {
  let username: String
  var isYou = false
}
struct PostRef: Hashable { let key: String }
struct PhonePost {
  let key: String
  var ref: PostRef { PostRef(key: key) }
  var kind = "video"
  var sentToYou = false
  var section: LineupSection? = .just
  var savers: [Saver] = []
}
enum FeedMode { case new, everyone, friends, mine }
enum FeedType: String, CaseIterable {
  case video, photo, text, article
  static let standard: Set<FeedType> = [.video, .photo]
  init(kind: String) { self = FeedType(rawValue: kind) ?? .text }
}
enum LineupSection: CaseIterable {
  case just, unseen, foryou
  var isUnseen: Bool { self != .foryou }
}
struct FeedPage {
  var items: [PhonePost]
  var nextCursor: String? = nil
  var caughtUp = true
  var hidden: [FeedType: Int] = [:]
  var nothingYet = false
  var sections: [LineupSection: Int]? = [.just: 3]
}
enum APIError: Error {
  case badKey, offline
  var code: String { "test" }
  var message: String { "test" }
  var isMissing: Bool { false }
}
class FixtureDefaults {
  func stringArray(forKey: String) -> [String]? { nil }
  func set(_ value: Any?, forKey: String) {}
}
enum AppGroup { static let defaults = FixtureDefaults() }
enum PlayerView { static let endKey = "__end" }
enum KnownPeople { static func remember(_ people: [Saver]) {} }
@MainActor final class FixtureClient {
  var page = FeedPage(items: [PhonePost(key: "a"), PhonePost(key: "b"), PhonePost(key: "c")])
  var seenCalls: [[PostRef]] = []
  func feed(mode: FeedMode, cursor: String?, types: Set<FeedType>, lineup: Bool = false)
    async throws -> FeedPage
  { page }
  func feedWeights() async throws -> [String: Int] { [:] }
  func setFeedWeight(_ user: String, _ weight: Int) async throws -> [String: Int] { [:] }
  func feedTypes() async throws -> Set<FeedType> { FeedType.standard }
  func setFeedTypes(_ types: Set<FeedType>) async throws {}
  func seen(_ posts: [PostRef]) async throws { seenCalls.append(posts) }
}
@MainActor enum Store {
  static let transport = FixtureClient()
  static func client() -> FixtureClient? { transport }
}
@main struct FeedSeenSessionTests {
  /// Flushes until the 2 s dwell has produced `calls` batches. A fixed 2.1 s
  /// sleep raced the dwell timer on busy CI runners; this allows up to 8 s.
  @MainActor static func waitForSeen(_ feed: FeedModel, _ client: FixtureClient, calls: Int) async {
    for _ in 0..<80 {
      try? await Task.sleep(nanoseconds: 100_000_000)
      await feed.flushSeen()
      if client.seenCalls.count >= calls { return }
    }
  }

  @MainActor static func main() async {
    let feed = FeedModel()
    let client = Store.transport
    await feed.reload()
    feed.shown(0)
    await waitForSeen(feed, client, calls: 1)
    precondition(client.seenCalls.flatMap { $0 }.map(\.key) == ["a"])
    precondition(feed.watched.contains("a"))
    // A later first-time send by a friend makes this already-watched post New again.
    // This is the server's documented unseen-send override of post_views.
    feed.pause()
    client.page.items[0].sentToYou = true
    await feed.reload()
    feed.shown(0)
    await waitForSeen(feed, client, calls: 2)
    precondition(client.seenCalls.count == 2, "a fresh send gets a new acknowledgement")
    precondition(feed.watched.contains("a"))
    precondition(feed.unseenLeft == 2)
    print(
      "FeedSeenSessionTests passed: seen calls=\(client.seenCalls.count), watched=\(feed.watched), badge=\(feed.unseenLeft)"
    )
  }
}
