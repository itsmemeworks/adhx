import Foundation

#if ADHX_HISTORY_TEST
// Store.disconnect references this UI-owned cache; these tests exercise the real
// storage and record code without compiling the app's UIKit avatar views.
enum KnownPeople { static func clear() {} }
#endif

/// Run without a device: swiftc -D ADHX_HISTORY_TEST Shared/API.swift Shared/FriendsAPI.swift Shared/Network.swift Shared/NetworkPaths.swift Shared/SVGPath.swift Shared/ResumeStore.swift Shared/Storage.swift Tests/QueuedPrivacyTests.swift -o /tmp/adhx-privacy-tests && /tmp/adhx-privacy-tests
@main
struct QueuedPrivacyTests {
    static func restored(_ record: ShareRecord) throws -> ShareRecord {
        try JSONDecoder().decode(ShareRecord.self, from: JSONEncoder().encode(record))
    }

    static func main() async throws {
        if CommandLine.arguments.contains("--history-writer") {
            for _ in 0..<32 {
                precondition(History.update(id: "concurrent") { $0.choosePrivacy(true) } != nil)
            }
            return
        }
        #if ADHX_HISTORY_TEST
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        setenv("ADHX_HISTORY_TEST_DIRECTORY", directory.path, 1)
        defer { try? FileManager.default.removeItem(at: directory) }
        setenv("ADHX_STORAGE_TEST_SUITE", "adhx-storage-\(directory.lastPathComponent)", 1)
        Store.beginConnection()
        #endif
        // Save notes decode loosely: present, missing, blank or too long.
        let noted = try JSONDecoder().decode([Saver].self, from: Data(#"""
            [{"username":"ben","note":"  you're welcome "},{"username":"ana"},{"username":"jo","note":""},
             {"username":"mum","note":7},{"username":"pete","note":"\#(String(repeating: "x", count: 200))"}]
            """#.utf8))
        precondition(noted[0].note == "you're welcome")
        precondition(noted[1].note == nil && noted[2].note == nil && noted[3].note == nil)
        precondition(noted[4].note?.count == 140)
        var record = ShareRecord(link: "https://example.com/post")
        record.queue("receipt")
        record.publishPending = true
        precondition(record.intentVersion == 1)
        record.choosePrivacy(false)
        let initial = try restored(record)
        precondition(initial.queueId == "receipt" && initial.wantsPrivate == false)
        precondition(initial.intentVersion == 2 && initial.publishPending == true)
        // Closing the extension and restoring state after an accepted-but-lost response
        // must send exactly the same choice/version, never allocate a newer intent.
        var retry = try restored(initial)
        precondition(retry.intentVersion == initial.intentVersion && retry.wantsPrivate == initial.wantsPrivate)
        retry.acknowledgePrivacy(version: initial.intentVersion, private: initial.wantsPrivate)
        precondition(retry.publishPending == false && retry.wantsPrivate == nil)
        // A newer toggle during an older response cannot be discarded by that completion.
        record.choosePrivacy(true)
        let latestVersion = record.intentVersion
        record.acknowledgePrivacy(version: initial.intentVersion, private: initial.wantsPrivate)
        precondition(record.publishPending == true && record.wantsPrivate == true)
        precondition(record.intentVersion == latestVersion)
        record.acknowledgePrivacy(version: latestVersion, private: true)
        precondition(record.publishPending == false && record.isPrivate == true)
        // Legacy JSON without a version remains decodable and its first acknowledgement uses1.
        let old = try JSONDecoder().decode(ShareRecord.self, from: Data(#"{"id":"old","link":"https://example.com","stage":"saving","createdAt":0,"updatedAt":0}"#.utf8))
        precondition(old.intentVersion == 1 && old.wantsPrivate == nil)
        #if ADHX_HISTORY_TEST
        var shared = ShareRecord(link: "https://example.com/concurrent")
        shared.id = "concurrent"
        shared.queue("receipt")
        shared.publishPending = true
        precondition(History.upsert(shared))
        let writers = (0..<2).map { _ -> Process in
            let worker = Process()
            worker.executableURL = URL(fileURLWithPath: CommandLine.arguments[0])
            worker.arguments = ["--history-writer"]
            worker.environment = ProcessInfo.processInfo.environment
            return worker
        }
        for worker in writers { try worker.run() }
        for worker in writers { worker.waitUntilExit(); precondition(worker.terminationStatus == 0) }
        let concurrent = History.all().first { $0.id == "concurrent" }!
        precondition(concurrent.intentVersion == 65, "App/extension mutations must not lose an intent version")
        precondition(concurrent.publishPending == true && concurrent.wantsPrivate == true)
        // Recent-history limits must never evict a pending receipt/acknowledgement.
        for i in 0..<110 {
            var done = ShareRecord(link: "https://example.com/\(i)")
            done.stage = .saved
            precondition(History.upsert(done))
        }
        precondition(History.all().count == 101)
        precondition(History.all().contains { $0.id == "concurrent" && $0.queueId == "receipt" })
        History.clear()
        precondition(History.all().isEmpty)
        OfflineQueue.clear()
        var firstQueued = ShareRecord(link: "https://example.com/offline")
        firstQueued.stage = .queued
        firstQueued.choosePrivacy(false)
        var secondQueued = ShareRecord(link: firstQueued.link)
        secondQueued.stage = .queued
        secondQueued.choosePrivacy(true)
        precondition(History.upsert(firstQueued) && History.upsert(secondQueued))
        // If the legacy queue array lost an entry, the durable history reconstructs it.
        await Flusher.shared.rescueStuckSaves()
        precondition(OfflineQueue.all().count == 2)
        precondition(OfflineQueue.all().first { $0.id == firstQueued.id }?.isPrivate == false)
        precondition(OfflineQueue.all().first { $0.id == secondQueued.id }?.isPrivate == true)
        History.clear()
        OfflineQueue.clear()
        // Pairing again (perhaps as someone else) leaves nothing from the old
        // pairing to show or send, and late work from it is refused.
        Store.beginConnection()
        var fromA = ShareRecord(link: "https://example.com/account-a-private")
        fromA.stage = .queued
        fromA.choosePrivacy(true)
        fromA.pendingNote = "for a only"
        precondition(History.upsert(fromA))
        OfflineQueue.add(id: fromA.id, link: fromA.link, isPrivate: true, connection: fromA.connection)
        precondition(History.all().count == 1 && OfflineQueue.all().count == 1)
        Store.beginConnection()
        precondition(History.all().isEmpty && OfflineQueue.all().isEmpty)
        precondition(!History.upsert(fromA), "A share from the old pairing must not come back")
        OfflineQueue.add(id: fromA.id, link: fromA.link, isPrivate: true, connection: fromA.connection)
        precondition(OfflineQueue.all().isEmpty)
        precondition(History.update(id: fromA.id) { $0.stage = .saved } == nil)
        if case .nothingToSend = await Flusher.shared.flush() {} else {
            preconditionFailure("Nothing from the old pairing may be sent")
        }
        // Records from before pairings had ids belong to that first pairing only.
        let legacy = try JSONDecoder().decode(ShareRecord.self, from: Data(#"{"id":"legacy","link":"https://example.com","stage":"saving","createdAt":0,"updatedAt":0}"#.utf8))
        precondition(legacy.connection == nil && !legacy.isCurrent)
        History.clear()
        OfflineQueue.clear()
        #endif
        print("iOS queued privacy: state restoration, version guards, cross-process writes, pending retention and pairing scope passed")
    }
}
