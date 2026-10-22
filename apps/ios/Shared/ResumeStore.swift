import Foundation
import CryptoKit

/// Where you left long posts, on this phone only (nothing goes to the server):
/// "Pick up where you left off?" when one comes round again.
struct ResumeStore {
    struct Spot: Codable, Equatable {
        /// Seconds in.
        let seconds: Double
        /// How long the post is.
        let duration: Double
        /// When you left it.
        let at: Date
    }

    /// Only posts at least this long are worth picking up.
    static let shortest: Double = 60
    /// Less than this in, or this close to the end, starts from the top.
    static let margin: Double = 15
    /// Older spots are forgotten.
    static let keepFor: TimeInterval = 30 * 86_400
    private static let key = "resumeSpots"
    private static let most = 300

    private struct Saved: Codable {
        let scope: String
        let spots: [String: Spot]
    }
    // Capture the credential that owns this player. Late callbacks from an old
    // player cannot write history into the next account's storage.
    private let scope = ResumeStore.connectionScope()
    private static func connectionScope() -> String? {
        guard let server = Store.server, let key = Store.key else { return nil }
        return SHA256.hash(data: Data((server.absoluteString + "|" + key).utf8))
            .map { String(format: "%02x", $0) }.joined()
    }
    static func clear() { AppGroup.defaults.removeObject(forKey: key) }

    private var spots: [String: Spot] {
        get {
            guard let scope, scope == Self.connectionScope(),
                  let data = AppGroup.defaults.data(forKey: Self.key),
                  let saved = try? JSONDecoder().decode(Saved.self, from: data),
                  saved.scope == scope else { return [:] }
            return saved.spots
        }
        nonmutating set {
            guard let scope, scope == Self.connectionScope() else { return }
            var kept = newValue.filter { Date().timeIntervalSince($0.value.at) < Self.keepFor }
            if kept.count > Self.most {
                for old in kept.sorted(by: { $0.value.at < $1.value.at }).prefix(kept.count - Self.most) { kept[old.key] = nil }
            }
            AppGroup.defaults.set(try? JSONEncoder().encode(Saved(scope: scope, spots: kept)), forKey: Self.key)
        }
    }

    /// Remember where you are, or forget it when it's near the start or the end.
    func leave(_ post: String, at seconds: Double, of duration: Double, now: Date = Date()) {
        guard duration.isFinite, seconds.isFinite, duration >= Self.shortest else { return }
        if seconds < Self.margin || seconds > duration - Self.margin {
            spots[post] = nil
        } else {
            spots[post] = Spot(seconds: seconds, duration: duration, at: now)
        }
    }

    func spot(for post: String) -> Spot? {
        guard let spot = spots[post], Date().timeIntervalSince(spot.at) < Self.keepFor else { return nil }
        return spot
    }

    func forget(_ post: String) {
        spots[post] = nil
    }

    /// "12:40", "1:02:05".
    static func clock(_ seconds: Double) -> String {
        let s = Int(seconds.rounded(.down))
        let h = s / 3600, m = (s % 3600) / 60, r = s % 60
        return h > 0 ? String(format: "%d:%02d:%02d", h, m, r) : String(format: "%d:%02d", m, r)
    }

    /// "a moment ago", "earlier today", "yesterday", "3 days ago".
    static func when(_ date: Date, now: Date = Date()) -> String {
        let calendar = Calendar.current
        if now.timeIntervalSince(date) < 15 * 60 { return "a moment ago" }
        if calendar.isDate(date, inSameDayAs: now) { return "earlier today" }
        if let yesterday = calendar.date(byAdding: .day, value: -1, to: now), calendar.isDate(date, inSameDayAs: yesterday) {
            return "yesterday"
        }
        let days = max(2, calendar.dateComponents([.day], from: calendar.startOfDay(for: date), to: calendar.startOfDay(for: now)).day ?? 2)
        return "\(days) days ago"
    }
}
