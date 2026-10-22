import Foundation
import Combine

enum FirstSaver {
    /// The first to save it (the earliest save), else the newest, else you.
    static func of(_ savers: [Saver]) -> Saver? {
        let dated = savers.compactMap { s in s.savedAt.flatMap(Format.parseISO).map { (s, $0) } }
        if let first = dated.min(by: { $0.1 < $1.1 }) { return first.0 }
        return savers.first
    }
}

/// Everyone on a post, loaded when the row opens.
@MainActor
final class PostPeopleModel: ObservableObject {
    @Published private(set) var people: PostPeople?
    private var loadedFor: String?
    private var request = UUID()
    private static var generation = UUID()
    private var loadedGeneration: UUID?
    static func forget() { generation = UUID() }

    private var scope: String? {
        guard let server = Store.server, let key = Store.key else { return nil }
        return server.absoluteString + "|" + key
    }

    func load(_ post: PhonePost) async {
        guard let scope, let client = Store.client() else { people = nil; loadedFor = nil; return }
        let identity = scope + "|" + post.key
        guard loadedFor != identity || loadedGeneration != Self.generation else { return }
        loadedFor = identity
        let generation = Self.generation
        loadedGeneration = generation
        let ticket = UUID()
        request = ticket
        // Until it answers: who saved it, from the post itself.
        people = PostPeople(savers: post.savers)
        let answer = try? await client.who(post.ref)
        guard request == ticket else { return }
        guard !Task.isCancelled, Self.generation == generation, self.scope == scope else {
            people = nil
            loadedFor = nil
            return
        }
        if let answer { people = answer }
        else { loadedFor = nil } // A failed first load may be retried.
    }

    /// One face per person: savers first (first to save leading), then
    /// whoever else reacted or watched.
    struct Person: Identifiable {
        let saver: Saver
        var saved = false
        var reaction: String?
        var watched = false
        var id: String { saver.username }

        var label: String {
            var did: [String] = []
            if saved { did.append("saved it") }
            if let reaction { did.append("reacted \(reaction)") }
            if watched { did.append("watched it") }
            return "\(saver.displayName) " + (did.isEmpty ? "is on this one" : did.joined(separator: ", "))
        }
    }

    var everyone: [Person] {
        guard loadedGeneration == Self.generation, let scope,
              loadedFor?.hasPrefix(scope + "|") == true, let people else { return [] }
        var order: [String] = []
        var byName: [String: Person] = [:]
        func person(_ s: Saver) -> Person {
            if byName[s.username] == nil {
                byName[s.username] = Person(saver: s)
                order.append(s.username)
            }
            return byName[s.username]!
        }
        let first = FirstSaver.of(people.savers)
        for s in ([first].compactMap { $0 } + people.savers) {
            var p = person(s)
            p.saved = true
            byName[s.username] = p
        }
        for r in people.reactions {
            var p = person(r.saver)
            // Their latest emoji; words float, they're not a sticker.
            if let emoji = r.emoji { p.reaction = emoji }
            byName[r.saver.username] = p
        }
        for w in people.watched {
            var p = person(w)
            p.watched = true
            byName[w.username] = p
        }
        return order.compactMap { byName[$0] }
    }
}

