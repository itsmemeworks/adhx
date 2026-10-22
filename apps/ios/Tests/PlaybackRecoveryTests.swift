import Foundation

// Compile production helpers, without AVPlayer or a simulator:
// swiftc apps/ios/Shared/ResumeStore.swift apps/ios/App/Library/PlaybackRecovery.swift apps/ios/Tests/PlaybackRecoveryTests.swift -o /tmp/adhx-playback-recovery && /tmp/adhx-playback-recovery
enum Store {
  static var server: URL? = URL(string: "https://a.example")
  static var key: String? = "fixture-secret-a"
}
enum AppGroup {
  static let suite = "adhx-playback-test-" + UUID().uuidString
  static let defaults = UserDefaults(suiteName: suite)!
}

@main struct PlaybackRecoveryTests {
  @MainActor static func main() async {
    defer { AppGroup.defaults.removePersistentDomain(forName: AppGroup.suite) }
    let a = ResumeStore()
    a.leave("twitter:one", at: 120, of: 600)
    precondition(a.spot(for: "twitter:one")?.seconds == 120)
    let encoded = String(data: AppGroup.defaults.data(forKey: "resumeSpots")!, encoding: .utf8)!
    precondition(!encoded.contains("fixture-secret-a"))
    // Even a missed explicit clear must not adopt another server/account's history.
    Store.server = URL(string: "https://b.example")
    let b = ResumeStore()
    precondition(b.spot(for: "twitter:one") == nil)
    b.leave("twitter:one", at: 180, of: 600)
    a.leave("twitter:one", at: 300, of: 600)  // old player's delayed callback
    a.forget("twitter:one")
    precondition(b.spot(for: "twitter:one")?.seconds == 180)
    Store.key = "fixture-secret-b"
    let c = ResumeStore()
    precondition(c.spot(for: "twitter:one") == nil)
    c.leave("twitter:one", at: 240, of: 600)
    ResumeStore.clear()
    precondition(c.spot(for: "twitter:one") == nil)
    // Ignore legacy unscoped data; never attribute it to the next account.
    let legacy = ["twitter:one": ResumeStore.Spot(seconds: 200, duration: 600, at: Date())]
    AppGroup.defaults.set(try! JSONEncoder().encode(legacy), forKey: "resumeSpots")
    precondition(c.spot(for: "twitter:one") == nil)
    c.leave("old", at: 120, of: 600, now: Date().addingTimeInterval(-ResumeStore.keepFor - 1))
    precondition(c.spot(for: "old") == nil)
    for i in 0..<310 { c.leave("post:\(i)", at: 120, of: 600) }
    precondition((0..<310).filter { c.spot(for: "post:\($0)") != nil }.count == 300)

    var timeouts = 0
    let attempt = UUID()
    let initial = PlaybackWait(post: "p", attempt: attempt, preparing: false)
    await initial.run(nanoseconds: 1_000_000) { timeouts += 1 }
    let retry = PlaybackWait(post: "p", attempt: UUID(), preparing: false)
    precondition(initial != retry)
    await retry.run(nanoseconds: 1_000_000) { timeouts += 1 }
    let preparing = PlaybackWait(post: "p", attempt: attempt, preparing: true)
    await preparing.run(nanoseconds: 1_000_000) { timeouts += 1 }
    precondition(timeouts == 2)
    precondition(initial != preparing)
    await initial.run(nanoseconds: 1_000_000) { timeouts += 1 }  // preparation finished
    let stale = Task { await initial.run(nanoseconds: 100_000_000) { timeouts += 1 } }
    stale.cancel()
    await stale.value
    precondition(timeouts == 3, "cancelled deadlines never affect a newer attempt")

    var hold = PlaybackHold()
    hold.open(post: "p", playing: false)
    precondition(!hold.close(post: "p"), "dismissing Reply preserves manual pause")
    hold.open(post: "p", playing: true)
    precondition(!hold.close(post: "different"), "a sheet never resumes a changed post")
    hold.open(post: "p", playing: true)
    precondition(hold.close(post: "p"))
    precondition(!hold.close(post: "p"), "a hold is consumed once")
    print(
      "PlaybackRecoveryTests: account/server/late-write isolation, bounded history, renewed/cancelled deadlines and Reply pause passed"
    )
  }
}
