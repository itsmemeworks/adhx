import Foundation

/// "Just for me" switches made in the app, so every list showing the same post
/// (the feed, search, a channel) shows the lock at once.
@MainActor
final class PrivacyStore: ObservableObject {
    static let shared = PrivacyStore()

    @Published private var overrides: [String: Bool] = [:]
    /// Posts saved from the player's rail this session.
    @Published private var savedHere: Set<String> = []
    /// Your notes as set from the phone, by post (nil: cleared).
    @Published private var notes: [String: String?] = [:]

    func isPrivate(_ post: PhonePost) -> Bool {
        overrides[post.key] ?? post.isPrivate
    }

    /// Whether this phone can switch it: it's one of your saves.
    func canSwitch(_ post: PhonePost) -> Bool {
        isPrivate(post) || post.savers.contains(where: \.isYou) || savedHere.contains(post.key)
    }

    /// It's in your saves (yours already, or saved from the rail just now).
    func isSaved(_ post: PhonePost) -> Bool { canSwitch(post) }

    /// Saves someone else's post to your ADHX (the rail's bookmark).
    func save(_ post: PhonePost) async throws {
        guard let client = Store.client() else { throw APIError.offline }
        guard let link = post.sourceUrl else { throw APIError.offline }
        _ = try await client.save(url: link, requestId: UUID().uuidString.lowercased())
        savedHere.insert(post.key)
    }

    /// Your note on a post: what you set here, else what the server sent.
    func note(_ post: PhonePost) -> String? {
        if let set = notes[post.key] { return set }
        return post.savers.first(where: \.isYou)?.note
    }

    /// Sets or clears your note (`/api/app/note`) and remembers the server's answer.
    func setNote(_ post: PhonePost, _ text: String?) async throws {
        guard let client = Store.client() else { throw APIError.offline }
        let now = try await client.setNote(platform: post.platform, id: post.postId, note: text)
        notes[post.key] = .some(now)
    }

    /// Asks the server, then remembers its answer. Throws its error.
    func set(_ post: PhonePost, private on: Bool) async throws {
        guard let client = Store.client() else { throw APIError.offline }
        let now = try await client.setPrivate(platform: post.platform, id: post.postId, private: on)
        overrides[post.key] = now
    }
}
