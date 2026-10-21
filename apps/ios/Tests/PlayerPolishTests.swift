import Foundation

/// Run without a simulator:
/// swiftc App/Library/PhotoTimer.swift App/Library/LinkedText.swift Tests/PlayerPolishTests.swift -o /tmp/adhx-player-polish-tests && /tmp/adhx-player-polish-tests
@main
struct PlayerPolishTests {
    static func main() {
        var checks = 0
        func check(_ condition: Bool, _ message: String) {
            precondition(condition, message)
            checks += 1
        }

        // Photos: ten seconds each, through the album, then the next post.
        check(PhotoTimer.seconds == 10, "ten seconds a photo")
        check(PhotoTimer.next(page: 0, count: 3, repeatOne: false) == .page(1), "album moves on")
        check(PhotoTimer.next(page: 2, count: 3, repeatOne: false) == .post, "last photo moves to the next post")
        check(PhotoTimer.next(page: 0, count: 1, repeatOne: false) == .post, "one photo moves to the next post")
        check(PhotoTimer.next(page: 2, count: 3, repeatOne: true) == .page(0), "repeat goes back to the first photo")
        check(PhotoTimer.next(page: 0, count: 0, repeatOne: false) == .post, "no photos still moves on")

        // Links: tappable, shown short, the words around them kept.
        let text = LinkedText.attributed("thank me later https://www.example.com/a/b and done")
        let runs = text.runs.map { (String(text[$0.range].characters), $0.link) }
        check(runs.count == 3, "words, link, words")
        check(runs[0].0 == "thank me later " && runs[0].1 == nil, "words before")
        check(runs[1].0 == "example.com/a/b", "link shown short")
        check(runs[1].1 == URL(string: "https://www.example.com/a/b"), "link opens the whole address")
        check(runs[2].0 == " and done", "words after")
        check(LinkedText.short(URL(string: "https://example.com/" + String(repeating: "x", count: 60))!).hasSuffix("…"),
              "long addresses are cut")
        check(String(LinkedText.attributed("no links here").characters) == "no links here", "plain words stay")

        print("PlayerPolishTests: \(checks) checks passed")
    }
}
