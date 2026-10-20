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
    /// What they said with their save (at most 140 characters). Older
    /// servers don't send it.
    let note: String?

    var id: String { username }

    /// "You", their name, or their username.
    var displayName: String {
        if isYou { return "You" }
        if let name = name?.trimmingCharacters(in: .whitespacesAndNewlines), !name.isEmpty { return name }
        return username
    }

    init(username: String, name: String? = nil, avatarUrl: String? = nil, savedAt: String? = nil,
         isYou: Bool = false, note: String? = nil) {
        self.username = username
        self.name = name
        self.avatarUrl = avatarUrl
        self.savedAt = savedAt
        self.isYou = isYou
        self.note = Saver.clean(note)
    }

    private enum CodingKeys: String, CodingKey { case username, name, avatarUrl, savedAt, isYou, note }

    /// Trimmed, at most 140 characters, nil when empty.
    static func clean(_ note: String?) -> String? {
        guard let text = note?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return nil }
        return String(text.prefix(140))
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        username = try c.decode(String.self, forKey: .username)
        name = (try? c.decodeIfPresent(String.self, forKey: .name)) ?? nil
        avatarUrl = (try? c.decodeIfPresent(String.self, forKey: .avatarUrl)) ?? nil
        savedAt = (try? c.decodeIfPresent(String.self, forKey: .savedAt)) ?? nil
        isYou = (try? c.decodeIfPresent(Bool.self, forKey: .isYou)) ?? false
        note = Saver.clean((try? c.decodeIfPresent(String.self, forKey: .note)) ?? nil)
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

/// A friend's latest note on a save you may see (the note card on their
/// channel): `{ text, platform, id, savedAt }`.
struct FriendNote: Decodable, Hashable {
    let text: String
    let platform: String
    let id: String
    let savedAt: String?

    var key: String { "\(platform):\(id)" }

    private enum Keys: String, CodingKey { case text, note, platform, id, savedAt }

    init(text: String, platform: String, id: String, savedAt: String? = nil) {
        self.text = text
        self.platform = platform
        self.id = id
        self.savedAt = savedAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        guard let text = Saver.clean(c.loose(String.self, .text) ?? c.loose(String.self, .note)) else {
            throw DecodingError.dataCorruptedError(forKey: .text, in: c, debugDescription: "No note")
        }
        self.text = text
        platform = try c.decode(String.self, forKey: .platform)
        id = try c.decode(String.self, forKey: .id)
        savedAt = c.loose(String.self, .savedAt)
    }
}

/// A channel's play queue (`/api/app/channels/{kind}/{slug}`): its posts, each
/// with `isNew` on group and friend channels, a friend's `note`, and on a
/// group channel the channel of yours you kept it into (`kept`).
struct ChannelQueue: Decodable {
    let items: [PhonePost]
    let note: FriendNote?
    let kept: KeptChannel?

    private enum Keys: String, CodingKey { case items, note, kept }

    init(items: [PhonePost], note: FriendNote? = nil, kept: KeptChannel? = nil) {
        self.items = items
        self.note = note
        self.kept = kept
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        items = c.posts(.items)
        note = c.loose(FriendNote.self, .note)
        kept = c.loose(KeptChannel.self, .kept)
    }

    /// The posts you haven't saved or seen, in queue order.
    var fresh: [PhonePost] { items.filter { $0.isNew == true } }
}

/// "Show less / Show more from Ana": -1, 0 (normal) or 1 per username.
struct FeedWeights: Decodable {
    let weights: [String: Int]
    private enum Keys: String, CodingKey { case weights }
    init(weights: [String: Int]) { self.weights = weights }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        var out: [String: Int] = [:]
        if let raw = c.loose([String: Double].self, .weights) {
            for (name, value) in raw where value != 0 { out[name] = value > 0 ? 1 : -1 }
        }
        weights = out
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
    /// Saves into it in the last `windowMinutes` ("3 saves in 10 min"); 0 (or
    /// nil, from an older server) means say something else.
    let recentSaves: Int?
    let windowMinutes: Int?

    var id: String { slug }

    /// "3 saves in 10 min", or nil when nothing landed lately.
    var busyLine: String? {
        guard let recent = recentSaves, recent > 0, let window = windowMinutes, window > 0 else { return nil }
        return (recent == 1 ? "1 save" : "\(recent) saves") + " in \(window) min"
    }

    private enum Keys: String, CodingKey {
        case slug, name, title, people, posts, savers, watching, watchers, covers, live, hue, label,
             recentSaves, windowMinutes
    }

    init(slug: String, name: String, people: Int? = nil, posts: Int? = nil, savers: [Saver] = [],
         watching: Int? = nil, watchers: [Saver] = [], covers: [String] = [], live: Bool = true,
         hue: String? = nil, label: String? = nil, recentSaves: Int? = nil, windowMinutes: Int? = nil) {
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
        self.recentSaves = recentSaves
        self.windowMinutes = windowMinutes
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
        recentSaves = c.looseInt(.recentSaves)
        windowMinutes = c.looseInt(.windowMinutes)
    }
}

/// A group still forming: a few saves close together, not live yet
/// (`forming` in `/api/app/live`). It has no slug, so nothing to tune in to,
/// but you can ask to be told when it goes live (`alert`).
struct FormingMoment: Decodable, Hashable, Identifiable {
    let id: String
    let name: String
    let hue: String?
    let have: Int
    let need: Int
    /// "people" or "saves".
    let unit: String
    let covers: [String]
    /// The members saving into it, newest first (at most 4; `people` on
    /// newer servers, `savers` before).
    let savers: [Saver]
    /// You asked to be told when it goes live.
    var alert: Bool

    private enum Keys: String, CodingKey { case id, title, name, hue, have, need, unit, covers, savers, people, alert }

    init(id: String, name: String, hue: String? = nil, have: Int, need: Int, unit: String = "saves",
         covers: [String] = [], savers: [Saver] = [], alert: Bool = false) {
        self.id = id
        self.name = name
        self.hue = hue
        self.have = have
        self.need = need
        self.unit = unit
        self.covers = covers
        self.savers = savers
        self.alert = alert
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        id = c.loose(String.self, .id) ?? c.looseInt(.id).map(String.init) ?? UUID().uuidString
        name = c.loose(String.self, .title) ?? c.loose(String.self, .name) ?? "Something new"
        hue = c.loose(String.self, .hue)
        have = c.looseInt(.have) ?? 0
        need = c.looseInt(.need) ?? 0
        unit = c.loose(String.self, .unit) ?? "saves"
        covers = c.covers(.covers)
        let people = c.savers(.people)
        savers = people.isEmpty ? c.savers(.savers) : people
        alert = c.loose(Bool.self, .alert) ?? false
    }

    /// "1 more save to go live", "2 more people to go live".
    var toGoLine: String {
        let left = max(need - have, 1)
        let people = unit == "people"
        let noun = people ? (left == 1 ? "person" : "people") : (left == 1 ? "save" : "saves")
        return "\(left) more \(noun) to go live"
    }
}

/// Live: the moments, the groups still forming, and the window's label
/// ("Right now", "Last few days", "This week").
struct LiveSnapshot: Decodable {
    let moments: [LiveMoment]
    let forming: [FormingMoment]
    let label: String?

    private enum Keys: String, CodingKey { case moments, forming, label }

    init(moments: [LiveMoment], forming: [FormingMoment] = [], label: String? = nil) {
        self.moments = moments
        self.forming = forming
        self.label = label
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        moments = c.loose(Lossy<LiveMoment>.self, .moments)?.items ?? []
        forming = c.loose(Lossy<FormingMoment>.self, .forming)?.items ?? []
        label = c.loose(String.self, .label)
    }
}

struct LiveSaverUpdate: Decodable {
    let key: String
    let savers: [Saver]
    let isPrivate: Bool
}

struct LiveDetail: Decodable {
    let moment: LiveMoment?
    let items: [PhonePost]
    let watchers: [Saver]
    /// Recent reactions from people tuned in, to float up the screen.
    let reactions: [LiveReactionEvent]
    let removedKeys: [String]
    let saverUpdates: [LiveSaverUpdate]

    private enum Keys: String, CodingKey { case moment, items, watchers, reactions, removedKeys, saverUpdates }

    init(moment: LiveMoment?, items: [PhonePost], watchers: [Saver], reactions: [LiveReactionEvent] = [], removedKeys: [String] = [], saverUpdates: [LiveSaverUpdate] = []) {
        self.moment = moment
        self.items = items
        self.watchers = watchers
        self.reactions = reactions
        self.removedKeys = removedKeys
        self.saverUpdates = saverUpdates
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        moment = c.loose(LiveMoment.self, .moment)
        items = c.posts(.items)
        let watchers = c.savers(.watchers)
        self.watchers = watchers.isEmpty ? (moment?.watchers ?? []) : watchers
        reactions = c.loose(Lossy<LiveReactionEvent>.self, .reactions)?.items ?? []
        removedKeys = c.loose([String].self, .removedKeys) ?? []
        saverUpdates = c.loose([LiveSaverUpdate].self, .saverUpdates) ?? []
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
    static func clip(_ text: String) -> String {
        String(String.UnicodeScalarView(text.unicodeScalars.prefix(maxText)))
    }
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
        #if DEBUG
        // `-adhxDryRun YES`: look around a shared test server without changing it.
        if UserDefaults.standard.bool(forKey: "adhxDryRun") { return }
        #endif
        let body: [String: Any] = ["posts": posts.prefix(50).map { ["platform": $0.platform, "id": $0.id] }]
        let _: Nothing = try await send("POST", "/api/app/seen", body: body)
    }

    func channels() async throws -> ChannelsIndex {
        try await send("GET", "/api/app/channels")
    }

    /// A channel's play queue.
    func channel(_ kind: ChannelKind, slug: String) async throws -> [PhonePost] {
        try await channelQueue(kind, slug: slug).items
    }

    /// A channel's play queue with its new marks and (a friend's) note.
    func channelQueue(_ kind: ChannelKind, slug: String) async throws -> ChannelQueue {
        try await send("GET", "/api/app/channels/\(kind.rawValue)/\(Self.pathPart(slug))")
    }

    /// Who you asked to see more or less of (`{ ana: 1, ben: -1 }`).
    func feedWeights() async throws -> [String: Int] {
        let answer: FeedWeights = try await send("GET", "/api/app/feed/weights")
        return answer.weights
    }

    /// Show more (1), less (-1) or the usual (0) from someone; the weights after.
    func setFeedWeight(_ username: String, _ weight: Int) async throws -> [String: Int] {
        let answer: FeedWeights = try await send(
            "PUT", "/api/app/feed/weights", body: ["username": username, "weight": max(-1, min(1, weight))])
        return answer.weights
    }

    func live() async throws -> LiveSnapshot {
        try await send("GET", "/api/app/live")
    }

    func live(slug: String, watching session: String? = nil, known: [String] = []) async throws -> LiveDetail {
        do {
            return try await send("POST", "/api/app/live/\(Self.pathPart(slug))",
                                  body: ["known": Array(known.prefix(200))],
                                  headers: session.map { ["X-ADHX-Watch": $0] } ?? [:])
        } catch APIError.server(status: 405, code: _, message: _) {
            return try await send("GET", "/api/app/live/\(Self.pathPart(slug))")
        }
    }

    func leaveLive(slug: String, session: String) async throws {
        let _: Nothing = try await send("DELETE", "/api/app/live/\(Self.pathPart(slug))",
                                        headers: ["X-ADHX-Watch": session], timeout: 5)
    }

    func react(slug: String, _ say: LiveSay, to post: PostRef) async throws {
        var body: [String: Any] = ["platform": post.platform, "id": post.id]
        switch say {
        case .emoji(let emoji): body["emoji"] = emoji
        case .text(let text): body["text"] = LiveSay.clip(text)
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

// MARK: - Straight to your people (board j4-4)

/// One of your people in the send sheet's "Or straight to your people" row.
/// `has`: they already have a save of it they can see. `sent`: you've sent it
/// to them already.
struct SendPerson: Decodable, Hashable, Identifiable {
    let username: String
    let name: String?
    let avatarUrl: String?
    var has: Bool
    var sent: Bool

    var id: String { username }
    var asSaver: Saver { Saver(username: username, name: name, avatarUrl: avatarUrl) }
    var displayName: String { asSaver.displayName }

    private enum Keys: String, CodingKey { case username, name, avatarUrl, has, sent }

    init(username: String, name: String? = nil, avatarUrl: String? = nil, has: Bool = false, sent: Bool = false) {
        self.username = username
        self.name = name
        self.avatarUrl = avatarUrl
        self.has = has
        self.sent = sent
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        username = try c.decode(String.self, forKey: .username)
        name = c.loose(String.self, .name)
        avatarUrl = c.loose(String.self, .avatarUrl)
        has = c.loose(Bool.self, .has) ?? false
        sent = c.loose(Bool.self, .sent) ?? false
    }
}

/// `GET /api/app/send`: who you can send a post to. Not `sendable` when the
/// only save you can see is your own private one ("Just for you").
struct SendTargets: Decodable {
    let sendable: Bool
    let people: [SendPerson]

    private enum Keys: String, CodingKey { case sendable, people }

    init(sendable: Bool, people: [SendPerson]) {
        self.sendable = sendable
        self.people = people
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        people = c.loose(Lossy<SendPerson>.self, .people)?.items ?? []
        sendable = c.loose(Bool.self, .sendable) ?? true
    }

    /// "Jo already has it.", "Jo and Ben already have it.", nil when nobody does.
    var alreadyLine: String? {
        let names = people.filter(\.has).map(\.displayName)
        guard !names.isEmpty else { return nil }
        return SendTargets.names(names) + (names.count == 1 ? " already has it." : " already have it.")
    }

    /// "Ana", "Ana and Ben", "Ana, Ben and Mum", "Ana, Ben, Mum and 2 others".
    static func names(_ names: [String], upTo limit: Int = 3) -> String {
        guard names.count > 1 else { return names.first ?? "" }
        if names.count <= limit { return names.dropLast().joined(separator: ", ") + " and " + names[names.count - 1] }
        let rest = names.count - limit
        return names.prefix(limit).joined(separator: ", ") + " and \(rest) other" + (rest == 1 ? "" : "s")
    }
}

/// `POST /api/app/send`: who got it, and who didn't (`has`, `sent`, `unknown`).
struct SendResult: Decodable {
    struct Skipped: Decodable, Hashable {
        let username: String
        let reason: String
    }

    let sent: [String]
    let skipped: [Skipped]

    private enum Keys: String, CodingKey { case sent, skipped }

    init(sent: [String], skipped: [Skipped] = []) {
        self.sent = sent
        self.skipped = skipped
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        sent = c.loose([String].self, .sent) ?? []
        skipped = c.loose(Lossy<Skipped>.self, .skipped)?.items ?? []
    }
}

// MARK: - "Tell me when it's live" (board j7-3)

/// A forming group went live: one alert per subscriber (`GET /api/app/alerts`).
struct LiveAlert: Decodable, Hashable, Identifiable {
    let id: String
    let slug: String
    let title: String
    let at: String?

    private enum Keys: String, CodingKey { case id, slug, title, name, at }

    init(id: String, slug: String, title: String, at: String? = nil) {
        self.id = id
        self.slug = slug
        self.title = title
        self.at = at
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        guard let id = c.loose(String.self, .id) ?? c.looseInt(.id).map(String.init),
              let slug = c.loose(String.self, .slug), !slug.isEmpty else {
            throw DecodingError.dataCorruptedError(forKey: .slug, in: c, debugDescription: "No moment")
        }
        self.id = id
        self.slug = slug
        title = c.loose(String.self, .title) ?? c.loose(String.self, .name) ?? "A moment"
        at = c.loose(String.self, .at)
    }

    /// "Kitchen synths is live".
    var headline: String { "\(title) is live" }
}

struct LiveAlerts: Decodable {
    let alerts: [LiveAlert]
    private enum Keys: String, CodingKey { case alerts }
    init(alerts: [LiveAlert]) { self.alerts = alerts }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        alerts = c.loose(Lossy<LiveAlert>.self, .alerts)?.items ?? []
    }
}

/// The alerts this phone has already shown, so one that fails to be marked
/// seen (offline, or the background task cut short) isn't shown twice.
struct AlertLedger: Equatable {
    static let limit = 100
    private(set) var told: [String]

    init(told: [String] = []) { self.told = Array(told.suffix(Self.limit)) }

    func untold(_ alerts: [LiveAlert]) -> [LiveAlert] {
        let known = Set(told)
        return alerts.filter { !known.contains($0.id) }
    }

    mutating func remember(_ alerts: [LiveAlert]) {
        let known = Set(told)
        told.append(contentsOf: alerts.map(\.id).filter { !known.contains($0) })
        told = Array(told.suffix(Self.limit))
    }
}

private struct AlertAnswer: Decodable {
    let alert: Bool
    private enum Keys: String, CodingKey { case alert }
    init(from decoder: Decoder) throws {
        alert = (try? decoder.container(keyedBy: Keys.self).decode(Bool.self, forKey: .alert)) ?? false
    }
}

// MARK: - Keep this channel (board j6-2)

/// Your channel a group channel was kept into: `{ tag, url }`.
struct KeptChannel: Decodable, Hashable {
    let tag: String
    let url: String?

    private enum Keys: String, CodingKey { case tag, url }

    init(tag: String, url: String? = nil) {
        self.tag = tag
        self.url = url
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        guard let tag = c.loose(String.self, .tag), !tag.isEmpty else {
            throw DecodingError.dataCorruptedError(forKey: .tag, in: c, debugDescription: "No tag")
        }
        self.tag = tag
        url = c.loose(String.self, .url)
    }
}

/// `POST /api/app/channels/group/{slug}/keep`: the channel and how many posts went in.
struct KeepAnswer: Decodable {
    let kept: KeptChannel
    let added: Int?

    private enum Keys: String, CodingKey { case added }

    init(from decoder: Decoder) throws {
        kept = try KeptChannel(from: decoder)
        added = try decoder.container(keyedBy: Keys.self).looseInt(.added)
    }
}

extension ADHXClient {
    /// Who you can send a post to (`GET /api/app/send`).
    func sendTargets(_ post: PostRef) async throws -> SendTargets {
        try await send("GET", "/api/app/send", query: [URLQueryItem(name: "platform", value: post.platform),
                                                        URLQueryItem(name: "id", value: post.id)])
    }

    /// Sends a post straight to some of your people (`POST /api/app/send`).
    func sendPost(_ post: PostRef, to people: [String], note: String? = nil) async throws -> SendResult {
        var body: [String: Any] = ["platform": post.platform, "id": post.id, "to": people]
        if let note = Saver.clean(note) { body["note"] = note }
        return try await send("POST", "/api/app/send", body: body)
    }

    /// Asks (or stops asking) to be told when a forming group goes live; what's set after.
    func setFormingAlert(_ id: String, on: Bool) async throws -> Bool {
        let answer: AlertAnswer = try await send(on ? "PUT" : "DELETE",
                                                 "/api/app/live/forming/\(Self.pathPart(id))/alert")
        return answer.alert
    }

    /// Moments you asked about that went live and you haven't been told about.
    func liveAlerts() async throws -> [LiveAlert] {
        let page: LiveAlerts = try await send("GET", "/api/app/alerts")
        return page.alerts
    }

    func markAlertsSeen(_ ids: [String]) async throws {
        guard !ids.isEmpty else { return }
        let _: Nothing = try await send("POST", "/api/app/alerts/seen", body: ["ids": Array(ids.prefix(50))])
    }

    /// Keeps a group channel as one of yours (`POST /api/app/channels/group/{slug}/keep`).
    func keepGroupChannel(_ slug: String) async throws -> KeepAnswer {
        try await send("POST", "/api/app/channels/group/\(Self.pathPart(slug))/keep")
    }
}
