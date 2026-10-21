import Foundation

/// Run without a simulator:
/// swiftc Shared/API.swift Shared/FriendsAPI.swift Tests/PostReactionsTests.swift -o /tmp/adhx-post-reactions-tests && /tmp/adhx-post-reactions-tests
///
/// Fixtures follow the post-reactions contract (`GET /api/app/reactions`).
@main
struct PostReactionsTests {
    static func main() throws {
        var checks = 0
        func check(_ condition: Bool, _ message: String) {
            precondition(condition, message)
            checks += 1
        }

        let page = try JSONDecoder().decode(PostReactionsPage.self, from: Data("""
        {"reactions":[
          {"id":"r1","emoji":"😂","text":null,"at":"2026-10-21T05:24:06.105Z",
           "saver":{"username":"ana","name":"Ana","avatarUrl":null,"isYou":false}},
          {"id":"r2","emoji":null,"text":"this is the one","at":"2026-10-21T05:24:06.132Z",
           "saver":{"username":"pete","name":"Pete","avatarUrl":"/api/people/pete/avatar","isYou":true}},
          {"broken":true}
        ]}
        """.utf8))
        check(page.reactions.count == 2, "a reaction that won't read is skipped")
        check(page.reactions[0].emoji == "😂" && page.reactions[0].text == nil, "an emoji")
        check(page.reactions[0].saver.username == "ana", "who reacted")
        check(page.reactions[1].text == "this is the one" && page.reactions[1].emoji == nil, "a few words")
        check(page.reactions[1].saver.isYou, "yours")
        check(page.reactions[1].saver.avatarUrl == "/api/people/pete/avatar", "their picture")

        let empty = try JSONDecoder().decode(PostReactionsPage.self, from: Data("{}".utf8))
        check(empty.reactions.isEmpty, "nothing yet")

        print("PostReactionsTests: \(checks) checks passed")
    }
}
