import Foundation

// Settings and "What your ADHX is doing" on the phone
// (docs/specs/friends-feed.md → API additions). Decoded loosely, like the
// rest of the friends feed: a server mid-upgrade may leave fields out.

private extension KeyedDecodingContainer {
    func text(_ key: Key) -> String? { (try? decodeIfPresent(String.self, forKey: key)) ?? nil }
    func flag(_ key: Key) -> Bool? { (try? decodeIfPresent(Bool.self, forKey: key)) ?? nil }
    func number(_ key: Key) -> Int? {
        if let n = (try? decodeIfPresent(Int.self, forKey: key)) ?? nil { return n }
        if let d = (try? decodeIfPresent(Double.self, forKey: key)) ?? nil { return Int(d.rounded()) }
        return nil
    }
}

// MARK: - Your people (`GET /api/app/people`)

/// Someone let in on this server, with the saves you can see.
struct Person: Decodable, Hashable, Identifiable {
    let username: String
    let name: String?
    let avatarUrl: String?
    let saves: Int
    let lastSavedAt: String?
    /// owner · admin · member
    let role: String
    /// Admins only see banned members.
    let banned: Bool
    let isYou: Bool

    var id: String { username }
    var asSaver: Saver { Saver(username: username, name: name, avatarUrl: avatarUrl, isYou: isYou) }
    /// For drawing their face: their own initial, even on yours (not "Y" for You).
    var face: Saver { Saver(username: username, name: name, avatarUrl: avatarUrl) }

    /// Their name, or their username (never "You": this names them in lists).
    var shownName: String {
        if let name = name?.trimmingCharacters(in: .whitespacesAndNewlines), !name.isEmpty { return name }
        return username
    }

    private enum Keys: String, CodingKey { case username, name, avatarUrl, saves, lastSavedAt, role, banned, isYou }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        username = try c.decode(String.self, forKey: .username)
        name = c.text(.name)
        avatarUrl = c.text(.avatarUrl)
        saves = c.number(.saves) ?? 0
        lastSavedAt = c.text(.lastSavedAt)
        role = c.text(.role) ?? "member"
        banned = c.flag(.banned) ?? false
        isYou = c.flag(.isYou) ?? false
    }
}

/// Someone a member invited, waiting for an admin to let them in.
struct JoinRequest: Decodable, Hashable, Identifiable {
    struct Inviter: Decodable, Hashable {
        let username: String
        let name: String?
        var shownName: String {
            if let name = name?.trimmingCharacters(in: .whitespacesAndNewlines), !name.isEmpty { return name }
            return username
        }
    }

    /// The invite they joined with: the handle for deciding.
    let id: String
    let username: String
    let name: String?
    let askedAt: String?
    let invitedBy: Inviter?

    var shownName: String {
        if let name = name?.trimmingCharacters(in: .whitespacesAndNewlines), !name.isEmpty { return name }
        return username
    }

    var asSaver: Saver { Saver(username: username, name: name) }

    private enum Keys: String, CodingKey { case id, username, name, askedAt, invitedBy }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        id = try c.decode(String.self, forKey: .id)
        username = try c.decode(String.self, forKey: .username)
        name = c.text(.name)
        askedAt = c.text(.askedAt)
        invitedBy = (try? c.decodeIfPresent(Inviter.self, forKey: .invitedBy)) ?? nil
    }
}

/// An admin's answer to someone waiting.
enum JoinDecision: String {
    case approve, notNow = "not_now", decline
}

/// `{ members, isAdmin, canInvite, inviteMode, requests? }`
struct PeopleAnswer: Decodable {
    let members: [Person]
    let isAdmin: Bool
    let canInvite: Bool
    /// admin · approve · anyone
    let inviteMode: String?
    /// Admins only.
    let requests: [JoinRequest]

    private enum Keys: String, CodingKey { case members, isAdmin, canInvite, inviteMode, requests }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        members = (try? c.decodeIfPresent(Lossy<Person>.self, forKey: .members))?.items ?? []
        isAdmin = c.flag(.isAdmin) ?? false
        canInvite = c.flag(.canInvite) ?? false
        inviteMode = c.text(.inviteMode)
        requests = (try? c.decodeIfPresent(Lossy<JoinRequest>.self, forKey: .requests))?.items ?? []
    }
}

// MARK: - What your ADHX is doing (`GET /api/app/doing`)

/// One post on its way, stuck, or finished in the last half hour.
struct DoingItem: Decodable, Hashable, Identifiable {
    let platform: String
    let postId: String
    let title: String
    /// "Instagram video"
    let network: String?
    let thumbnail: String?
    let savers: [Saver]
    let savedAt: String?
    /// 1–7: Got the link … Ready.
    let step: Int
    let stepLabel: String
    let steps: Int
    let percent: Int?
    /// working · waiting · needs_you · ready
    let status: String
    /// It plays already, even while it's still being learned.
    let playable: Bool
    /// Plain words for a failure or a wait.
    let reason: String?
    let quality: String?
    /// What was learned, for a finished post.
    let learned: [String]
    /// You saved it, so you may press Retry.
    let retry: Bool
    let finishedAt: String?

    var id: String { "\(platform):\(postId)" }
    var ref: PostRef { PostRef(platform: platform, id: postId) }
    var needsYou: Bool { status == "needs_you" }
    var isReady: Bool { status == "ready" }

    private enum Keys: String, CodingKey {
        case platform, id, title, network, thumbnail, savers, savedAt, step, stepLabel, steps, percent,
             status, playable, reason, quality, learned, retry, finishedAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        platform = try c.decode(String.self, forKey: .platform)
        postId = try c.decode(String.self, forKey: .id)
        title = c.text(.title) ?? "A post"
        network = c.text(.network)
        thumbnail = c.text(.thumbnail)
        savers = (try? c.decodeIfPresent(Lossy<Saver>.self, forKey: .savers))?.items ?? []
        savedAt = c.text(.savedAt)
        step = c.number(.step) ?? 1
        stepLabel = c.text(.stepLabel) ?? "On its way"
        steps = max(1, c.number(.steps) ?? 7)
        percent = c.number(.percent)
        status = c.text(.status) ?? "working"
        playable = c.flag(.playable) ?? false
        reason = c.text(.reason)
        quality = c.text(.quality)
        learned = (try? c.decodeIfPresent([String].self, forKey: .learned)) ?? []
        retry = c.flag(.retry) ?? false
        finishedAt = c.text(.finishedAt)
    }
}

struct DoingSummary: Decodable, Hashable {
    /// Still on their way: working, waiting or needing you.
    let onTheirWay: Int
    let needsYou: Int
    let ready: Int
    let freeBytes: Int?
    /// local · remote (a Mac helper does the learning and converting)
    let processing: String?
    let remoteConnected: Bool?

    init(onTheirWay: Int = 0, needsYou: Int = 0, ready: Int = 0) {
        self.onTheirWay = onTheirWay
        self.needsYou = needsYou
        self.ready = ready
        freeBytes = nil
        processing = nil
        remoteConnected = nil
    }

    private enum Keys: String, CodingKey { case onTheirWay, needsYou, ready, freeBytes, processing, remoteConnected }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        onTheirWay = c.number(.onTheirWay) ?? 0
        needsYou = c.number(.needsYou) ?? 0
        ready = c.number(.ready) ?? 0
        freeBytes = c.number(.freeBytes)
        processing = c.text(.processing)
        remoteConnected = c.flag(.remoteConnected)
    }
}

struct DoingAnswer: Decodable {
    let items: [DoingItem]
    let summary: DoingSummary

    private enum Keys: String, CodingKey { case items, summary }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        let items = (try? c.decodeIfPresent(Lossy<DoingItem>.self, forKey: .items))?.items ?? []
        self.items = items
        summary = (try? c.decodeIfPresent(DoingSummary.self, forKey: .summary)) ?? DoingSummary(
            onTheirWay: items.filter { !$0.isReady }.count,
            needsYou: items.filter(\.needsYou).count,
            ready: items.filter(\.isReady).count)
    }
}

private struct Answered: Decodable {}

// MARK: - Client

extension ADHXClient {
    /// Everyone let in, whether you can invite, and (admins) who's waiting.
    func people() async throws -> PeopleAnswer {
        try await send("GET", "/api/app/people")
    }

    /// Let someone in, not now, or keep them out (admins).
    func answer(request id: String, _ decision: JoinDecision) async throws {
        let _: Answered = try await send(
            "POST", "/api/app/people/requests/\(Self.pathPart(id))", body: ["decision": decision.rawValue])
    }

    /// Posts on their way, stuck or just finished, that you may see.
    func doing() async throws -> DoingAnswer {
        try await send("GET", "/api/app/doing", query: [URLQueryItem(name: "scope", value: "all")])
    }

    /// Start over on whatever is stuck for a post you saved.
    func retry(_ post: PostRef) async throws {
        let _: Answered = try await send(
            "POST", "/api/app/doing/retry", body: ["platform": post.platform, "id": post.id])
    }
}
