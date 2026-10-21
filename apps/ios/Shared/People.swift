import SwiftUI

/// Words for who saved a post, as members see them (matches the web's
/// `src/components/next/savers.ts`). Your own save reads "You" and leads.
enum SaverWords {
    /// You first, then newest first.
    static func ordered(_ savers: [Saver]) -> [Saver] {
        savers.filter(\.isYou) + savers.filter { !$0.isYou }
    }

    /// "Ana saved this", "Ana and Ben saved this", "You and 2 others".
    static func line(_ savers: [Saver]) -> String {
        let list = ordered(savers)
        switch list.count {
        case 0: return ""
        case 1: return "\(list[0].displayName) saved this"
        case 2: return "\(list[0].displayName) and \(list[1].displayName) saved this"
        default: return "\(list[0].displayName) and \(list.count - 1) others"
        }
    }

    /// Just the names, for small places: "You and Jo", "Ana and 3 others".
    static func who(_ savers: [Saver]) -> String {
        let list = ordered(savers)
        switch list.count {
        case 0: return ""
        case 1: return list[0].displayName
        case 2: return "\(list[0].displayName) and \(list[1].displayName)"
        default: return "\(list[0].displayName) and \(list.count - 1) others"
        }
    }

    /// "Ana", "Ana and Ben", "Ana, Ben and Mum", "Ana, Ben, Mum and 2 others".
    static func names(_ names: [String], upTo limit: Int = 3) -> String {
        guard !names.isEmpty else { return "" }
        if names.count == 1 { return names[0] }
        if names.count <= limit {
            return names.dropLast().joined(separator: ", ") + " and " + names[names.count - 1]
        }
        let rest = names.count - limit
        return names.prefix(limit).joined(separator: ", ") + " and \(rest) other" + (rest == 1 ? "" : "s")
    }

    /// The saver whose note the byline shows: a friend's first (newest
    /// first), else yours.
    static func noted(_ savers: [Saver]) -> Saver? {
        savers.first { !$0.isYou && $0.note != nil } ?? savers.first { $0.note != nil }
    }

    /// The newest saver's time: "2h", "20m".
    static func when(_ savers: [Saver]) -> String? {
        let newest = savers.compactMap { Format.date($0.savedAt) }.max()
        return newest.map(Format.shortAgo)
    }
}

/// The people on your ADHX this phone has heard of, newest first, so the share
/// sheet can say who will see a save. Kept in the App Group (the Share
/// Extension reads it), only on this phone.
enum KnownPeople {
    private static let key = "knownPeople"
    private static let limit = 12

    static func all() -> [Saver] {
        guard let data = AppGroup.defaults.data(forKey: key),
              let people = try? JSONDecoder().decode([Saver].self, from: data) else { return [] }
        return people
    }

    /// Your people as the channels list has them: the whole group, in order.
    static func replace(with people: [Saver]) {
        write(Array(people.filter { !$0.isYou }.prefix(limit)))
    }

    /// People seen on posts: added in front, without repeats.
    static func remember(_ savers: [Saver]) {
        let fresh = savers.filter { !$0.isYou }
        guard !fresh.isEmpty else { return }
        var seen = Set<String>()
        let merged = (fresh + all()).filter { seen.insert($0.username).inserted }
        write(Array(merged.prefix(limit)))
    }

    static func clear() {
        AppGroup.defaults.removeObject(forKey: key)
    }

    private static func write(_ people: [Saver]) {
        let plain = people.map { Saver(username: $0.username, name: $0.name, avatarUrl: $0.avatarUrl) }
        if let data = try? JSONEncoder().encode(plain) {
            AppGroup.defaults.set(data, forKey: key)
        }
    }
}

// MARK: - Faces

/// Gob's shape (brand/BRAND.md), the shape of every person's face: a
/// continuous rounded square with corners at 38% of its size, tilted −4°.
/// The tilt is in the path, so whatever it clips stays upright (initials
/// read straight) and a `strokeBorder` ring follows the corners. Status
/// dots, live dots, round buttons and badges stay circles.
struct GobShape: InsettableShape {
    static let cornerFraction: CGFloat = 0.38
    static let tilt: Angle = .degrees(-4)
    /// Tilted, the square reaches ~1.6% past its frame; this keeps it inside.
    private static let fit: CGFloat = 0.984

    var inset: CGFloat = 0

    func path(in rect: CGRect) -> Path {
        let side = max(0, min(rect.width, rect.height) * Self.fit - inset * 2)
        let square = CGRect(x: rect.midX - side / 2, y: rect.midY - side / 2, width: side, height: side)
        let shape = RoundedRectangle(cornerRadius: side * Self.cornerFraction, style: .continuous)
            .path(in: square)
        let turn = CGAffineTransform(translationX: rect.midX, y: rect.midY)
            .rotated(by: Self.tilt.radians)
            .translatedBy(x: -rect.midX, y: -rect.midY)
        return shape.applying(turn)
    }

    func inset(by amount: CGFloat) -> GobShape {
        var shape = self
        shape.inset += amount
        return shape
    }
}

/// Your own picture, wherever "you" is drawn (`/api/app/me`). Refreshed when
/// the app comes back and after you change it, so every face of yours changes
/// at once: your reactions in Live and on posts, savers rows, your people and
/// Settings.
@MainActor
final class YourFace: ObservableObject {
    static let shared = YourFace()

    @Published private(set) var username: String?
    @Published private(set) var avatarUrl: String?
    /// upload · gob · x · generated, once a newer server has said.
    @Published private(set) var source: String?

    private init() {
        username = Store.username
        avatarUrl = Store.avatarUrl
        source = Store.avatarSource
    }

    /// Re-reads what's stored (the Share Extension or a new connection).
    func reload() {
        username = Store.username
        avatarUrl = Store.avatarUrl
        source = Store.avatarSource
    }

    /// `/api/app/me` answered.
    func update(_ me: MeResult) {
        if let name = me.username { Store.username = name }
        Store.avatarUrl = me.avatarUrl?.isEmpty == false ? me.avatarUrl : nil
        if let source = me.avatarSource { Store.avatarSource = source }
        reload()
    }

    /// Your picture changed on this phone.
    func update(avatarUrl: String?, source: String) {
        Store.avatarUrl = avatarUrl?.isEmpty == false ? avatarUrl : nil
        Store.avatarSource = source
        reload()
    }

    /// Whether this saver is you (marked so, or by your username).
    func isYou(_ saver: Saver) -> Bool {
        if saver.isYou { return true }
        guard let username, !username.isEmpty else { return false }
        return YourPicture.sameName(saver.username, username)
    }

    /// The picture to draw for a saver: yours as this phone knows it when
    /// it's you (a letter only when you really have none), theirs otherwise.
    func picture(for saver: Saver) -> String? {
        guard isYou(saver) else { return saver.avatarUrl }
        return YourPicture.choose(stored: avatarUrl, source: source, sent: saver.avatarUrl)
    }

    /// You, as a saver with your picture (for your own reactions).
    func you(from known: Saver? = nil) -> Saver {
        let name = known?.username ?? username ?? "you"
        let picture = picture(for: Saver(username: name, avatarUrl: known?.avatarUrl, isYou: true))
        return Saver(username: name, name: known?.name, avatarUrl: picture, savedAt: known?.savedAt,
                     isYou: true, note: known?.note)
    }
}

/// One person's face, Gob shaped: their photo (`AuthImage`), or their
/// initial on a colour of their own. Decorative: whoever shows it says the names.
/// Your own face is always your current picture (`YourFace`).
struct Face: View {
    let saver: Saver
    var server: URL?
    var size: CGFloat = 30
    /// The ring that separates overlapping faces (the colour behind them).
    var ring: Color = .black
    @ObservedObject private var yours = YourFace.shared

    /// The boards' five face colours, in the web's `FACE_COLOURS` order
    /// (`src/components/next/faces.ts`), so a person has one colour everywhere.
    static let colourHexes: [UInt32] = [0x7FD1AE, 0xFF8FA3, 0x6B8CFF, 0xC4A7FF, 0xFFB35C]
    private static let colours: [Color] = colourHexes.map { Color(hex: $0) }

    /// The same colour for the same person on every device: FNV-1a over the
    /// lowercased username without "@", modulo the five colours (the web's
    /// `faceColour`). Ana, Ben, Mum, Jo and Pete get their board colours.
    static func colourIndex(for username: String) -> Int {
        var name = username.lowercased()
        if name.hasPrefix("@") { name.removeFirst() }
        var hash: UInt32 = 0x811C_9DC5
        for unit in name.utf16 {
            hash ^= UInt32(unit)
            hash = hash &* 0x0100_0193
        }
        return Int(hash % UInt32(colourHexes.count))
    }

    static func colour(for username: String) -> Color {
        colours[colourIndex(for: username)]
    }

    var body: some View {
        ZStack {
            initial
            if let server, let url = ADHXClient.resolve(yours.picture(for: saver), against: server) {
                // Faces are for members only: loaded with the phone key.
                AuthImage(url: url) { Color.clear }
            }
        }
        .frame(width: size, height: size)
        .clipShape(GobShape())
        .overlay(GobShape().strokeBorder(ring, lineWidth: max(1.5, size / 15)))
        .accessibilityHidden(true)
    }

    private var initial: some View {
        Rectangle()
            .fill(Self.colour(for: saver.username))
            .overlay(
                // Your own face shows your initial, not the "Y" of "You".
                Text(String((saver.isYou ? (saver.name?.isEmpty == false ? saver.name! : saver.username)
                                         : saver.displayName).prefix(1)).uppercased())
                    .font(Theme.sans(size * 0.42, .heavy))
                    .foregroundStyle(.black)
            )
    }
}

/// Up to three overlapping faces, you first.
struct FaceStack: View {
    let savers: [Saver]
    var server: URL?
    var size: CGFloat = 30
    var ring: Color = .black
    var limit = 3

    var body: some View {
        let faces = Array(SaverWords.ordered(savers).prefix(limit))
        HStack(spacing: -size * 0.32) {
            ForEach(Array(faces.enumerated()), id: \.element.username) { index, saver in
                Face(saver: saver, server: server, size: size, ring: ring)
                    .zIndex(Double(faces.count - index))
            }
        }
        .accessibilityHidden(true)
    }
}

/// The small lock on a post kept just for you.
struct PrivateLock: View {
    var size: CGFloat = 24

    var body: some View {
        Image(systemName: "lock.fill")
            .font(.system(size: size * 0.46, weight: .bold))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(Circle().fill(.black.opacity(0.5)))
            .accessibilityElement()
            .accessibilityLabel("Just for me")
    }
}

// MARK: - Times

extension Format {
    private static let isoFull: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let isoPlain: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    static func date(_ iso: String?) -> Date? {
        guard let iso, !iso.isEmpty else { return nil }
        return isoFull.date(from: iso) ?? isoPlain.date(from: iso)
    }

    /// "now", "20m", "2h", "3d", "5w".
    static func shortAgo(_ date: Date) -> String {
        let seconds = max(0, Date().timeIntervalSince(date))
        switch seconds {
        case ..<60: return "now"
        case ..<3600: return "\(Int(seconds / 60))m"
        case ..<86_400: return "\(Int(seconds / 3600))h"
        case ..<(86_400 * 14): return "\(Int(seconds / 86_400))d"
        default: return "\(Int(seconds / (86_400 * 7)))w"
        }
    }
}
