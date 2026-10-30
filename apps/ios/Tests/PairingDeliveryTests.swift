import Foundation

#if ADHX_HISTORY_TEST
enum KnownPeople { static func clear() {} }
#endif

/// swiftc -D ADHX_HISTORY_TEST Shared/API.swift Shared/FriendsAPI.swift Shared/Network.swift Shared/NetworkPaths.swift Shared/SVGPath.swift Shared/ResumeStore.swift Shared/Storage.swift Tests/PairingDeliveryTests.swift -o /tmp/adhx-pairing-delivery && /tmp/adhx-pairing-delivery
///
/// Runs the production queue and client through a fake transport, never a real
/// account or Keychain. Pairing at each boundary must not cross credentials.
final class PairingTransport: URLProtocol {
    static var receive: ((URLRequest) -> Void)?
    static var failure = false
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        Self.receive?(request)
        let status = Self.failure ? 401 : 202
        let body = Self.failure ? #"{"code":"bad_key","error":"old phone removed"}"# : #"{"queued":true,"id":"receipt"}"#
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: status,
            httpVersion: nil, headerFields: ["Content-Type": "application/json"])!, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(body.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

@main struct PairingDeliveryTests {
    static let server = URL(string: "https://adhx.invalid")!
    static func pair(_ name: String) {
        Store.connect(server: server, result: PairResult(key: "fixture-key-\(name)", name: name, username: name))
    }
    static func queue() -> ShareRecord {
        var record = ShareRecord(link: "https://example.com/private-account-a")
        record.stage = .queued
        record.choosePrivacy(true)
        precondition(History.upsert(record))
        OfflineQueue.add(id: record.id, link: record.link, isPrivate: true, connection: record.connection)
        return record
    }
    static func main() async throws {
        if CommandLine.arguments.contains("--rotate") {
            Store.beginConnection()
            return
        }
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        setenv("ADHX_HISTORY_TEST_DIRECTORY", directory.path, 1)
        let suite = "adhx-pairing-\(directory.lastPathComponent)"
        setenv("ADHX_STORAGE_TEST_SUITE", suite, 1)
        defer {
            AppGroup.defaults.removePersistentDomain(forName: suite)
            try? FileManager.default.removeItem(at: directory)
        }
        // Existing installs without a binding file keep their legacy pairing,
        // but disconnecting must never make an old legacy callback current again.
        Store.server = server
        Keychain.save("fixture-legacy")
        let legacy = Store.captureConnection()!
        precondition(legacy.id == Store.legacyConnection)
        Store.disconnect()
        precondition(!legacy.isCurrent)
        ADHXClient.testProtocolClasses = [PairingTransport.self]
        var requests = 0
        PairingTransport.receive = { request in
            requests += 1
            precondition(request.value(forHTTPHeaderField: "Authorization") == "Bearer fixture-key-a")
        }

        // Exact review interleave: pairing changes while the client's key is
        // being read. Capturing the generation before it must refuse the mix.
        pair("a")
        _ = queue()
        Keychain.beforeRead = { pair("b") }
        let mixed = await Flusher.shared.flush()
        if case .nothingToSend = mixed {} else if case .notConnected = mixed {} else {
            preconditionFailure("A mixed client must never send")
        }
        precondition(requests == 0 && History.all().isEmpty && Store.username == "b")

        // Both successful and rejected late replies keep B's new key and
        // history. The returned outcome cannot tell AppModel to sign B out.
        for failure in [false, true] {
            pair("a")
            _ = queue()
            PairingTransport.failure = failure
            PairingTransport.receive = { request in
                requests += 1
                precondition(request.value(forHTTPHeaderField: "Authorization") == "Bearer fixture-key-a")
                pair("b")
            }
            let outcome = await Flusher.shared.flush()
            if case .notConnected = outcome {} else { preconditionFailure("Obsolete reply must be ignored") }
            precondition(Store.username == "b" && Store.key == "fixture-key-b" && History.all().isEmpty)
        }
        precondition(requests == 2)
        let old = Store.captureConnection()!
        pair("c")
        precondition(!Store.ifCurrent(old.id) { Store.disconnect() })
        precondition(Store.key == "fixture-key-c")
        let current = Store.captureConnection()!
        precondition(Store.ifCurrent(current.id) { Store.disconnect() })
        precondition(!current.isCurrent && !Store.isConnected)
        pair("a")
        let beforeOtherProcess = Store.captureConnection()!
        let child = Process()
        child.executableURL = URL(fileURLWithPath: CommandLine.arguments[0])
        child.arguments = ["--rotate"]
        child.environment = ProcessInfo.processInfo.environment
        try child.run()
        child.waitUntilExit()
        precondition(child.terminationStatus == 0 && !beforeOtherProcess.isCurrent)
        precondition(!Store.ifCurrent(beforeOtherProcess.id) { preconditionFailure("Stale cross-process callback") })
        print("Pairing delivery: mixed capture, late success/401 and conditional sign-out passed")
    }
}
