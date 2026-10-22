import Foundation

/// Counting how a video is watched (pure: no clock, no storage, no network).
/// Same rules as the web (`src/lib/watch/tally.ts`) and Android (`WatchTally.kt`):
///
/// - A **play** is a pass that starts at the top (or a loop round) and then
///   really plays for a second (half the video when it's shorter). Picking up
///   part-way, or scrubbing back, isn't a new play.
/// - A **finish** is reaching the end, once per pass.
/// - **Seconds** are the position's forward steps while it plays, each at
///   most `maxStep` (a seek or a jump isn't watching).
struct WatchTracker {
    struct Tally: Codable, Equatable {
        var plays = 0
        var finishes = 0
        /// Keeps its fractions until they add up to whole seconds.
        var seconds: Double = 0
    }

    /// A post's tally on its way to `POST /api/app/watched` (whole seconds).
    struct Sent: Equatable {
        let platform: String
        let id: String
        let plays: Int
        let finishes: Int
        let seconds: Int
        var key: String { "\(platform):\(id)" }
    }

    static let playAfter: Double = 1
    /// Within this of the top counts as starting there.
    static let start: Double = 1.5
    /// Within this of the end, a jump back to the top is a loop.
    static let end: Double = 1.5
    static let maxStep: Double = 2

    private struct Pass {
        var fromTop = false
        var counted = false
        var watched: Double = 0
        var finished = false
    }

    private(set) var key: String?
    private var last: Double?
    private var pass = Pass()
    /// Not sent yet, by post (`platform:id`).
    var tallies: [String: Tally] = [:]

    /// A post is on screen (nil: nothing playing). Its first sample says where
    /// it starts, unless `at` says so first (picking up part-way).
    mutating func begin(_ key: String?, at: Double? = nil) {
        self.key = key
        last = at
        pass = Pass(fromTop: at.map { $0 < Self.start } ?? false)
    }

    /// Where the video is now, and how long it is (0 when unknown), in seconds.
    mutating func sample(_ position: Double, duration: Double) {
        guard let key, position.isFinite, position >= 0 else { return }
        let before = last
        last = position
        guard let before else {
            pass.fromTop = position < Self.start
            return
        }
        let step = position - before
        if step > 0, step <= Self.maxStep {
            tallies[key, default: Tally()].seconds += step
            pass.watched += step
            let needed = duration > 0 ? min(Self.playAfter, duration / 2) : Self.playAfter
            if pass.fromTop, !pass.counted, pass.watched >= needed {
                pass.counted = true
                tallies[key, default: Tally()].plays += 1
            }
            return
        }
        let wrapped = step < 0 && position < Self.start
            && (pass.finished || (duration > 0 && before >= duration - Self.end))
        if wrapped {
            if !pass.finished { tallies[key, default: Tally()].finishes += 1 }
            pass = Pass(fromTop: true)
        }
    }

    /// It played to the end. A replay from the top starts the next pass.
    mutating func ended() {
        guard let key, !pass.finished else { return }
        pass.finished = true
        tallies[key, default: Tally()].finishes += 1
    }

    /// What's ready to send (at most `max` posts), in whole seconds; the
    /// fractions stay behind.
    mutating func takeBatch(max: Int = 50) -> [Sent] {
        var out: [Sent] = []
        for key in tallies.keys.sorted() {
            if out.count >= max { break }
            guard var tally = tallies[key] else { continue }
            let whole = Int(tally.seconds.rounded(.down))
            guard tally.plays > 0 || tally.finishes > 0 || whole > 0 else { continue }
            guard let colon = key.firstIndex(of: ":"), colon != key.startIndex else {
                tallies[key] = nil
                continue
            }
            out.append(Sent(platform: String(key[..<colon]), id: String(key[key.index(after: colon)...]),
                            plays: tally.plays, finishes: tally.finishes, seconds: whole))
            tally.plays = 0
            tally.finishes = 0
            tally.seconds -= Double(whole)
            tallies[key] = tally.seconds > 0 ? tally : nil
        }
        return out
    }

    /// A batch didn't get through: add it back.
    mutating func putBack(_ batch: [Sent]) {
        for sent in batch {
            var tally = tallies[sent.key, default: Tally()]
            tally.plays += sent.plays
            tally.finishes += sent.finishes
            tally.seconds += Double(sent.seconds)
            tallies[sent.key] = tally
        }
    }
}
