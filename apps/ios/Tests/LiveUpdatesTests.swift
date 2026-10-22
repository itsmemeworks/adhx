// swiftc Shared/API.swift Shared/FriendsAPI.swift Shared/LiveUpdates.swift Tests/LiveUpdatesTests.swift -o /tmp/adhx-live-updates
import Foundation

@MainActor private final class FakeLive: LiveChangeSource {
    enum Mode { case healthy, offline, reconnect }
    let mode: Mode
    var starts = 0, stops = 0
    init(_ mode: Mode) { self.mode = mode }
    func liveChanges(slug: String?, ready: () -> Void, changed: () -> Void) async throws {
        starts += 1
        defer { stops += 1 }
        if mode == .offline { throw APIError.offline }
        ready()
        if mode == .reconnect && starts == 1 { return }
        for _ in 0..<1000 { changed() }
        try await Task.sleep(nanoseconds: 60_000_000_000)
    }
}

@main struct LiveUpdatesTests {
    @MainActor static func main() async throws {
        var parser = LiveEventParser(), events = 0
        for byte in "\u{feff}: hello\r\nevent: refresh\r\ndata: {}\r\n\r\nevent: refresh\n\nevent: unknown\ndata: {}\n\nevent: refresh\ndata: first\ndata: second\n\n".utf8 {
            if try parser.feed(byte) { events += 1 }
        }
        precondition(events == 2, "CRLF, comments, BOM, empty data and unknown events")
        do {
            var oversized = LiveEventParser()
            for _ in 0..<8193 { _ = try oversized.feed(65) }
            preconditionFailure("unbounded line accepted")
        } catch LiveEventParser.Failure.tooLarge { }
        do {
            var oversized = LiveEventParser()
            for byte in ("event: refresh\n" + String(repeating: "data: " + String(repeating: "x", count: 8000) + "\n", count: 5)).utf8 { _ = try oversized.feed(byte) }
            preconditionFailure("unbounded frame accepted")
        } catch LiveEventParser.Failure.tooLarge { }

        let healthy = FakeLive(.healthy)
        var calls = 0, inFlight = 0, maximum = 0
        let following = Task {
            await LiveUpdates.follow(client: healthy, fallback: 1_000_000, active: { true }, refresh: {
                inFlight += 1; maximum = max(maximum, inFlight); calls += 1
                try? await Task.sleep(nanoseconds: 30_000_000)
                inFlight -= 1
            })
        }
        try await Task.sleep(nanoseconds: 1_500_000_000)
        let settled = calls
        try await Task.sleep(nanoseconds: 1_100_000_000)
        precondition(calls == settled && calls <= 2, "healthy SSE must not fall back or queue a thousand refreshes")
        following.cancel(); await following.value
        precondition(healthy.stops == healthy.starts && maximum == 1, "teardown and serial state reads")

        let offline = FakeLive(.offline)
        var fallbackCalls = 0
        await LiveUpdates.follow(client: offline, fallback: 1_000_000, active: { fallbackCalls < 2 }, refresh: { fallbackCalls += 1 })
        precondition(fallbackCalls == 2, "legacy/offline REST fallback")

        let switched = FakeLive(.healthy)
        var current = true
        let oldAccount = Task {
            await LiveUpdates.follow(client: switched, active: { current }, refresh: {})
        }
        try await Task.sleep(nanoseconds: 100_000_000)
        current = false
        await oldAccount.value
        precondition(switched.stops == switched.starts, "quiet streams must end on an account change")

        let reconnect = FakeLive(.reconnect)
        var reconciled = 0
        let reconnecting = Task {
            await LiveUpdates.follow(client: reconnect, active: { true }, refresh: { reconciled += 1 })
        }
        try await Task.sleep(nanoseconds: 1_600_000_000)
        reconnecting.cancel(); await reconnecting.value
        precondition(reconnect.starts >= 2 && reconciled >= 2, "reconnect must request authoritative state again")
        print("iOS live updates: framing, bounds, coalescing, serial refresh, cancellation, fallback and reconnect passed")
    }
}
