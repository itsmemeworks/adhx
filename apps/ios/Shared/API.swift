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
}

struct StatusResult: Decodable, Equatable {
    let platform: String?
    let id: String?
    let status: String
    let percent: Int?
    let quality: String?
    let kept: KeptCounts?

    private enum CodingKeys: String, CodingKey { case platform, id, status, percent, quality, kept }

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
}

struct PhoneMatch: Decodable, Hashable {
    /// strong · good · related
    let strength: String
    let on: [String]
}

/// One of your saves, ready to play. Addresses are relative to the server.
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

    /// Unique across networks (the same number can be an X and a TikTok id).
    var key: String { "\(platform):\(postId)" }
    var plays: Bool { kind == "video" || kind == "audio" }
    var posterUrl: String? { media.first?.posterUrl }

    private enum CodingKeys: String, CodingKey {
        case platform, postId = "id", kind, author, text, postedAt, savedAt, sourceUrl, openPath,
             media, article, match, learning
    }
}

struct SavesPage: Decodable {
    let items: [PhonePost]
    let total: Int
    let nextOffset: Int?
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
    /// 401: the phone key was removed on the server.
    case badKey(String)
    /// Any other error answer, with words fit to show.
    case server(status: Int, code: String?, message: String)

    var code: String? {
        switch self {
        case .offline: return "offline"
        case .badKey: return "bad_key"
        case .server(_, let code, _): return code
        }
    }

    var message: String {
        switch self {
        case .offline: return "Your ADHX can’t be reached right now."
        case .badKey(let message): return message
        case .server(_, _, let message): return message
        }
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

    private static let session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = timeout
        config.timeoutIntervalForResource = timeout + 5
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

    func save(url: String) async throws -> SaveResult {
        try await send("POST", "/api/app/save", body: ["url": url])
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

    func search(_ q: String, offset: Int = 0) async throws -> SearchPage {
        try await send("GET", "/api/app/search", query: [
            URLQueryItem(name: "q", value: q),
            URLQueryItem(name: "offset", value: String(offset)),
        ])
    }

    /// Resolves a relative address from the server (posterUrl, openPath).
    static func resolve(_ address: String?, against server: URL) -> URL? {
        guard let address, !address.isEmpty else { return nil }
        if let absolute = URL(string: address), absolute.scheme != nil { return absolute }
        return URL(string: address, relativeTo: server)?.absoluteURL
    }

    private func send<T: Decodable>(_ method: String, _ path: String,
                                    query: [URLQueryItem] = [],
                                    body: [String: String]? = nil) async throws -> T {
        guard var comps = URLComponents(url: server, resolvingAgainstBaseURL: false) else {
            throw APIError.server(status: 0, code: "bad_address", message: "That address doesn’t look right.")
        }
        let base = comps.path.hasSuffix("/") ? String(comps.path.dropLast()) : comps.path
        comps.path = base + path
        comps.queryItems = query.isEmpty ? nil : query
        guard let url = comps.url else {
            throw APIError.server(status: 0, code: "bad_address", message: "That address doesn’t look right.")
        }

        var request = URLRequest(url: url, timeoutInterval: Self.timeout)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let key { request.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization") }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
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
                return try JSONDecoder().decode(T.self, from: data)
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

    /// Upper case, without dashes or spaces.
    static func normalizedCode(_ code: String) -> String {
        code.uppercased().filter { $0.isLetter || $0.isNumber }
    }
}
