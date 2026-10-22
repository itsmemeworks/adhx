import Foundation

/// Bounded SSE framing. Byte-oriented so even a peer that never sends a newline
/// cannot grow a line indefinitely. We only act on payload-free refresh events.
struct LiveEventParser {
    private var line = [UInt8]()
    private var event = ""
    private var dataBytes = 0
    private var afterCR = false
    private var firstLine = true
    enum Failure: Error { case tooLarge }
    mutating func feed(_ byte: UInt8) throws -> Bool {
        if afterCR { afterCR = false; if byte == 10 { return false } }
        if byte == 10 || byte == 13 {
            afterCR = byte == 13
            defer { line.removeAll(keepingCapacity: true) }
            if line.isEmpty {
                defer { event = ""; dataBytes = 0 }
                return event == "refresh" && dataBytes > 0
            }
            var text = String(decoding: line, as: UTF8.self)
            if firstLine { firstLine = false; if text.first == "\u{feff}" { text.removeFirst() } }
            if text.hasPrefix("event:") { event = String(text.dropFirst(6)).trimmingCharacters(in: .whitespaces) }
            if text.hasPrefix("data:") { dataBytes += line.count; if dataBytes > 32_768 { throw Failure.tooLarge } }
            return false
        }
        guard line.count < 8_192 else { throw Failure.tooLarge }
        line.append(byte)
        return false
    }
}

@MainActor protocol LiveChangeSource {
    func liveChanges(slug: String?, ready: () -> Void, changed: () -> Void) async throws
}

extension ADHXClient: LiveChangeSource {
    /// A dedicated ephemeral session: cancellation never cancels other API work.
    @MainActor func liveChanges(slug: String?, ready: () -> Void, changed: () -> Void) async throws {
        if let slug, slug.range(of: "^[a-z0-9-]{1,64}$", options: .regularExpression) == nil { throw APIError.offline }
        guard let key, var parts = URLComponents(url: server, resolvingAgainstBaseURL: false) else { throw APIError.badKey("This phone isn’t connected any more.") }
        let base = parts.percentEncodedPath.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let room = slug.map { "/\($0.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? "")" } ?? ""
        parts.percentEncodedPath = (base.isEmpty ? "" : "/" + base) + "/api/app/live" + room + "/stream"
        parts.queryItems = [URLQueryItem(name: "notify", value: "1")]
        guard let url = parts.url else { throw APIError.offline }
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 45
        config.timeoutIntervalForResource = 900
        config.waitsForConnectivity = false
        let session = URLSession(configuration: config)
        defer { session.invalidateAndCancel() }
        var request = URLRequest(url: url)
        request.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        // Never send a phone key through a redirected stream, even to a new host.
        let delegate = LiveNoRedirect()
        let (bytes, response) = try await session.bytes(for: request, delegate: delegate)
        guard let http = response as? HTTPURLResponse else { throw APIError.offline }
        if http.statusCode == 401 || http.statusCode == 403 { throw APIError.badKey("This phone isn’t connected any more.") }
        guard http.statusCode == 200,
              http.value(forHTTPHeaderField: "Content-Type")?.lowercased().hasPrefix("text/event-stream") == true else { throw APIError.offline }
        try Task.checkCancellation()
        ready()
        var parser = LiveEventParser()
        for try await byte in bytes {
            try Task.checkCancellation()
            if try parser.feed(byte) { changed() }
        }
    }
}

private final class LiveNoRedirect: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}

/// One foreground subscription; state fetches never overlap and signals coalesce.
/// Reconcile periodically because SSE is transient, not a durable message log.
@MainActor
enum LiveUpdates {
    static func follow(client: any LiveChangeSource, slug: String? = nil, fallback: UInt64 = 5_000_000_000,
                       active: @escaping () -> Bool, refresh: @escaping () async -> Void) async {
        var streaming = false
        var refreshed = ContinuousClock.now
        let (signals, continuation) = AsyncStream<Void>.makeStream(bufferingPolicy: .bufferingNewest(1))
        let stream = Task {
            var retry: UInt64 = 1_000_000_000
            while !Task.isCancelled && active() {
                do {
                    try await client.liveChanges(slug: slug, ready: {
                        streaming = true
                        retry = 1_000_000_000
                        continuation.yield(()) // Resync on every open/reconnect.
                    }, changed: { continuation.yield(()) })
                } catch is CancellationError { break
                } catch APIError.badKey { continuation.yield(()); break
                } catch { /* Keep the legacy REST path available while reconnecting. */ }
                streaming = false
                do { try await Task.sleep(nanoseconds: retry + UInt64.random(in: 0...250_000_000)) } catch { break }
                retry = min(retry * 2, 30_000_000_000)
            }
            streaming = false
        }
        let reconcile = Task {
            defer { continuation.finish() }
            continuation.yield(())
            while !Task.isCancelled && active() {
                do { try await Task.sleep(nanoseconds: 1_000_000_000) } catch { break }
                let interval = streaming ? 30_000_000_000 : fallback
                if refreshed.duration(to: .now) >= .nanoseconds(Int64(interval)) { continuation.yield(()) }
            }
        }
        defer { stream.cancel(); reconcile.cancel(); continuation.finish() }
        for await _ in signals {
            guard !Task.isCancelled && active() else { break }
            await refresh()
            refreshed = .now
            guard active() else { break }
            do { try await Task.sleep(nanoseconds: 1_000_000_000) } catch { break }
        }
    }
}
