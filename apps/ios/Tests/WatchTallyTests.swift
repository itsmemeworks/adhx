import Foundation

// Compile the production counter alone, without AVPlayer or a simulator:
// swiftc apps/ios/App/Library/WatchTally.swift apps/ios/Tests/WatchTallyTests.swift -o /tmp/adhx-watch-tally && /tmp/adhx-watch-tally

/// Plays from `from` to `to` in quarter-second samples, like the periodic observer.
func play(_ t: inout WatchTracker, _ from: Double, _ to: Double, _ duration: Double) {
  var s = from
  while s <= to + 1e-9 {
    t.sample(s, duration: duration)
    s += 0.25
  }
}

@main struct WatchTallyTests {
  static func main() {
    // A play once a pass from the top really plays; seconds as it goes.
    var t = WatchTracker()
    t.begin("twitter:1")
    play(&t, 0, 0.75, 30)
    precondition((t.tallies["twitter:1"]?.plays ?? 0) == 0, "not a play until a second has played")
    play(&t, 1, 10, 30)
    precondition(t.tallies["twitter:1"] == .init(plays: 1, finishes: 0, seconds: 10))

    // The end is a finish (once); Repeat's replay from the top is another play.
    t = WatchTracker()
    t.begin("twitter:1")
    play(&t, 0, 8, 8)
    t.ended()
    t.ended()
    play(&t, 0, 3, 8)
    precondition(t.tallies["twitter:1"] == .init(plays: 2, finishes: 1, seconds: 11))

    // A loop that wraps round without an end event (Android's repeat, the web's loop).
    t = WatchTracker()
    t.begin("twitter:1")
    play(&t, 0, 5.75, 6)
    play(&t, 0, 5.75, 6)
    precondition(t.tallies["twitter:1"]?.plays == 2 && t.tallies["twitter:1"]?.finishes == 1)

    // Picking up where you left off, seeks and scrubbing back aren't plays.
    t = WatchTracker()
    t.begin("youtube:long", at: 300)
    t.sample(0, duration: 600)  // the observer's first tick, before the seek lands
    t.sample(300, duration: 600)
    play(&t, 300.25, 310, 600)
    t.sample(500, duration: 600)
    t.sample(20, duration: 600)
    play(&t, 20.25, 25, 600)
    precondition(t.tallies["youtube:long"] == .init(plays: 0, finishes: 0, seconds: 15))

    // Nothing on screen counts nothing; posts stay apart.
    t = WatchTracker()
    t.begin(nil)
    play(&t, 0, 5, 10)
    t.ended()
    precondition(t.tallies.isEmpty)
    t.begin("twitter:a")
    play(&t, 0, 2, 10)
    t.begin("twitter:b")
    play(&t, 0, 2, 10)
    precondition(Set(t.tallies.keys) == ["twitter:a", "twitter:b"])

    // Batches send whole seconds and keep the fractions; a failed one goes back.
    t = WatchTracker()
    t.tallies = ["twitter:a": .init(plays: 1, finishes: 0, seconds: 12.5), "twitter:b": .init(seconds: 0.5)]
    let batch = t.takeBatch()
    precondition(batch == [.init(platform: "twitter", id: "a", plays: 1, finishes: 0, seconds: 12)])
    precondition(t.tallies["twitter:a"] == .init(seconds: 0.5) && t.tallies["twitter:b"] == .init(seconds: 0.5))
    t.putBack(batch)
    precondition(t.tallies["twitter:a"] == .init(plays: 1, finishes: 0, seconds: 12.5))
    t.tallies = Dictionary(uniqueKeysWithValues: (0..<60).map { ("tiktok:\($0)", WatchTracker.Tally(plays: 1)) })
    precondition(t.takeBatch(max: 50).count == 50 && t.tallies.count == 10)

    print("WatchTallyTests: plays, finishes, loops, resume and seeks, batches and fractions passed")
  }
}
