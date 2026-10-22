import Foundation

/// A new file attempt or a preparation transition gets its own loading deadline.
struct PlaybackWait: Hashable, Sendable {
    let post: String
    let attempt: UUID
    let preparing: Bool

    @MainActor
    func run(nanoseconds: UInt64 = 15_000_000_000, timedOut: () -> Void) async {
        guard !preparing else { return }
        do { try await Task.sleep(nanoseconds: nanoseconds) } catch { return }
        guard !Task.isCancelled else { return }
        timedOut()
    }
}

/// A sheet only resumes the unchanged post it actually paused.
struct PlaybackHold {
    private var key: String?

    mutating func open(post: String, playing: Bool) {
        key = playing ? post : nil
    }

    mutating func close(post: String?) -> Bool {
        defer { key = nil }
        return key != nil && key == post
    }
}
