import SwiftUI

/// Where you left long posts, on this phone only (nothing goes to the server):
/// "Pick up where you left off?" when one comes round again.
enum ResumeStore {
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

    private static var spots: [String: Spot] {
        get {
            guard let data = AppGroup.defaults.data(forKey: key),
                  let decoded = try? JSONDecoder().decode([String: Spot].self, from: data) else { return [:] }
            return decoded
        }
        set {
            var kept = newValue.filter { Date().timeIntervalSince($0.value.at) < keepFor }
            if kept.count > most {
                for old in kept.sorted(by: { $0.value.at < $1.value.at }).prefix(kept.count - most) { kept[old.key] = nil }
            }
            AppGroup.defaults.set(try? JSONEncoder().encode(kept), forKey: key)
        }
    }

    /// Remember where you are, or forget it when it's near the start or the end.
    static func leave(_ post: String, at seconds: Double, of duration: Double, now: Date = Date()) {
        guard duration.isFinite, seconds.isFinite, duration >= shortest else { return }
        if seconds < margin || seconds > duration - margin {
            spots[post] = nil
        } else {
            spots[post] = Spot(seconds: seconds, duration: duration, at: now)
        }
    }

    static func spot(for post: String) -> Spot? {
        guard let spot = spots[post], Date().timeIntervalSince(spot.at) < keepFor else { return nil }
        return spot
    }

    static func forget(_ post: String) {
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

/// "Pick up where you left off?" over a long post you left part-way (board 14.2).
struct ResumeCard: View {
    let spot: ResumeStore.Spot
    let resume: () -> Void
    let startOver: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Pick up where you left off?")
                .font(Theme.serif(30))
                .foregroundStyle(Theme.ink)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            Text("You were \(ResumeStore.clock(spot.seconds)) into this, \(ResumeStore.when(spot.at)).")
                .font(Theme.sans(14))
                .foregroundStyle(Theme.muted)
            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Capsule().fill(.white.opacity(0.18))
                    Capsule().fill(Theme.accent)
                        .frame(width: proxy.size.width * min(1, spot.seconds / max(spot.duration, spot.seconds, 1)))
                }
            }
            .frame(height: 4)
            .accessibilityHidden(true)
            HStack(spacing: 10) {
                Button("Resume from \(ResumeStore.clock(spot.seconds))", action: resume)
                    .buttonStyle(PillButtonStyle(kind: .primary, height: 48))
                Button("Start over", action: startOver)
                    .buttonStyle(PillButtonStyle(kind: .outline, height: 48, fullWidth: false))
            }
        }
        .padding(20)
        .background(RoundedRectangle(cornerRadius: 24, style: .continuous).fill(Theme.surface.opacity(0.92)))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).strokeBorder(.white.opacity(0.1), lineWidth: 1))
        .padding(.horizontal, 24)
    }
}
