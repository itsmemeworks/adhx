import Foundation

// The friends feed on the phone (docs/specs/friends-feed.md → Phone API
// additions). Some of these endpoints arrive on servers later than others, so
// everything here decodes loosely: unknown fields are ignored, missing ones
// fall back, and one bad item never sinks a whole page.

// MARK: - People

/// Someone on your ADHX who saved a post. Named to members only: the server
/// never sends savers to a signed-out viewer.
struct Saver: Codable, Hashable, Identifiable {
    let username: String
    let name: String?
    /// Their photo, maybe relative to the server. nil: draw their initial.
    let avatarUrl: String?
    let savedAt: String?
    let isYou: Bool

    var id: String { username }

    /// "You", their name, or their username.
    var displayName: String {
        if isYou { return "You" }
        if let name = name?.trimmingCharacters(in: .whitespacesAndNewlines), !name.isEmpty { return name }
        return username
    }

    init(username: String, name: String? = nil, avatarUrl: String? = nil, savedAt: String? = nil,
         isYou: Bool = false) {
        self.username = username
        self.name = name
        self.avatarUrl = avatarUrl
        self.savedAt = savedAt
        self.isYou = isYou
    }

    private enum CodingKeys: String, CodingKey { case username, name, avatarUrl, savedAt, isYou }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        username = try c.decode(String.self, forKey: .username)
        name = (try? c.decodeIfPresent(String.self, forKey: .name)) ?? nil
        avatarUrl = (try? c.decodeIfPresent(String.self, forKey: .avatarUrl)) ?? nil
        savedAt = (try? c.decodeIfPresent(String.self, forKey: .savedAt)) ?? nil
        isYou = (try? c.decodeIfPresent(Bool.self, forKey: .isYou)) ?? false
    }
}

// MARK: - Loose decoding

/// An array that skips the elements it can't read.
struct Lossy<Element: Decodable>: Decodable {
    let items: [Element]

    init(from decoder: Decoder) throws {
        var c = try decoder.unkeyedContainer()
        var out: [Element] = []
        while !c.isAtEnd {
            if let item = try? c.decode(Element.self) {
                out.append(item)
            } else {
                _ = try? c.decode(Skip.self)
            }
        }
        items = out
    }

    private struct Skip: Decodable {
        init(from decoder: Decoder) throws {}
    }
}

/// A cover picture: an address, or a post (or feed item) to take one from.
struct Cover: Decodable, Hashable {
    let url: String?

    init(url: String?) { self.url = url }

    private struct AnyKey: CodingKey {
        var stringValue: String
        var intValue: Int? { nil }
        init(_ s: String) { stringValue = s }
        init?(stringValue: String) { self.stringValue = stringValue }
        init?(intValue: Int) { nil }
    }

    private struct MediaPicture: Decodable {
        let posterUrl: String?
        let thumbnailUrl: String?
        let url: String?
        let kind: String?
        let mediaType: String?
    }

    init(from decoder: Decoder) throws {
        if let text = try? decoder.singleValueContainer().decode(String.self) {
            url = text.isEmpty ? nil : text
            return
        }
        let c = try decoder.container(keyedBy: AnyKey.self)
        for key in ["posterUrl", "coverUrl", "thumbnailUrl", "imageUrl"] {
            if let text = try? c.decode(String.self, forKey: AnyKey(key)), !text.isEmpty {
                url = text
                return
            }
        }
        if let media = (try? c.decode(Lossy<MediaPicture>.self, forKey: AnyKey("media")))?.items,
           let first = media.first {
            let isPhoto = (first.kind ?? first.mediaType) == "photo"
            url = first.posterUrl ?? first.thumbnailUrl ?? (isPhoto ? first.url : nil)
            return
        }
        url = nil
    }
}

private extension KeyedDecodingContainer {
    func loose<T: Decodable>(_ type: T.Type, _ key: Key) -> T? {
        (try? decodeIfPresent(type, forKey: key)) ?? nil
    }

    func looseInt(_ key: Key) -> Int? {
        if let n = loose(Int.self, key) { return n }
        if let d = loose(Double.self, key) { return Int(d) }
        return nil
    }

    func savers(_ key: Key) -> [Saver] {
        loose(Lossy<Saver>.self, key)?.items ?? []
    }

    func covers(_ key: Key) -> [String] {
        (loose(Lossy<Cover>.self, key)?.items ?? []).compactMap(\.url)
    }

    func posts(_ key: Key) -> [PhonePost] {
        (loose(Lossy<PostOrWrapped>.self, key)?.items ?? []).map(\.post)
    }
}

/// A post, or `{ post: … }` (the web's moment items).
private struct PostOrWrapped: Decodable {
    let post: PhonePost
    private enum Keys: String, CodingKey { case post }
    init(from decoder: Decoder) throws {
        if let post = try? PhonePost(from: decoder) {
            self.post = post
        } else {
            post = try decoder.container(keyedBy: Keys.self).decode(PhonePost.self, forKey: .post)
        }
    }
}

// MARK: - The feed

enum FeedMode: String, CaseIterable {
    /// Only what you haven't seen, blended. Ends with "You're all caught up".
    case new
    /// Everyone's saves, seen or not.
    case everyone
    /// Everyone's but yours.
    case friends
    /// Just yours.
    case mine
}

/// What the feed plays. Videos and photos by default; words are opt-in.
enum FeedType: String, CaseIterable, Codable, Identifiable {
    case video, photo, text, article
    var id: String { rawValue }

    static let standard: Set<FeedType> = [.video, .photo]

    /// A post's type for the filter (a sound plays like a video).
    init(kind: String) {
        switch kind {
        case "photo": self = .photo
        case "text": self = .text
        case "article": self = .article
        default: self = .video
        }
    }

    /// "4 text posts", "1 article".
    func count(_ n: Int) -> String {
        switch self {
        case .video: return n == 1 ? "1 video" : "\(n) videos"
        case .photo: return n == 1 ? "1 photo" : "\(n) photos"
        case .text: return n == 1 ? "1 text post" : "\(n) text posts"
        case .article: return n == 1 ? "1 article" : "\(n) articles"
        }
    }

    /// In the order the filter lists them, for the query.
    static func query(_ types: Set<FeedType>) -> String {
        allCases.filter(types.contains).map(\.rawValue).joined(separator: ",")
    }
}

struct FeedPage: Decodable {
    let items: [PhonePost]
    let nextCursor: String?
    let caughtUp: Bool
    /// Posts the type filter left out, when the server says (`{ text: 4 }`).
    let hidden: [FeedType: Int]
    /// Nothing new on the whole server yet (not "you've seen it all").
    let nothingYet: Bool

    private enum Keys: String, CodingKey { case items, nextCursor, caughtUp, hidden, nothingYet }

    init(items: [PhonePost], nextCursor: String?, caughtUp: Bool, hidden: [FeedType: Int] = [:],
         nothingYet: Bool = false) {
        self.items = items
        self.nextCursor = nextCursor
        self.caughtUp = caughtUp
        self.hidden = hidden
        self.nothingYet = nothingYet
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        items = c.posts(.items)
        nextCursor = c.loose(String.self, .nextCursor)
        caughtUp = c.loose(Bool.self, .caughtUp) ?? (nextCursor == nil)
        nothingYet = c.loose(Bool.self, .nothingYet) ?? false
        var hidden: [FeedType: Int] = [:]
        for (key, value) in c.loose([String: Int].self, .hidden) ?? [:] {
            if let type = FeedType(rawValue: key), value > 0 { hidden[type] = value }
        }
        self.hidden = hidden
    }
}

private struct FeedTypesAnswer: Decodable {
    let types: [FeedType]
    private enum Keys: String, CodingKey { case types }
    init(from decoder: Decoder) throws {
        let names = (try? decoder.container(keyedBy: Keys.self).decode([String].self, forKey: .types)) ?? []
        types = names.compactMap(FeedType.init(rawValue:))
    }
}

// MARK: - Channels

enum ChannelKind: String {
    case group, friend, mine
}

/// A channel made from everyone's saves (group) or from yours (mine).
struct ChannelSummary: Decodable, Hashable, Identifiable {
    let slug: String
    let name: String
    let size: Int?
    let covers: [String]
    let savers: [Saver]
    let newCount: Int?
    let note: String?

    var id: String { slug }

    private enum Keys: String, CodingKey { case slug, name, title, size, count, covers, savers, newCount, description }

    init(slug: String, name: String, size: Int?, covers: [String], savers: [Saver] = [],
         newCount: Int? = nil, note: String? = nil) {
        self.slug = slug
        self.name = name
        self.size = size
        self.covers = covers
        self.savers = savers
        self.newCount = newCount
        self.note = note
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        slug = try c.decode(String.self, forKey: .slug)
        name = c.loose(String.self, .name) ?? c.loose(String.self, .title) ?? slug
        size = c.looseInt(.size) ?? c.looseInt(.count)
        covers = c.covers(.covers)
        savers = c.savers(.savers)
        newCount = c.looseInt(.newCount)
        note = c.loose(String.self, .description)
    }
}

/// One of your people, as a channel of their saves.
struct FriendSummary: Decodable, Hashable, Identifiable {
    let username: String
    let name: String?
    let avatarUrl: String?
    let size: Int?
    let newCount: Int
    let covers: [String]

    var id: String { username }
    var displayName: String { Saver(username: username, name: name).displayName }
    var asSaver: Saver { Saver(username: username, name: name, avatarUrl: avatarUrl) }

    private enum Keys: String, CodingKey { case username, name, avatarUrl, size, count, newCount, covers }

    init(username: String, name: String?, avatarUrl: String?, size: Int?, newCount: Int, covers: [String]) {
        self.username = username
        self.name = name
        self.avatarUrl = avatarUrl
        self.size = size
        self.newCount = newCount
        self.covers = covers
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        username = try c.decode(String.self, forKey: .username)
        name = c.loose(String.self, .name)
        avatarUrl = c.loose(String.self, .avatarUrl)
        size = c.looseInt(.size) ?? c.looseInt(.count)
        newCount = c.looseInt(.newCount) ?? 0
        covers = c.covers(.covers)
    }
}

struct ChannelsIndex: Decodable {
    let group: [ChannelSummary]
    let friends: [FriendSummary]
    let mine: [ChannelSummary]

    private enum Keys: String, CodingKey { case group, friends, mine }

    init(group: [ChannelSummary], friends: [FriendSummary], mine: [ChannelSummary]) {
        self.group = group
        self.friends = friends
        self.mine = mine
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        group = c.loose(Lossy<ChannelSummary>.self, .group)?.items ?? []
        friends = c.loose(Lossy<FriendSummary>.self, .friends)?.items ?? []
        mine = c.loose(Lossy<ChannelSummary>.self, .mine)?.items ?? []
    }

    var isEmpty: Bool { group.isEmpty && friends.isEmpty && mine.isEmpty }
}

private struct ItemsAnswer: Decodable {
    let items: [PhonePost]
    private enum Keys: String, CodingKey { case items }
    init(from decoder: Decoder) throws {
        items = try decoder.container(keyedBy: Keys.self).posts(.items)
    }
}

// MARK: - Live

/// A moment: what a few of your lot are saving around the same thing, now.
/// The server's field set is still settling, so only `slug` is required.
struct LiveMoment: Decodable, Hashable, Identifiable {
    let slug: String
    let name: String
    /// How many people saved into it.
    let people: Int?
    let posts: Int?
    let savers: [Saver]
    /// How many are tuned in, and who (members only).
    let watching: Int?
    let watchers: [Saver]
    let covers: [String]
    let live: Bool
    /// The moment's colour on the web ("#ff8fa3"), when it has one.
    let hue: String?
    /// A short line instead of LIVE ("Last few days", "Forming").
    let label: String?

    var id: String { slug }

    private enum Keys: String, CodingKey {
        case slug, name, title, people, posts, savers, watching, watchers, covers, live, hue, label
    }

    init(slug: String, name: String, people: Int? = nil, posts: Int? = nil, savers: [Saver] = [],
         watching: Int? = nil, watchers: [Saver] = [], covers: [String] = [], live: Bool = true,
         hue: String? = nil, label: String? = nil) {
        self.slug = slug
        self.name = name
        self.people = people
        self.posts = posts
        self.savers = savers
        self.watching = watching
        self.watchers = watchers
        self.covers = covers
        self.live = live
        self.hue = hue
        self.label = label
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        slug = try c.decode(String.self, forKey: .slug)
        name = c.loose(String.self, .name) ?? c.loose(String.self, .title) ?? slug
        let savers = c.savers(.savers)
        // `people` is a count; take a list of people too, in case.
        let peopleList = c.savers(.people)
        self.savers = savers.isEmpty ? peopleList : savers
        people = c.looseInt(.people) ?? (peopleList.isEmpty ? nil : peopleList.count)
        posts = c.looseInt(.posts)
        let watchers = c.savers(.watchers)
        let watchingList = c.savers(.watching)
        self.watchers = watchers.isEmpty ? watchingList : watchers
        watching = c.looseInt(.watching) ?? (self.watchers.isEmpty ? nil : self.watchers.count)
        covers = c.covers(.covers)
        live = c.loose(Bool.self, .live) ?? true
        hue = c.loose(String.self, .hue)
        label = c.loose(String.self, .label)
    }
}

private struct LiveAnswer: Decodable {
    let moments: [LiveMoment]
    private enum Keys: String, CodingKey { case moments }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        moments = c.loose(Lossy<LiveMoment>.self, .moments)?.items ?? []
    }
}

struct LiveDetail: Decodable {
    let moment: LiveMoment?
    let items: [PhonePost]
    let watchers: [Saver]
    /// Recent reactions from people tuned in, to float up the screen.
    let reactions: [LiveReactionEvent]

    private enum Keys: String, CodingKey { case moment, items, watchers, reactions }

    init(moment: LiveMoment?, items: [PhonePost], watchers: [Saver], reactions: [LiveReactionEvent] = []) {
        self.moment = moment
        self.items = items
        self.watchers = watchers
        self.reactions = reactions
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        moment = c.loose(LiveMoment.self, .moment)
        items = c.posts(.items)
        let watchers = c.savers(.watchers)
        self.watchers = watchers.isEmpty ? (moment?.watchers ?? []) : watchers
        reactions = c.loose(Lossy<LiveReactionEvent>.self, .reactions)?.items ?? []
    }
}

/// What you send while tuned in: one of the quick emoji, or a few words.
enum LiveSay: Equatable {
    case emoji(String)
    case text(String)

    /// The quick ones, with what VoiceOver calls them.
    static let quick: [(emoji: String, name: String)] = [
        ("😂", "Laughing"), ("🔥", "Fire"), ("😭", "Crying"), ("👀", "Eyes"), ("💀", "Skull"), ("❤️", "Heart"),
    ]
    static let maxText = 40
}

/// Someone's reaction, from the live poll. The shape is still settling: the
/// person is a `saver` (or `by`/`from`/`user`), or their fields inline.
struct LiveReactionEvent: Decodable, Hashable, Identifiable {
    let id: String
    let saver: Saver
    let emoji: String?
    let text: String?
    let at: String?

    private enum Keys: String, CodingKey {
        case id, saver, by, from, user, emoji, text, at, createdAt, platform, postId
    }

    init(id: String, saver: Saver, emoji: String?, text: String?, at: String? = nil) {
        self.id = id
        self.saver = saver
        self.emoji = emoji
        self.text = text
        self.at = at
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        let person = c.loose(Saver.self, .saver) ?? c.loose(Saver.self, .by)
            ?? c.loose(Saver.self, .from) ?? c.loose(Saver.self, .user) ?? (try? Saver(from: decoder))
        guard let person else {
            throw DecodingError.dataCorruptedError(forKey: .saver, in: c, debugDescription: "No one reacted")
        }
        saver = person
        let emoji = c.loose(String.self, .emoji).flatMap { $0.isEmpty ? nil : $0 }
        let text = c.loose(String.self, .text).flatMap { $0.isEmpty ? nil : String($0.prefix(LiveSay.maxText)) }
        guard emoji != nil || text != nil else {
            throw DecodingError.dataCorruptedError(forKey: .emoji, in: c, debugDescription: "Nothing said")
        }
        self.emoji = emoji
        self.text = text
        at = c.loose(String.self, .at) ?? c.loose(String.self, .createdAt)
        id = c.loose(String.self, .id) ?? c.looseInt(.id).map(String.init)
            ?? [person.username, at ?? "", emoji ?? "", text ?? ""].joined(separator: "|")
    }
}

/// A 204, or an answer nobody needs.
private struct Nothing: Decodable {}

// MARK: - Client

extension ADHXClient {
    /// The friends feed, a page at a time.
    func feed(mode: FeedMode, cursor: String?, types: Set<FeedType> = FeedType.standard) async throws -> FeedPage {
        var query = [URLQueryItem(name: "mode", value: mode.rawValue),
                     URLQueryItem(name: "types", value: FeedType.query(types))]
        if let cursor { query.append(URLQueryItem(name: "cursor", value: cursor)) }
        return try await send("GET", "/api/app/feed", query: query)
    }

    /// Your saved feed filter (nil: none saved, or empty).
    func feedTypes() async throws -> Set<FeedType>? {
        let answer: FeedTypesAnswer = try await send("GET", "/api/app/feed/types")
        return answer.types.isEmpty ? nil : Set(answer.types)
    }

    func setFeedTypes(_ types: Set<FeedType>) async throws {
        let _: Nothing = try await send(
            "PUT", "/api/app/feed/types", body: ["types": FeedType.allCases.filter(types.contains).map(\.rawValue)])
    }

    /// Marks posts as watched (at most 50 at a time).
    func seen(_ posts: [PostRef]) async throws {
        let body: [String: Any] = ["posts": posts.prefix(50).map { ["platform": $0.platform, "id": $0.id] }]
        let _: Nothing = try await send("POST", "/api/app/seen", body: body)
    }

    func channels() async throws -> ChannelsIndex {
        try await send("GET", "/api/app/channels")
    }

    /// A channel's play queue.
    func channel(_ kind: ChannelKind, slug: String) async throws -> [PhonePost] {
        let answer: ItemsAnswer = try await send(
            "GET", "/api/app/channels/\(kind.rawValue)/\(Self.pathPart(slug))")
        return answer.items
    }

    func live() async throws -> [LiveMoment] {
        let answer: LiveAnswer = try await send("GET", "/api/app/live")
        return answer.moments
    }

    func live(slug: String) async throws -> LiveDetail {
        try await send("GET", "/api/app/live/\(Self.pathPart(slug))")
    }

    func react(slug: String, _ say: LiveSay, to post: PostRef) async throws {
        var body: [String: Any] = ["platform": post.platform, "id": post.id]
        switch say {
        case .emoji(let emoji): body["emoji"] = emoji
        case .text(let text): body["text"] = String(text.prefix(LiveSay.maxText))
        }
        let _: Nothing = try await send("POST", "/api/app/live/\(Self.pathPart(slug))/react", body: body)
    }

    /// One percent-encoded path segment (a slash in a slug stays in the segment).
    static func pathPart(_ text: String) -> String {
        var allowed = CharacterSet.urlPathAllowed
        allowed.remove(charactersIn: "/?#%")
        return text.addingPercentEncoding(withAllowedCharacters: allowed) ?? text
    }
}
