import Foundation

/// "Just for me" switches made in the app, so every list showing the same post
/// (the feed, search, a channel) shows the lock at once.
@MainActor
final class PrivacyStore: ObservableObject {
    static let shared = PrivacyStore()

    @Published private var overrides: [String: Bool] = [:]

    func isPrivate(_ post: PhonePost) -> Bool {
        overrides[post.key] ?? post.isPrivate
    }

    /// Whether this phone can switch it: it's one of your saves.
    func canSwitch(_ post: PhonePost) -> Bool {
        isPrivate(post) || post.savers.contains(where: \.isYou)
    }

    /// Asks the server, then remembers its answer. Throws its error.
    func set(_ post: PhonePost, private on: Bool) async throws {
        guard let client = Store.client() else { throw APIError.offline }
        let now = try await client.setPrivate(platform: post.platform, id: post.postId, private: on)
        overrides[post.key] = now
    }
}
