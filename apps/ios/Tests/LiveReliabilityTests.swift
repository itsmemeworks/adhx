import Foundation

/// Run without a simulator: swiftc Shared/API.swift Shared/FriendsAPI.swift Shared/LiveQueue.swift Tests/LiveReliabilityTests.swift -o /tmp/adhx-live-tests && /tmp/adhx-live-tests
@main
struct LiveReliabilityTests {
    static func post(_ id: String, savers: [Saver] = []) -> PhonePost {
        PhonePost(platform: "x", postId: id, kind: "photo", author: PhoneAuthor(handle: "author", name: nil, avatarUrl: nil), text: "", postedAt: nil, savedAt: nil, sourceUrl: nil, openPath: "/s/x/\(id)", media: [], article: nil, match: nil, savers: savers)
    }

    static func main() throws {
        let ana = Saver(username: "ana", name: "Ana", isYou: false)
        let ben = Saver(username: "ben", name: "Ben", isYou: false)
        let cached = [post("old", savers: [ana, ben]), post("playing"), post("gone"), post("older")]
        let merged = mergeLiveQueue(current: cached, fresh: [post("new")], removed: ["x:gone"], playing: "x:playing", saverUpdates: ["x:old": LiveSaverUpdate(key: "x:old", savers: [ben], isPrivate: true)])
        precondition(merged.map(\.key) == ["x:old", "x:playing", "x:new", "x:older"])
        precondition(merged[0].savers.map(\.username) == ["ben"] && merged[0].isPrivate, "Private saver must disappear without changing post order")
        precondition(merged.contains { $0.key == "x:older" }, "Absence from newest60 must not remove an older post")
        let bounded = mergeLiveQueue(current: (0..<200).map { post(String($0)) }, fresh: (200..<260).map { post(String($0)) }, removed: [], playing: "x:190")
        precondition(bounded.count == 200 && bounded.contains { $0.key == "x:190" })
        let empty = mergeLiveQueue(current: cached, fresh: [], removed: Set(cached.map(\.key)), playing: "x:playing")
        precondition(empty.isEmpty)
        let detail = try JSONDecoder().decode(LiveDetail.self, from: Data(#"{"items":[],"watchers":[],"removedKeys":["x:gone"],"saverUpdates":[{"key":"x:older","savers":[],"isPrivate":true}]}"#.utf8))
        precondition(detail.removedKeys == ["x:gone"] && detail.watchers.isEmpty && detail.saverUpdates.first?.key == "x:older")
        let legacy = try JSONDecoder().decode(LiveDetail.self, from: Data(#"{"items":[]}"#.utf8))
        precondition(legacy.removedKeys.isEmpty)
        precondition(LiveSay.clip(String(repeating: "😀", count: 42)) == String(repeating: "😀", count: 40))
        precondition(LiveSay.clip(String(repeating: "a", count: 39) + "😀extra") == String(repeating: "a", count: 39) + "😀")
        print("iOS live reliability: 9 assertions passed")
    }
}
