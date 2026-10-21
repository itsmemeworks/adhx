import Foundation

// The phone without the web (docs/specs/phone-app.md): your picture, invites,
// signing in with an emailed code and the reactions feed. Decoded loosely,
// like the friends feed: a server mid-upgrade may leave fields out.

private extension KeyedDecodingContainer {
    func soft<T: Decodable>(_ type: T.Type, _ key: Key) -> T? {
        (try? decodeIfPresent(type, forKey: key)) ?? nil
    }

    func softInt(_ key: Key) -> Int? {
        if let n = soft(Int.self, key) { return n }
        if let d = soft(Double.self, key) { return Int(d.rounded()) }
        if let s = soft(String.self, key) { return Int(s) }
        return nil
    }

    /// An ISO date, or milliseconds since 1970 (the invite table's numbers).
    func softDate(_ key: Key) -> Date? {
        if let ms = soft(Double.self, key) { return Date(timeIntervalSince1970: ms / 1000) }
        if let text = soft(String.self, key) {
            if let ms = Double(text) { return Date(timeIntervalSince1970: ms / 1000) }
            return AccountDates.parse(text)
        }
        return nil
    }
}

enum AccountDates {
    private static let full: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let plain: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    static func parse(_ text: String) -> Date? {
        full.date(from: text) ?? plain.date(from: text)
    }
}

// MARK: - Your picture (`/api/app/me/avatar`)

/// Where your picture came from: a photo, a Gob face, X, or none (your initial).
enum AvatarSource: String {
    case upload, gob, x, generated
}

/// Which picture to draw for you (`YourFace`): what this phone stored from
/// `/api/app/me` wins (newer than whatever a cached post says); after Remove
/// (`generated`) it's your letter; until a newer server has said, the
/// server's word on the post.
enum YourPicture {
    static func choose(stored: String?, source: String?, sent: String?) -> String? {
        if let stored, !stored.isEmpty { return stored }
        if source == AvatarSource.generated.rawValue { return nil }
        return sent?.isEmpty == false ? sent : nil
    }

    /// The same username, ignoring case and a leading "@".
    static func sameName(_ a: String, _ b: String) -> Bool {
        func plain(_ s: String) -> String { (s.hasPrefix("@") ? String(s.dropFirst()) : s).lowercased() }
        return plain(a) == plain(b)
    }
}

/// `{ avatarUrl, source }` after a change.
struct AvatarAnswer: Decodable, Equatable {
    let avatarUrl: String?
    let source: String

    private enum Keys: String, CodingKey { case avatarUrl, source }

    init(avatarUrl: String?, source: String) {
        self.avatarUrl = avatarUrl
        self.source = source
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        let url = c.soft(String.self, .avatarUrl)
        avatarUrl = url?.isEmpty == false ? url : nil
        source = c.soft(String.self, .source) ?? (avatarUrl == nil ? "generated" : "upload")
    }
}

/// The four Gob faces (the web's `GOB_COLOURS`).
enum GobColour: String, CaseIterable, Identifiable {
    case blue, teal, coral, lime

    var id: String { rawValue }
    var label: String { rawValue.prefix(1).uppercased() + rawValue.dropFirst() }
    var hex: UInt32 {
        switch self {
        case .blue: return 0x6B8CFF
        case .teal: return 0x5FD0C8
        case .coral: return 0xFF7A59
        case .lime: return 0xB6E35A
        }
    }
}

/// A `multipart/form-data` body: plain fields and one file.
struct MultipartForm {
    let boundary: String
    private(set) var data = Data()

    init(boundary: String = "adhx-" + UUID().uuidString) {
        self.boundary = boundary
    }

    var contentType: String { "multipart/form-data; boundary=\(boundary)" }

    mutating func field(_ name: String, _ value: String) {
        data.append(Data("--\(boundary)\r\n".utf8))
        data.append(Data("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n".utf8))
        data.append(Data(value.utf8))
        data.append(Data("\r\n".utf8))
    }

    mutating func file(_ name: String, filename: String, type: String, bytes: Data) {
        data.append(Data("--\(boundary)\r\n".utf8))
        data.append(Data("Content-Disposition: form-data; name=\"\(name)\"; filename=\"\(filename)\"\r\n".utf8))
        data.append(Data("Content-Type: \(type)\r\n\r\n".utf8))
        data.append(bytes)
        data.append(Data("\r\n".utf8))
    }

    /// The body, closed.
    func finished() -> Data {
        var out = data
        out.append(Data("--\(boundary)--\r\n".utf8))
        return out
    }
}

// MARK: - Invites (`/api/app/invites`)

/// One of your invite links that still works.
struct Invite: Decodable, Hashable, Identifiable {
    let id: String
    /// The link to send. Older answers may leave it out (only made links show it).
    let url: String?
    let createdAt: Date?
    let expiresAt: Date?
    let uses: Int

    private enum Keys: String, CodingKey { case id, url, createdAt, expiresAt, uses }

    init(id: String, url: String?, createdAt: Date? = nil, expiresAt: Date? = nil, uses: Int = 0) {
        self.id = id
        self.url = url
        self.createdAt = createdAt
        self.expiresAt = expiresAt
        self.uses = uses
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        if let text = c.soft(String.self, .id), !text.isEmpty {
            id = text
        } else if let n = c.softInt(.id) {
            id = String(n)
        } else {
            throw DecodingError.dataCorruptedError(forKey: .id, in: c, debugDescription: "No id")
        }
        let link = c.soft(String.self, .url)
        url = link?.isEmpty == false ? link : nil
        createdAt = c.softDate(.createdAt)
        expiresAt = c.softDate(.expiresAt)
        uses = c.softInt(.uses) ?? 0
    }

    /// "Works for 6 more days", "Works until tomorrow", "Stopped working".
    func lifeLine(now: Date = Date()) -> String {
        guard let expiresAt else { return "Works until you revoke it" }
        let seconds = expiresAt.timeIntervalSince(now)
        if seconds <= 0 { return "Stopped working" }
        let hours = Int(seconds / 3600)
        if hours < 1 { return "Works for under an hour" }
        if hours < 24 { return hours == 1 ? "Works for 1 more hour" : "Works for \(hours) more hours" }
        let days = Int((seconds / 86_400).rounded())
        return days == 1 ? "Works for 1 more day" : "Works for \(days) more days"
    }
}

struct InvitesAnswer: Decodable {
    let invites: [Invite]

    private enum Keys: String, CodingKey { case invites }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        invites = (try? c.decodeIfPresent(Lossy<Invite>.self, forKey: .invites))?.items ?? []
    }
}

// MARK: - Sign in with an emailed code (`/api/app/signin`)

/// What went wrong with a code, in plain words.
enum SignInWords {
    static func message(for error: APIError) -> String {
        switch error.code {
        case "bad_code": return "That code didn’t work. Check it and try again."
        case "expired": return "That code has run out. Send a new one."
        case "busy": return "That’s a lot of tries. Wait a minute and try again."
        case "too_soon": return "A code is already on its way. Give it a minute."
        case "too_many": return "This account has ten phones already. Remove one on another phone first."
        case "no_email": return "This ADHX can’t send email. Scan or type the code from Settings → Phone app instead."
        case "send_failed": return "The email didn’t go. Try again in a moment, or use the code from Settings → Phone app."
        case "offline": return error.message
        default: return error.message
        }
    }

    /// Six digits from whatever was typed or pasted ("123 456", "123-456").
    static func code(_ typed: String) -> String {
        String(typed.filter(\.isASCIIDigit).prefix(6))
    }

    /// Looks like an address someone could get mail at.
    static func looksLikeEmail(_ text: String) -> Bool {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let at = t.firstIndex(of: "@"), at != t.startIndex else { return false }
        let domain = t[t.index(after: at)...]
        return domain.contains(".") && !domain.hasSuffix(".") && !t.contains(" ")
    }
}

private extension Character {
    var isASCIIDigit: Bool { ("0"..."9").contains(self) }
}

// MARK: - The reactions feed (`GET /api/app/reacted`)

/// The newest reaction on a post, and how many it has.
struct ReactionSummary: Hashable {
    let count: Int
    let last: LiveReactionEvent?
}

/// A post with reactions you can see.
struct ReactedPost: Decodable, Hashable, Identifiable {
    let post: PhonePost
    let reactions: ReactionSummary

    var id: String { post.key }

    private enum Keys: String, CodingKey { case reactions }
    private enum SummaryKeys: String, CodingKey { case count, last }

    init(post: PhonePost, reactions: ReactionSummary) {
        self.post = post
        self.reactions = reactions
    }

    init(from decoder: Decoder) throws {
        post = try PhonePost(from: decoder)
        let c = try decoder.container(keyedBy: Keys.self)
        if let summary = try? c.nestedContainer(keyedBy: SummaryKeys.self, forKey: .reactions) {
            let last = summary.soft(LiveReactionEvent.self, .last)
            reactions = ReactionSummary(count: max(summary.softInt(.count) ?? 0, last == nil ? 0 : 1), last: last)
        } else {
            reactions = ReactionSummary(count: 0, last: nil)
        }
    }
}

struct ReactedPage: Decodable {
    let items: [ReactedPost]
    let nextOffset: Int?

    private enum Keys: String, CodingKey { case items, nextOffset }

    init(items: [ReactedPost], nextOffset: Int?) {
        self.items = items
        self.nextOffset = nextOffset
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        items = (try? c.decodeIfPresent(Lossy<ReactedPost>.self, forKey: .items))?.items ?? []
        nextOffset = c.softInt(.nextOffset)
    }

    /// "12 posts with reactions", "50+ posts with reactions".
    static func countLine(_ count: Int, more: Bool) -> String {
        if count == 0 { return "No reactions yet" }
        if more { return "\(count)+ posts with reactions" }
        return count == 1 ? "1 post with reactions" : "\(count) posts with reactions"
    }
}

private struct Done: Decodable {}

// MARK: - Client

extension ADHXClient {
    /// A square photo (already cropped on the phone) as your picture.
    func setAvatar(jpeg: Data, x: Double = 0.5, y: Double = 0.5, zoom: Double = 1) async throws -> AvatarAnswer {
        var form = MultipartForm()
        form.file("file", filename: "picture.jpg", type: "image/jpeg", bytes: jpeg)
        form.field("x", String(format: "%.4f", x))
        form.field("y", String(format: "%.4f", y))
        form.field("zoom", String(format: "%.4f", zoom))
        return try await send("POST", "/api/app/me/avatar", data: form.finished(), contentType: form.contentType,
                              timeout: 60)
    }

    /// A Gob face in one of the four colours.
    func setGobAvatar(_ colour: GobColour) async throws -> AvatarAnswer {
        try await send("POST", "/api/app/me/avatar", body: ["source": "gob", "colour": colour.rawValue])
    }

    /// Your X photo (409 `no_x_picture` without one).
    func useXAvatar() async throws -> AvatarAnswer {
        try await send("POST", "/api/app/me/avatar", body: ["source": "x"])
    }

    /// Back to your initial.
    func removeAvatar() async throws -> AvatarAnswer {
        try await send("DELETE", "/api/app/me/avatar")
    }

    func invites() async throws -> [Invite] {
        let answer: InvitesAnswer = try await send("GET", "/api/app/invites")
        return answer.invites
    }

    /// A new invite link, shown once.
    func makeInvite() async throws -> Invite {
        try await send("POST", "/api/app/invites", body: [:])
    }

    func revokeInvite(_ id: String) async throws {
        let _: Done = try await send("DELETE", "/api/app/invites/\(Self.pathPart(id))")
    }

    /// Emails a 6-digit code to an existing account (always `{ ok: true }`).
    func requestSignInCode(email: String) async throws {
        let _: Done = try await send("POST", "/api/app/signin",
                                     body: ["email": email.trimmingCharacters(in: .whitespacesAndNewlines)])
    }

    /// The code from the email: answers like pairing (`{ key, username, name }`).
    func verifySignIn(email: String, code: String, name: String) async throws -> PairResult {
        try await send("POST", "/api/app/signin/verify", body: [
            "email": email.trimmingCharacters(in: .whitespacesAndNewlines),
            "code": SignInWords.code(code),
            "name": String(name.prefix(40)),
        ])
    }

    /// Posts with reactions you can see, newest reaction first.
    func reacted(offset: Int = 0, limit: Int = 30) async throws -> ReactedPage {
        try await send("GET", "/api/app/reacted", query: [
            URLQueryItem(name: "offset", value: String(offset)),
            URLQueryItem(name: "limit", value: String(min(50, max(1, limit)))),
        ])
    }
}
