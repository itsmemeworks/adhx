import Foundation
import OSLog
import Security

let adhxLog = Logger(subsystem: "adhx.share", category: "app")

/// The App Group shared by the app and the Share Extension. The id comes from
/// the `ADHXAppGroup` Info.plist key (`group.$(ADHX_BUNDLE_PREFIX)`).
enum AppGroup {
    static let id: String? = {
        guard let value = Bundle.main.object(forInfoDictionaryKey: "ADHXAppGroup") as? String,
              !value.isEmpty, !value.contains("$(") else { return nil }
        return value
    }()

    /// Group defaults when the group is usable, else this process's own
    /// defaults (unsigned simulator builds).
    static let defaults: UserDefaults = {
        if let id,
           FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: id) != nil,
           let shared = UserDefaults(suiteName: id) {
            return shared
        }
        return .standard
    }()
}

/// The phone key, in the Keychain, shared through the App Group access group.
enum Keychain {
    private static let service = "adhx.phone-key"
    private static let account = "phone-key"

    private static func query(group: String?) -> [String: Any] {
        var q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        if let group { q[kSecAttrAccessGroup as String] = group }
        return q
    }

    @discardableResult
    static func save(_ key: String) -> Bool {
        delete()
        func add(group: String?) -> OSStatus {
            var q = query(group: group)
            q[kSecValueData as String] = Data(key.utf8)
            // After first unlock, so the background refresh can send waiting links.
            q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
            return SecItemAdd(q as CFDictionary, nil)
        }
        var status = add(group: AppGroup.id)
        if status == errSecMissingEntitlement || (status != errSecSuccess && AppGroup.id != nil) {
            // Unsigned simulator builds have no access groups.
            status = add(group: nil)
        }
        if status != errSecSuccess {
            adhxLog.error("Keychain save failed: \(status, privacy: .public)")
            #if targetEnvironment(simulator)
            // Unsigned simulator builds may have no keychain at all. Simulator only:
            // a device build never keeps the key outside the Keychain.
            AppGroup.defaults.set(key, forKey: simulatorKey)
            return true
            #endif
        }
        return status == errSecSuccess
    }

    private static let simulatorKey = "simulatorPhoneKey"

    static func read() -> String? {
        func find(group: String?) -> (OSStatus, String?) {
            var q = query(group: group)
            q[kSecReturnData as String] = true
            q[kSecMatchLimit as String] = kSecMatchLimitOne
            var result: AnyObject?
            let status = SecItemCopyMatching(q as CFDictionary, &result)
            guard status == errSecSuccess, let data = result as? Data else { return (status, nil) }
            return (status, String(data: data, encoding: .utf8))
        }
        if let group = AppGroup.id {
            let (status, value) = find(group: group)
            if let value { return value }
            if status != errSecMissingEntitlement && status != errSecItemNotFound { return nil }
        }
        if let value = find(group: nil).1 { return value }
        #if targetEnvironment(simulator)
        return AppGroup.defaults.string(forKey: simulatorKey)
        #else
        return nil
        #endif
    }

    static func delete() {
        if let group = AppGroup.id { SecItemDelete(query(group: group) as CFDictionary) }
        SecItemDelete(query(group: nil) as CFDictionary)
        AppGroup.defaults.removeObject(forKey: simulatorKey)
    }
}

/// Who this phone is connected to.
enum Store {
    private static var d: UserDefaults { AppGroup.defaults }

    static var server: URL? {
        get { d.string(forKey: "server").flatMap(URL.init(string:)) }
        set { d.set(newValue?.absoluteString, forKey: "server") }
    }

    /// Kept after Disconnect to fill in the address field next time.
    static var lastServer: String? {
        get { d.string(forKey: "lastServer") }
        set { d.set(newValue, forKey: "lastServer") }
    }

    static var username: String? {
        get { d.string(forKey: "username") }
        set { d.set(newValue, forKey: "username") }
    }

    static var phoneName: String? {
        get { d.string(forKey: "phoneName") }
        set { d.set(newValue, forKey: "phoneName") }
    }

    static var key: String? { Keychain.read() }

    static var isConnected: Bool { server != nil && key != nil }

    static func connect(server: URL, result: PairResult) {
        Keychain.save(result.key)
        self.server = server
        lastServer = Links.displayHost(server)
        username = result.username
        phoneName = result.name
    }

    /// Forgets the key, the list and anything waiting.
    static func disconnect() {
        Keychain.delete()
        server = nil
        username = nil
        phoneName = nil
        History.clear()
        OfflineQueue.clear()
    }

    static func client() -> ADHXClient? {
        guard let server, let key else { return nil }
        return ADHXClient(server: server, key: key)
    }
}

// MARK: - Shared lately

/// One share, as the phone remembers it.
struct ShareRecord: Codable, Identifiable, Equatable {
    enum Stage: String, Codable {
        case saving   // sent, no answer yet
        case saved    // the server has it
        case queued   // waiting for a connection
        case failed   // the server said no
    }

    var id: String = UUID().uuidString
    var link: String
    /// The server took it and is saving it in the background.
    var queueId: String?
    var platform: String?
    var network: String?
    var postId: String?
    var author: String?
    var authorName: String?
    var text: String?
    var posterUrl: String?
    var openPath: String?
    var alreadySaved: Bool?
    var savedAt: String?
    var stage: Stage = .saving
    var failure: String?
    var failureMessage: String?
    var status: String?
    var percent: Int?
    var quality: String?
    var kept: KeptCounts?
    var createdAt = Date()
    var updatedAt = Date()

    init(link: String) {
        self.link = link
        self.platform = Network.guess(from: link)
    }

    mutating func apply(_ r: SaveResult) {
        stage = .saved
        platform = r.platform
        network = r.network
        postId = r.id
        author = r.author
        authorName = r.authorName
        text = r.text
        posterUrl = r.posterUrl
        openPath = r.openPath
        alreadySaved = r.alreadySaved
        savedAt = r.savedAt
        failure = nil
        failureMessage = nil
        updatedAt = Date()
    }

    mutating func apply(_ s: StatusResult) {
        status = s.status
        percent = s.percent
        quality = s.quality
        kept = s.kept
        updatedAt = Date()
    }

    /// Taken by the server, being saved in the background.
    mutating func queue(_ id: String) {
        stage = .saving
        queueId = id
        updatedAt = Date()
    }

    /// What the server said about a link it was saving in the background.
    mutating func apply(_ q: QueuedSave) {
        switch q.state {
        case "saved":
            if let post = q.post { apply(post) }
        case "failed":
            let code = q.code ?? "failed"
            fail(.server(status: 200, code: code, message: q.error ?? APIError.fallbackMessage(for: code)))
        default:
            break
        }
    }

    mutating func fail(_ error: APIError) {
        stage = .failed
        failure = error.code
        failureMessage = error.message
        updatedAt = Date()
    }

    /// Saved, but its copy may still change.
    var needsStatus: Bool {
        stage == .saved && postId != nil && platform != nil && !KeepStatus.final.contains(status ?? "")
    }
}

enum History {
    private static let key = "history"
    private static let limit = 100
    private static let lock = NSLock()

    static func all() -> [ShareRecord] {
        guard let data = AppGroup.defaults.data(forKey: key),
              let records = try? JSONDecoder().decode([ShareRecord].self, from: data) else { return [] }
        return records
    }

    private static func write(_ records: [ShareRecord]) {
        let trimmed = Array(records.sorted { $0.createdAt > $1.createdAt }.prefix(limit))
        if let data = try? JSONEncoder().encode(trimmed) {
            AppGroup.defaults.set(data, forKey: key)
        }
    }

    static func upsert(_ record: ShareRecord) {
        lock.lock(); defer { lock.unlock() }
        var records = all()
        if let i = records.firstIndex(where: { $0.id == record.id }) {
            records[i] = record
        } else {
            records.insert(record, at: 0)
        }
        write(records)
    }

    /// Changes one record in place; returns the changed record.
    @discardableResult
    static func update(id: String, _ change: (inout ShareRecord) -> Void) -> ShareRecord? {
        lock.lock(); defer { lock.unlock() }
        var records = all()
        guard let i = records.firstIndex(where: { $0.id == id }) else { return nil }
        change(&records[i])
        write(records)
        return records[i]
    }

    static func clear() {
        AppGroup.defaults.removeObject(forKey: key)
    }
}

// MARK: - Waiting links

enum OfflineQueue {
    struct Entry: Codable, Equatable {
        var id: String   // the ShareRecord id
        var link: String
        var queuedAt = Date()
    }

    private static let key = "queue"
    private static let lock = NSLock()

    static func all() -> [Entry] {
        guard let data = AppGroup.defaults.data(forKey: key),
              let entries = try? JSONDecoder().decode([Entry].self, from: data) else { return [] }
        return entries
    }

    private static func write(_ entries: [Entry]) {
        if let data = try? JSONEncoder().encode(entries) {
            AppGroup.defaults.set(data, forKey: key)
        }
    }

    static var count: Int { all().count }

    static func add(id: String, link: String) {
        lock.lock(); defer { lock.unlock() }
        var entries = all()
        guard !entries.contains(where: { $0.id == id || $0.link == link }) else { return }
        entries.append(Entry(id: id, link: link))
        write(entries)
    }

    static func remove(id: String) {
        lock.lock(); defer { lock.unlock() }
        write(all().filter { $0.id != id })
    }

    static func clear() {
        AppGroup.defaults.removeObject(forKey: key)
    }
}

/// Sends waiting links, one at a time, stopping at the first sign of being offline.
actor Flusher {
    static let shared = Flusher()
    private var running = false

    enum Outcome { case nothingToSend, sent(Int), stillOffline(sent: Int), badKey, notConnected }

    @discardableResult
    func flush() async -> Outcome {
        guard !running else { return .nothingToSend }
        running = true
        defer { running = false }

        rescueStuckSaves()
        let entries = OfflineQueue.all()
        guard !entries.isEmpty else { return .nothingToSend }
        guard let client = Store.client() else { return .notConnected }

        var sent = 0
        for entry in entries {
            do {
                let answer = try await client.save(url: entry.link)
                OfflineQueue.remove(id: entry.id)
                let record: (inout ShareRecord) -> Void = { record in
                    switch answer {
                    case .saved(let result): record.apply(result)
                    case .queued(let id): record.queue(id)
                    }
                }
                if History.update(id: entry.id, record) == nil {
                    var new = ShareRecord(link: entry.link)
                    new.id = entry.id
                    record(&new)
                    History.upsert(new)
                }
                sent += 1
            } catch APIError.offline, APIError.slow {
                return .stillOffline(sent: sent)
            } catch APIError.badKey {
                return .badKey
            } catch let error as APIError {
                OfflineQueue.remove(id: entry.id)
                History.update(id: entry.id) { $0.fail(error) }
            } catch {
                return .stillOffline(sent: sent)
            }
        }
        return .sent(sent)
    }

    /// A share whose sheet closed before the answer came stays "saving";
    /// after a minute, send it again (the server knows if it already has it).
    private func rescueStuckSaves() {
        let cutoff = Date().addingTimeInterval(-60)
        // A share the server took (queueId) is in hand there; the refresher asks after it.
        for record in History.all()
        where record.stage == .saving && record.queueId == nil && record.updatedAt < cutoff {
            History.update(id: record.id) { $0.stage = .queued }
            OfflineQueue.add(id: record.id, link: record.link)
        }
    }
}

/// Asks the server how the kept copies are coming along.
enum StatusRefresher {
    static func refresh() async {
        guard let client = Store.client() else { return }
        for record in History.all() where record.stage == .saving {
            guard let queueId = record.queueId else { continue }
            do {
                let progress = try await client.queuedSave(id: queueId)
                History.update(id: record.id) { $0.apply(progress) }
            } catch APIError.server(let httpStatus, _, _) where httpStatus == 404 {
                History.update(id: record.id) {
                    $0.fail(.server(status: 404, code: "failed", message: APIError.fallbackMessage(for: "failed")))
                }
            } catch {
                return  // offline or key gone: try next time
            }
        }
        for record in History.all() where record.needsStatus {
            guard let platform = record.platform, let id = record.postId else { continue }
            do {
                let status = try await client.status(platform: platform, id: id)
                History.update(id: record.id) { $0.apply(status) }
            } catch APIError.server(let httpStatus, _, _) where httpStatus == 404 {
                History.update(id: record.id) { $0.status = "gone" }
            } catch {
                return  // offline or key gone: try next time
            }
        }
    }
}
