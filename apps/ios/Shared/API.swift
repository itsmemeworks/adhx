import Foundation

// MARK: - Answers (docs/specs/phone-app.md → API)

struct PairResult: Decodable {
    let key: String
    let name: String?
    let username: String?
}

struct MeResult: Decodable {
    let username: String?
    let name: String?
    /// Your picture; older servers don't send it.
    let avatarUrl: String?
    /// upload · gob · x · generated (newer servers).
    var avatarSource: String? = nil
}

struct KeptCounts: Codable, Equatable {
    var videos: Int?
    var photos: Int?
    var audio: Int?
}

struct SaveResult: Codable, Equatable {
    let platform: String
    let network: String?
    let id: String
    let author: String?
    let authorName: String?
    let text: String?
    let category: String?
    let posterUrl: String?
    let openPath: String?
    let alreadySaved: Bool?
    let savedAt: String?
    /// Your save is "Just for me" (older servers leave it out).
    var isPrivate: Bool? = nil
}

/// What the server said to a share: saved now (older servers), or taken and
/// being saved in the background (`Prefer: respond-async`).
enum SaveAnswer: Equatable {
    case saved(SaveResult)
    case queued(id: String)
}

private struct SaveOrQueued: Decodable {
    let answer: SaveAnswer

    private enum Keys: String, CodingKey { case queued, id }

    init(from decoder: Decoder) throws {
        let keys = try decoder.container(keyedBy: Keys.self)
        if (try? keys.decode(Bool.self, forKey: .queued)) == true {
            answer = .queued(id: try keys.decode(String.self, forKey: .id))
        } else {
            answer = .saved(try SaveResult(from: decoder))
        }
    }
}

/// How a link saved in the background is going (`GET /api/app/save?id=`).
struct QueuedSave: Decodable, Equatable {
    let id: String
    /// waiting · saving · saved · failed
    let state: String
    let post: SaveResult?
    let code: String?
    let error: String?
}

struct StatusResult: Decodable, Equatable {
    let platform: String?
    let id: String?
    let status: String
    let percent: Int?
    let quality: String?
    let kept: KeptCounts?
    /// While keeping: downloading or converting (re-encoding).
    let step: String?

    private enum CodingKeys: String, CodingKey { case platform, id, status, percent, quality, kept, step }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        platform = try c.decodeIfPresent(String.self, forKey: .platform)
        id = try c.decodeIfPresent(String.self, forKey: .id)
        status = try c.decode(String.self, forKey: .status)
        if let whole = try? c.decodeIfPresent(Int.self, forKey: .percent) {
            percent = whole
        } else if let fraction = try? c.decodeIfPresent(Double.self, forKey: .percent) {
            percent = Int(fraction.rounded())
        } else {
            percent = nil
        }
        quality = try c.decodeIfPresent(String.self, forKey: .quality)
        kept = try c.decodeIfPresent(KeptCounts.self, forKey: .kept)
        step = try c.decodeIfPresent(String.self, forKey: .step)
    }
}

// MARK: - Your saves, for the player and search (spec → PhonePost)

struct PhoneMedia: Decodable, Hashable {
    /// "video" or "photo". A sound-only post's sound is its video.
    let kind: String
    let url: String
    let posterUrl: String?
    let width: Int?
    let height: Int?
    let durationMs: Int?
}

struct PhoneAuthor: Decodable, Hashable {
    let handle: String
    let name: String?
    let avatarUrl: String?
}

struct PhoneArticle: Decodable, Hashable {
    let title: String?
    let description: String?
    let url: String
    /// The whole X article as markdown, when your ADHX kept it (newer servers).
    var body: String? = nil
}

struct PhoneMatch: Decodable, Hashable {
    /// strong · good · related
    let strength: String
    let on: [String]
}

/// One reason the feed picked a post (`whyReasons`): the first is the
/// headline (`why`). `kind` is together · more · like · close · fresh · yours
/// · sent; any other kind is shown as its words.
struct WhyReason: Decodable, Hashable {
    let kind: String?
    let text: String
    /// The friend the reason is about (who sent it, for `sent`).
    let username: String?
    /// `like`: the post of yours it's most like, for the thumbnail.
    let post: ReasonPost?

    init(kind: String? = nil, text: String, username: String? = nil, post: ReasonPost? = nil) {
        self.kind = kind
        self.text = text
        self.username = username
        self.post = post
    }

    private enum Keys: String, CodingKey { case kind, text, username, post }

    /// An object with `text`, or just a line.
    init(from decoder: Decoder) throws {
        if let line = try? decoder.singleValueContainer().decode(String.self) {
            self.init(text: line)
        } else {
            let c = try decoder.container(keyedBy: Keys.self)
            self.init(kind: (try? c.decodeIfPresent(String.self, forKey: .kind)) ?? nil,
                      text: try c.decode(String.self, forKey: .text),
                      username: (try? c.decodeIfPresent(String.self, forKey: .username)) ?? nil,
                      post: (try? c.decodeIfPresent(ReasonPost.self, forKey: .post)) ?? nil)
        }
        if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "empty reason"))
        }
    }
}

/// The post a `like` reason points at: `{ platform, id, posterUrl }`.
struct ReasonPost: Decodable, Hashable {
    let platform: String
    let id: String
    /// Relative to the server; nil when it has no picture.
    let posterUrl: String?

    var ref: PostRef { PostRef(platform: platform, id: id) }

    init(platform: String, id: String, posterUrl: String? = nil) {
        self.platform = platform
        self.id = id
        self.posterUrl = posterUrl
    }

    private enum Keys: String, CodingKey { case platform, id, posterUrl }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        platform = try c.decode(String.self, forKey: .platform)
        id = try c.decode(String.self, forKey: .id)
        let poster = (try? c.decodeIfPresent(String.self, forKey: .posterUrl)) ?? nil
        posterUrl = poster?.isEmpty == false ? poster : nil
    }
}

/// A post ready to play. Addresses are relative to the server.
extension PhonePost {
    /// Someone sent it to you and you haven't seen it yet ("Pete sent you this").
    var sentToYou: Bool { whyReasons.contains { $0.kind == "sent" } }
}

struct PhonePost: Decodable, Hashable {
    let platform: String
    let postId: String
    /// video · audio · photo · article · text
    let kind: String
    let author: PhoneAuthor
    let text: String
    let postedAt: String?
    let savedAt: String?
    let sourceUrl: String?
    let openPath: String
    let media: [PhoneMedia]
    let article: PhoneArticle?
    let match: PhoneMatch?
    let learning: Bool?
    /// The members who saved it, newest first (yours has `isYou`). Empty on
    /// older servers.
    var savers: [Saver]
    /// Your save is "Just for me".
    var isPrivate: Bool
    /// Why the feed picked it ("Ana and Ben saved this"). Feed items only.
    let why: String?
    /// Every reason, the headline first (feed items on newer servers).
    let whyReasons: [WhyReason]
    /// In a group or friend channel: you haven't saved or seen it ("New" on
    /// the tile). Nil elsewhere and on older servers.
    var isNew: Bool?

    /// Unique across networks (the same number can be an X and a TikTok id).
    var key: String { "\(platform):\(postId)" }
    var ref: PostRef { PostRef(platform: platform, id: postId) }
    var plays: Bool { kind == "video" || kind == "audio" }
    var posterUrl: String? { media.first?.posterUrl }

    private enum CodingKeys: String, CodingKey {
        case platform, postId = "id", kind, author, text, postedAt, savedAt, sourceUrl, openPath,
             media, article, match, learning, savers, isPrivate, why, whyReasons, isNew
    }

    init(platform: String, postId: String, kind: String, author: PhoneAuthor, text: String,
         postedAt: String? = nil, savedAt: String? = nil, sourceUrl: String? = nil, openPath: String = "/",
         media: [PhoneMedia] = [], article: PhoneArticle? = nil, match: PhoneMatch? = nil,
         learning: Bool? = nil, savers: [Saver] = [], isPrivate: Bool = false, why: String? = nil,
         whyReasons: [WhyReason] = [], isNew: Bool? = nil) {
        self.platform = platform
        self.postId = postId
        self.kind = kind
        self.author = author
        self.text = text
        self.postedAt = postedAt
        self.savedAt = savedAt
        self.sourceUrl = sourceUrl
        self.openPath = openPath
        self.media = media
        self.article = article
        self.match = match
        self.learning = learning
        self.savers = savers
        self.isPrivate = isPrivate
        self.why = why
        self.whyReasons = whyReasons
        self.isNew = isNew
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        platform = try c.decode(String.self, forKey: .platform)
        postId = try c.decode(String.self, forKey: .postId)
        kind = try c.decode(String.self, forKey: .kind)
        author = try c.decode(PhoneAuthor.self, forKey: .author)
        text = try c.decodeIfPresent(String.self, forKey: .text) ?? ""
        postedAt = try? c.decodeIfPresent(String.self, forKey: .postedAt)
        savedAt = try? c.decodeIfPresent(String.self, forKey: .savedAt)
        sourceUrl = try? c.decodeIfPresent(String.self, forKey: .sourceUrl)
        openPath = (try? c.decodeIfPresent(String.self, forKey: .openPath)) ?? "/"
        media = (try? c.decodeIfPresent(Lossy<PhoneMedia>.self, forKey: .media))?.items ?? []
        article = try? c.decodeIfPresent(PhoneArticle.self, forKey: .article)
        match = try? c.decodeIfPresent(PhoneMatch.self, forKey: .match)
        learning = try? c.decodeIfPresent(Bool.self, forKey: .learning)
        // Defensive: a server mid-upgrade may leave these out or get them wrong.
        savers = (try? c.decodeIfPresent(Lossy<Saver>.self, forKey: .savers))?.items ?? []
        isPrivate = (try? c.decodeIfPresent(Bool.self, forKey: .isPrivate)) ?? false
        isNew = (try? c.decodeIfPresent(Bool.self, forKey: .isNew)) ?? nil
        let reasons = (try? c.decodeIfPresent(Lossy<WhyReason>.self, forKey: .whyReasons))?.items ?? []
        whyReasons = reasons
        let why = (try? c.decodeIfPresent(String.self, forKey: .why)) ?? nil
        // The headline is the first reason when the server only sends the list.
        self.why = (why ?? reasons.first?.text)
            .flatMap { $0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : $0 }
    }
}

/// One of your saves, by network and id (a deep link into the player).
struct PostRef: Hashable, Identifiable {
    let platform: String
    let id: String
    var key: String { "\(platform):\(id)" }
}

struct SavesPage: Decodable {
    let items: [PhonePost]
    let total: Int
    let nextOffset: Int?
    /// Saves on their way: not in `items` until their copy is ready.
    let preparing: Int?
}

struct OneSave: Decodable {
    let item: PhonePost
}

struct SearchPage: Decodable {
    let items: [PhonePost]
    let total: Int
    /// False: meaning isn't ready on the server; these matched on exact words.
    let understood: Bool
    /// False: nothing matched closely; these are the nearest.
    let close: Bool
    let nextOffset: Int?
}

/// Keep states that won't change any more.
enum KeepStatus {
    static let final: Set<String> = ["kept", "unavailable", "off", "gone"]
}

// MARK: - Errors

enum APIError: Error {
    /// No answer, a timeout, or 502/503/504: queue it and try later.
    case offline
    /// It answered nothing in time (busy, not gone): treated like `offline`
    /// everywhere except where saying so helps (search).
    case slow
    /// 401: the phone key was removed on the server.
    case badKey(String)
    /// Any other error answer, with words fit to show.
    case server(status: Int, code: String?, message: String)

    var code: String? {
        switch self {
        case .offline: return "offline"
        case .slow: return "slow"
        case .badKey: return "bad_key"
        case .server(_, let code, _): return code
        }
    }

    var message: String {
        switch self {
        case .offline: return "Your ADHX can’t be reached right now."
        case .slow: return "Your ADHX is taking too long to answer. Try again in a moment."
        case .badKey(let message): return message
        case .server(_, _, let message): return message
        }
    }

    /// The server doesn't have this endpoint (an older ADHX), or not this
    /// channel or moment any more.
    var isMissing: Bool {
        if case .server(let status, _, _) = self, status == 404 { return true }
        return false
    }

    static func fallbackMessage(for code: String?) -> String {
        switch code {
        case "bad_code": return "That code didn’t work. Make a new one on your ADHX and try again."
        case "bad_key": return "This phone isn’t connected any more. Connect it again."
        case "no_link": return "There’s no link in that."
        case "unavailable": return "That post is gone, private or can’t be read."
        case "not_a_post": return "That’s not one post."
        case "not_saved": return "That post isn’t in your saves."
        default: return "Something went wrong on your ADHX. Try again in a bit."
        }
    }
}

private struct RemovedAnswer: Decodable {
    let ok: Bool?
}

private struct PrivateAnswer: Decodable {
    let `private`: Bool?
}

/// Whose saves search looks through.
enum SearchScope: String, CaseIterable {
    case everyone, mine
}

private struct ErrorBody: Decodable {
    let error: String?
    let code: String?
}

// MARK: - Client

/// Talks to one ADHX server with one phone key.
struct ADHXClient {
    let server: URL
    var key: String?

    static let timeout: TimeInterval = 15
    /// Search can take a while on a small server (the model runs there).
    static let searchTimeout: TimeInterval = 60

    private static let session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = timeout
        config.timeoutIntervalForResource = searchTimeout + 5
        config.waitsForConnectivity = false
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        return URLSession(configuration: config)
    }()

    func pair(code: String, name: String) async throws -> PairResult {
        try await send("POST", "/api/app/pair", body: ["code": code, "name": String(name.prefix(40))])
    }

    func me() async throws -> MeResult {
        try await send("GET", "/api/app/me")
    }

    /// Remove this phone: the server revokes this key (and only this key).
    /// A short wait, since the phone forgets the key either way.
    func removeThisPhone() async throws {
        let _: RemovedAnswer = try await send("DELETE", "/api/app/me", timeout: 8)
    }

    /// `isPrivate` saves it "Just for me"; nil leaves the server's default
    /// (shared with your people, or what a repeat save already had).
    /// `note` is what you say with it (at most 140 characters; older servers ignore it).
    func save(url: String, private isPrivate: Bool? = nil, deferPublish: Bool = false, requestId: String? = nil,
              note: String? = nil) async throws -> SaveAnswer {
        var body: [String: Any] = ["url": url]
        if let note = Saver.clean(note) { body["note"] = note }
        if let isPrivate { body["private"] = isPrivate }
        if deferPublish { body["deferPublish"] = true }
        if let requestId { body["requestId"] = requestId }
        let answer: SaveOrQueued = try await send(
            "POST", "/api/app/save", body: body, headers: ["Prefer": "respond-async"])
        return answer.answer
    }

    /// Sets (or, with nil, clears) your note on one of your saves. Answers the
    /// note the server kept (cleaned, at most 140 characters).
    func setNote(platform: String, id: String, note: String?) async throws -> String? {
        let answer: NoteAnswer = try await send(
            "POST", "/api/app/note", body: ["platform": platform, "id": id, "note": Saver.clean(note) ?? NSNull()])
        return answer.note
    }

    /// Switches one of your saves "Just for me" or back to shared. Answers the
    /// server's word for it.
    func setPrivate(platform: String, id: String, private isPrivate: Bool) async throws -> Bool {
        let answer: PrivateAnswer = try await send(
            "POST", "/api/app/private", body: ["platform": platform, "id": id, "private": isPrivate])
        return answer.private ?? isPrivate
    }

    /// Persist the share card's latest choice before a queued post is published.
    func queuedPrivacy(id: String, private isPrivate: Bool? = nil, intentVersion: Int? = nil) async throws {
        var body: [String: Any] = ["id": id]
        if let isPrivate { body["private"] = isPrivate }
        if let intentVersion { body["intentVersion"] = intentVersion }
        let _: [String: Bool] = try await send("PATCH", "/api/app/save", body: body)
    }

    func queuedSave(id: String) async throws -> QueuedSave {
        try await send("GET", "/api/app/save", query: [URLQueryItem(name: "id", value: id)])
    }

    func status(platform: String, id: String) async throws -> StatusResult {
        try await send("GET", "/api/app/status", query: [
            URLQueryItem(name: "platform", value: platform),
            URLQueryItem(name: "id", value: id),
        ])
    }

    func saves(offset: Int, limit: Int = 20) async throws -> SavesPage {
        try await send("GET", "/api/app/saves", query: [
            URLQueryItem(name: "offset", value: String(offset)),
            URLQueryItem(name: "limit", value: String(limit)),
        ])
    }

    func post(platform: String, id: String) async throws -> PhonePost {
        let one: OneSave = try await send("GET", "/api/app/saves", query: [
            URLQueryItem(name: "platform", value: platform),
            URLQueryItem(name: "id", value: id),
        ])
        return one.item
    }

    func search(_ q: String, scope: SearchScope = .mine, offset: Int = 0) async throws -> SearchPage {
        try await send("GET", "/api/app/search", query: [
            URLQueryItem(name: "q", value: q),
            URLQueryItem(name: "scope", value: scope.rawValue),
            URLQueryItem(name: "offset", value: String(offset)),
        ], timeout: Self.searchTimeout)
    }

    /// Resolves a relative address from the server (posterUrl, openPath).
    static func resolve(_ address: String?, against server: URL) -> URL? {
        guard let address, !address.isEmpty else { return nil }
        if let absolute = URL(string: address), absolute.scheme != nil { return absolute }
        return URL(string: address, relativeTo: server)?.absoluteURL
    }

    /// One request. `path` is already percent-encoded (see `pathPart`).
    func send<T: Decodable>(_ method: String, _ path: String,
                                    query: [URLQueryItem] = [],
                                    body: [String: Any]? = nil,
                                    headers: [String: String] = [:],
                                    timeout: TimeInterval = Self.timeout) async throws -> T {
        let data = try body.map { try JSONSerialization.data(withJSONObject: $0) }
        return try await send(method, path, query: query, data: data,
                              contentType: body == nil ? nil : "application/json",
                              headers: headers, timeout: timeout)
    }

    /// One request with a body that's already made (a photo's multipart form).
    func send<T: Decodable>(_ method: String, _ path: String,
                            query: [URLQueryItem] = [],
                            data body: Data?,
                            contentType: String?,
                            headers: [String: String] = [:],
                            timeout: TimeInterval = Self.timeout) async throws -> T {
        guard var comps = URLComponents(url: server, resolvingAgainstBaseURL: false) else {
            throw APIError.server(status: 0, code: "bad_address", message: "That address doesn’t look right.")
        }
        let base = comps.percentEncodedPath.hasSuffix("/")
            ? String(comps.percentEncodedPath.dropLast()) : comps.percentEncodedPath
        comps.percentEncodedPath = base + path
        comps.queryItems = query.isEmpty ? nil : query
        guard let url = comps.url else {
            throw APIError.server(status: 0, code: "bad_address", message: "That address doesn’t look right.")
        }

        var request = URLRequest(url: url, timeoutInterval: timeout)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let key { request.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization") }
        for (name, value) in headers { request.setValue(value, forHTTPHeaderField: name) }
        if let body {
            request.setValue(contentType ?? "application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = body
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await Self.session.data(for: request)
        } catch let error as URLError {
            if error.code == .cancelled { throw CancellationError() }
            if error.code == .appTransportSecurityRequiresSecureConnection {
                throw APIError.server(status: 0, code: "needs_https",
                                      message: "This address needs to start with https://.")
            }
            if error.code == .timedOut { throw APIError.slow }
            throw APIError.offline
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            throw APIError.offline
        }

        guard let http = response as? HTTPURLResponse else { throw APIError.offline }
        let status = http.statusCode
        if [502, 503, 504].contains(status) { throw APIError.offline }

        if (200..<300).contains(status) {
            do {
                // 204 (seen, reactions) has no body: read it as an empty object.
                let body = data.isEmpty || status == 204 ? Data("{}".utf8) : data
                return try JSONDecoder().decode(T.self, from: body)
            } catch {
                throw APIError.server(status: status, code: "bad_answer",
                                      message: "That address didn’t answer like an ADHX.")
            }
        }

        let errorBody = try? JSONDecoder().decode(ErrorBody.self, from: data)
        let code = errorBody?.code
        let message = errorBody?.error.flatMap { $0.isEmpty ? nil : $0 }
        if status == 401 {
            throw APIError.badKey(message ?? APIError.fallbackMessage(for: "bad_key"))
        }
        if errorBody == nil && status == 404 {
            throw APIError.server(status: status, code: "not_adhx",
                                  message: "That address didn’t answer like an ADHX.")
        }
        throw APIError.server(status: status, code: code,
                              message: message ?? APIError.fallbackMessage(for: code))
    }
}

// MARK: - Addresses and links

enum Links {
    /// Turns what someone typed ("adhx.example.com", "http://192.168.1.4:3000/")
    /// into a server origin. No scheme means https, except for local addresses.
    static func serverURL(from typed: String) -> URL? {
        var text = typed.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }
        if !text.lowercased().hasPrefix("http://") && !text.lowercased().hasPrefix("https://") {
            let host = text.split(separator: "/").first.map(String.init) ?? text
            let bare = host.split(separator: ":").first.map(String.init)?.lowercased() ?? host
            let local = bare == "localhost" || bare.hasSuffix(".local")
                || bare.allSatisfy { $0.isNumber || $0 == "." }
            text = (local ? "http://" : "https://") + text
        }
        guard var comps = URLComponents(string: text), let host = comps.host, !host.isEmpty else { return nil }
        comps.scheme = comps.scheme?.lowercased()
        comps.query = nil
        comps.fragment = nil
        while comps.path.hasSuffix("/") { comps.path.removeLast() }
        return comps.url
    }

    /// "host" or "host:port" for showing a server.
    static func displayHost(_ url: URL?) -> String {
        guard let url, let host = url.host else { return "" }
        if let port = url.port { return "\(host):\(port)" }
        return host
    }

    /// "vm.tiktok.com/ZMk3…" — a link without its scheme, cut short.
    static func short(_ link: String, max: Int = 30) -> String {
        var s = link
        for prefix in ["https://", "http://"] where s.lowercased().hasPrefix(prefix) {
            s = String(s.dropFirst(prefix.count))
        }
        if s.hasPrefix("www.") { s = String(s.dropFirst(4)) }
        if s.count > max { s = String(s.prefix(max - 1)) + "…" }
        return s
    }

    /// The first http(s) link in some shared text.
    static func firstLink(in text: String) -> String? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if let url = URL(string: trimmed), let scheme = url.scheme?.lowercased(),
           scheme == "http" || scheme == "https", url.host != nil {
            return trimmed
        }
        guard let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue) else {
            return nil
        }
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        for match in detector.matches(in: text, options: [], range: range) {
            guard let url = match.url, let scheme = url.scheme?.lowercased() else { continue }
            if scheme == "http" || scheme == "https" { return url.absoluteString }
        }
        return nil
    }

    /// Reads `adhx://pair?server=…&code=…`.
    static func pairing(from url: URL) -> (server: URL, code: String)? {
        guard url.scheme?.lowercased() == "adhx",
              let comps = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
        let isPair = comps.host?.lowercased() == "pair" || comps.path.lowercased().contains("pair")
        guard isPair else { return nil }
        let items = comps.queryItems ?? []
        guard let serverText = items.first(where: { $0.name == "server" })?.value,
              let server = serverURL(from: serverText),
              let code = items.first(where: { $0.name == "code" })?.value,
              !code.isEmpty else { return nil }
        return (server, normalizedCode(code))
    }

    /// `adhx://open`: the app, on Home.
    static let app = URL(string: "adhx://open")!

    /// `adhx://post?platform=…&id=…`: open one of your saves in the app.
    static func post(platform: String, id: String) -> URL? {
        var comps = URLComponents()
        comps.scheme = "adhx"
        comps.host = "post"
        comps.queryItems = [URLQueryItem(name: "platform", value: platform), URLQueryItem(name: "id", value: id)]
        return comps.url
    }

    /// Reads `adhx://post?platform=…&id=…`.
    static func postRef(from url: URL) -> PostRef? {
        guard url.scheme?.lowercased() == "adhx",
              let comps = URLComponents(url: url, resolvingAgainstBaseURL: false),
              comps.host?.lowercased() == "post" else { return nil }
        let items = comps.queryItems ?? []
        guard let platform = items.first(where: { $0.name == "platform" })?.value, !platform.isEmpty,
              let id = items.first(where: { $0.name == "id" })?.value, !id.isEmpty else { return nil }
        return PostRef(platform: platform, id: id)
    }

    /// Upper case, without dashes or spaces.
    static func normalizedCode(_ code: String) -> String {
        code.uppercased().filter { $0.isLetter || $0.isNumber }
    }
}

private struct NoteAnswer: Decodable {
    let note: String?
}
