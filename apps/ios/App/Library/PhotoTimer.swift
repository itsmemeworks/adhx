import Foundation

/// Photos move on by themselves: each shows for `seconds`, then the next
/// photo in its album, then the next post (or back to the first photo when
/// Repeat is on).
enum PhotoTimer {
    static let seconds: Double = 10

    enum Step: Equatable {
        case page(Int)
        case post
    }

    static func next(page: Int, count: Int, repeatOne: Bool) -> Step {
        if page + 1 < count { return .page(page + 1) }
        if repeatOne { return .page(0) }
        return .post
    }
}
