import SwiftUI

/// Words for shares and kept copies, shared by the app and the sheet.
enum Format {
    enum Tone {
        case busy, ok, warn

        var color: Color {
            switch self {
            case .busy: return Theme.accent
            case .ok: return Theme.inkSoft
            case .warn: return Theme.warn
            }
        }
    }

    /// "@handle", or the words for networks where words make a better title.
    static func title(platform: String?, author: String?, authorName: String?, text: String?, link: String) -> String {
        let words = firstLine(text)
        let handle = author.flatMap { $0.isEmpty ? nil : ($0.hasPrefix("@") ? $0 : "@" + $0) }
        if Network.titleIsWords(platform), let words { return words }
        if let handle { return handle }
        if let name = authorName, !name.isEmpty { return name }
        if let words { return words }
        return Links.short(link, max: 40)
    }

    static func title(_ r: ShareRecord) -> String {
        title(platform: r.platform, author: r.author, authorName: r.authorName, text: r.text, link: r.link)
    }

    static func firstLine(_ text: String?) -> String? {
        guard let text else { return nil }
        let line = text.split(whereSeparator: \.isNewline).first.map(String.init)?
            .trimmingCharacters(in: .whitespaces)
        return (line?.isEmpty ?? true) ? nil : line
    }

    /// The status line under a share in Shared lately.
    static func statusLine(_ r: ShareRecord) -> (String, Tone) {
        switch r.stage {
        case .saving:
            return ("Saving…", .busy)
        case .queued:
            return ("Waiting for a connection", .busy)
        case .failed:
            switch r.failure {
            case "not_a_post", "no_link": return ("Not one post", .warn)
            case "unavailable": return ("Gone, private or can’t be read", .warn)
            default: return ("Couldn’t save", .warn)
            }
        case .saved:
            return keepLine(status: r.status, percent: r.percent, quality: r.quality, kept: r.kept, withPercent: true)
        }
    }

    /// "Keeping a copy · 60%", "Kept · 720p video", "Couldn’t keep a copy"…
    static func keepLine(status: String?, percent: Int?, quality: String?, kept: KeptCounts?,
                         withPercent: Bool) -> (String, Tone) {
        switch status {
        case "waiting":
            return ("Waiting to keep a copy", .busy)
        case "keeping":
            var parts = ["Keeping a copy"]
            if let quality { parts.append(quality) }
            if withPercent, let percent { parts.append("\(percent)%") }
            return (parts.joined(separator: " · "), .busy)
        case "kept":
            return ("Kept · " + keptWhat(quality: quality, kept: kept), .ok)
        case "retrying":
            return ("Trying again to keep a copy", .busy)
        case "unavailable":
            return ("Couldn’t keep a copy", .warn)
        case "off":
            return ("Saved", .ok)
        case "gone":
            return ("Not in your saves any more", .warn)
        default:
            return ("Saved", .ok)
        }
    }

    /// "720p video", "3 photos", "audio".
    static func keptWhat(quality: String?, kept: KeptCounts?) -> String {
        let videos = kept?.videos ?? 0, photos = kept?.photos ?? 0, audio = kept?.audio ?? 0
        if videos > 0 {
            let q = quality.map { "\($0) " } ?? ""
            return videos > 1 ? "\(videos) \(q)videos" : "\(q)video"
        }
        if photos > 0 { return photos > 1 ? "\(photos) photos" : "photo" }
        if audio > 0 { return "audio" }
        if let quality { return "\(quality) video" }
        return "original quality"
    }

    /// "now", "2m", "1h", "3d", "2w", then a date.
    static func ago(_ date: Date, now: Date = Date()) -> String {
        let s = max(0, now.timeIntervalSince(date))
        if s < 60 { return "now" }
        if s < 3600 { return "\(Int(s / 60))m" }
        if s < 86400 { return "\(Int(s / 3600))h" }
        if s < 86400 * 7 { return "\(Int(s / 86400))d" }
        if s < 86400 * 7 * 8 { return "\(Int(s / (86400 * 7)))w" }
        return date.formatted(.dateTime.day().month(.abbreviated))
    }

    /// "Saved 3 days ago", "Saved today".
    static func savedAgo(_ iso: String?, now: Date = Date()) -> String {
        guard let iso, let date = parseISO(iso) else { return "Saved before" }
        let s = max(0, now.timeIntervalSince(date))
        if s < 60 { return "Saved just now" }
        if s < 3600 { let m = Int(s / 60); return "Saved \(m) minute\(m == 1 ? "" : "s") ago" }
        if s < 86400 { let h = Int(s / 3600); return "Saved \(h) hour\(h == 1 ? "" : "s") ago" }
        let d = Int(s / 86400)
        if d < 60 { return "Saved \(d) day\(d == 1 ? "" : "s") ago" }
        return "Saved on " + date.formatted(.dateTime.day().month(.wide).year())
    }

    static func parseISO(_ s: String) -> Date? {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = withFraction.date(from: s) { return d }
        let plain = ISO8601DateFormatter()
        if let d = plain.date(from: s) { return d }
        // SQLite style "2026-10-18 12:34:56"
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd HH:mm:ss"
        return f.date(from: s)
    }
}
