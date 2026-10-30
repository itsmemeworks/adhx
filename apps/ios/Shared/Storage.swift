import Foundation
import Darwin
import OSLog
import Security

let adhxLog = Logger(subsystem: "adhx.share", category: "app")

/// The App Group shared by the app and the Share Extension. The id comes from
/// the `ADHXAppGroup` Info.plist key (`group.$(ADHX_BUNDLE_PREFIX)`).
enum AppGroup {
    static let id: String? = {
        guard let value = Bundle.main.object(forInfoDictionaryKey: "ADHXAppGroup") as? String,
              !value.isEmpty, !value.contains("$(") else { return nil }
        return resolve(declared: value, signed: signedGroups()) {
            FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: $0) != nil
        }
    }()

    /// SideStore and AltStore re-sign the app with the installer's own Apple
    /// ID and rename the group to `group.<prefix>.<TEAMID>`. When the declared
    /// group can't be used, take the signed group that starts with it, so the
    /// app and the Share Extension still meet in the same place.
    static func resolve(declared: String, signed: [String], usable: (String) -> Bool) -> String {
        if usable(declared) { return declared }
        return signed
            .filter { $0.hasPrefix(declared + ".") && usable($0) }
            .min { $0.count < $1.count } ?? declared
    }

    /// The groups this build was signed with. AltStore lists them under
    /// `ALTAppGroups`; otherwise they're in the embedded provisioning profile.
    private static func signedGroups() -> [String] {
        if let listed = Bundle.main.object(forInfoDictionaryKey: "ALTAppGroups") as? [String] { return listed }
        guard let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
              let data = try? Data(contentsOf: url) else { return [] }
        return profileGroups(data)
    }

    /// The App Groups in a provisioning profile: a signed wrapper around a
    /// plain plist, so read the plist out of the middle.
    static func profileGroups(_ profile: Data) -> [String] {
        guard let start = profile.range(of: Data("<?xml".utf8)),
              let end = profile.range(of: Data("</plist>".utf8), in: start.lowerBound..<profile.endIndex),
              let plist = try? PropertyListSerialization.propertyList(
                  from: profile[start.lowerBound..<end.upperBound], format: nil) as? [String: Any],
              let entitlements = plist["Entitlements"] as? [String: Any] else { return [] }
        return entitlements["com.apple.security.application-groups"] as? [String] ?? []
    }

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

    /// Your picture (from `/api/app/me`), for your own reactions. nil: your initial.
    static var avatarUrl: String? {
        get { d.string(forKey: "avatarUrl") }
        set { d.set(newValue, forKey: "avatarUrl") }
    }

    /// Where your picture came from (upload · gob · x · generated), once a
    /// newer server has said. nil: not known yet.
    static var avatarSource: String? {
        get { d.string(forKey: "avatarSource") }
        set { d.set(newValue, forKey: "avatarSource") }
    }

    static var phoneName: String? {
        get { d.string(forKey: "phoneName") }
        set { d.set(newValue, forKey: "phoneName") }
    }

    static var key: String? { Keychain.read() }

    static var isConnected: Bool { server != nil && key != nil }

    /// Which pairing shares, notes and history belong to. Every connect makes a
    /// new one, so nothing one account left waiting is ever sent with another
    /// account's key, or shown under it. Installs paired before this existed
    /// are `legacy` until they next connect.
    static var connectionId: String { d.string(forKey: "connectionId") ?? legacyConnection }
    static let legacyConnection = "legacy"

    static func connect(server: URL, result: PairResult) {
        ResumeStore.clear()
        beginConnection()
        Keychain.save(result.key)
        self.server = server
        lastServer = Links.displayHost(server)
        username = result.username
        phoneName = result.name
        avatarUrl = nil
        avatarSource = nil
    }

    /// A new pairing, possibly another account: start with nothing from the
    /// old one. Late work from the old pairing carries its old id and is dropped.
    static func beginConnection() {
        d.set(UUID().uuidString, forKey: "connectionId")
        History.clear()
        OfflineQueue.clear()
        KnownPeople.clear()
    }

    /// Forgets the key, the list and anything waiting.
    static func disconnect() {
        ResumeStore.clear()
        d.removeObject(forKey: "connectionId")
        Keychain.delete()
        server = nil
        username = nil
        avatarUrl = nil
        avatarSource = nil
        phoneName = nil
        History.clear()
        OfflineQueue.clear()
        KnownPeople.clear()
        Prefs.justForMeByDefault = false
    }

    static func client() -> ADHXClient? {
        guard let server, let key else { return nil }
        return ADHXClient(server: server, key: key)
    }
}

/// Choices in Settings that this phone keeps (in the App Group, so the Share
/// Extension reads them too).
enum Prefs {
    private static var d: UserDefaults { AppGroup.defaults }

    /// "Just for me by default": shares from this phone go out with
    /// `private: true`. The server keeps the same choice for the web
    /// (`save.privateDefault`) but has no phone route for it yet, so the
    /// phone keeps its own; off leaves `private` out, so the server's
    /// choice still applies.
    static var justForMeByDefault: Bool {
        get { d.bool(forKey: "justForMeByDefault") }
        set { d.set(newValue, forKey: "justForMeByDefault") }
    }

    /// Sound for every video: Settings' "Sound on by default", and the
    /// player's sound button, which changes it until you change it back.
    static var soundOn: Bool {
        get { d.bool(forKey: "soundOn") }
        set { d.set(newValue, forKey: "soundOn") }
    }

    /// Videos fill the screen (the default, cropped like the boards), or fit
    /// it whole at their own shape (`fitVideo`).
    static var fitVideo: Bool {
        get { d.bool(forKey: "fitVideo") }
        set { d.set(newValue, forKey: "fitVideo") }
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
    /// The pairing it was shared under (`Store.connectionId`); nil before pairings had ids.
    var connection: String? = Store.connectionId
    /// Words added after the share went, until the server has them.
    var pendingNote: String?
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
    /// The server's word: this save is "Just for me".
    var isPrivate: Bool?
    /// "Just for me" was switched before the server had the post; applied
    /// once it lands (`StatusRefresher`).
    var wantsPrivate: Bool?
    /// Acknowledgement interrupted by the extension closing: retry safely.
    var publishPending: Bool?
    /// Reused after a lost answer; changed only by a new explicit choice.
    var privacyIntentVersion: Int?
    var createdAt = Date()
    var updatedAt = Date()

    init(link: String) {
        self.link = link
        self.platform = Network.guess(from: link)
    }

    var intentVersion: Int { privacyIntentVersion ?? 1 }

    mutating func choosePrivacy(_ on: Bool) {
        privacyIntentVersion = intentVersion + 1
        wantsPrivate = on
        if queueId != nil { publishPending = true }
    }

    mutating func acknowledgePrivacy(version: Int, private choice: Bool?) {
        guard intentVersion == version else { return }
        publishPending = false
        wantsPrivate = nil
        if let choice { isPrivate = choice }
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
        if publishPending != true, let p = r.isPrivate { isPrivate = p }
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

    /// Shared under the pairing this phone has now.
    var isCurrent: Bool { (connection ?? Store.legacyConnection) == Store.connectionId }

    /// Saved, but its copy may still change.
    var needsStatus: Bool {
        stage == .saved && postId != nil && platform != nil && !KeepStatus.final.contains(status ?? "")
    }
}

enum History {
    private static let key = "history"
    private static let limit = 100
    private static let lock = NSLock()
    private static let file: URL = {
        #if ADHX_HISTORY_TEST
        if let directory = ProcessInfo.processInfo.environment["ADHX_HISTORY_TEST_DIRECTORY"] {
            return URL(fileURLWithPath: directory).appendingPathComponent("history.json")
        }
        #endif
        let base = AppGroup.id.flatMap { FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: $0) }
            ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
                .appendingPathComponent("ADHXShare", isDirectory: true)
        return base.appendingPathComponent("history.json")
    }()

    /// Atomic files avoid torn reads. Unlike UserDefaults' cached whole-array value,
    /// each process reads the latest committed intent before taking the write lock.
    /// This pairing's shares only; another pairing's are dropped on the next write.
    static func all() -> [ShareRecord] {
        guard let data = (try? Data(contentsOf: file)) ?? AppGroup.defaults.data(forKey: key),
              let records = try? JSONDecoder().decode([ShareRecord].self, from: data) else { return [] }
        let current = Store.connectionId
        return records.filter { ($0.connection ?? Store.legacyConnection) == current }
    }

    private static func locked<R>(unavailable: R, _ body: () -> R) -> R {
        lock.lock(); defer { lock.unlock() }
        do {
            try FileManager.default.createDirectory(at: file.deletingLastPathComponent(),
                withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        } catch { return unavailable }
        let fd = open(file.appendingPathExtension("lock").path, O_CREAT | O_RDWR, 0o600)
        guard fd >= 0 else { return unavailable }
        defer { close(fd) }
        guard flock(fd, LOCK_EX) == 0 else { return unavailable }
        defer { flock(fd, LOCK_UN) }
        return body()
    }

    private static func write(_ records: [ShareRecord]) -> Bool {
        let sorted = records.sorted { $0.createdAt > $1.createdAt }
        let pending = sorted.filter { $0.publishPending == true || $0.stage == .saving || $0.stage == .queued }
        let completed = sorted.filter { $0.publishPending != true && $0.stage != .saving && $0.stage != .queued }
        do {
            try JSONEncoder().encode(pending + completed.prefix(limit)).write(to: file, options: .atomic)
            // Migration from the old app-group preference is complete only after a successful write.
            AppGroup.defaults.removeObject(forKey: key)
            return true
        } catch {
            adhxLog.error("Could not persist shared history")
            return false
        }
    }

    /// Refuses a share made under an earlier pairing.
    @discardableResult
    static func upsert(_ record: ShareRecord) -> Bool {
        guard record.isCurrent else { return false }
        return locked(unavailable: false) {
            var records = all()
            if let i = records.firstIndex(where: { $0.id == record.id }) { records[i] = record }
            else { records.insert(record, at: 0) }
            return write(records)
        }
    }

    /// Cross-process read/modify/write: the app and extension cannot discard each other's intent.
    @discardableResult
    static func update(id: String, _ change: (inout ShareRecord) -> Void) -> ShareRecord? {
        locked(unavailable: nil) {
            var records = all()
            guard let i = records.firstIndex(where: { $0.id == id }) else { return nil }
            change(&records[i])
            guard write(records) else { return nil }
            return records[i]
        }
    }

    static func clear() {
        _ = locked(unavailable: false) { write([]) }
    }
}

// MARK: - Waiting links

enum OfflineQueue {
    struct Entry: Codable, Equatable {
        var id: String   // the ShareRecord id
        var link: String
        var queuedAt = Date()
        /// Send it "Just for me" (nil: as the server likes, shared).
        var isPrivate: Bool?
        /// The pairing it was shared under; only that pairing's key sends it.
        var connection: String?
    }

    private static let key = "queue"
    private static let lock = NSLock()

    /// This pairing's waiting links only.
    static func all() -> [Entry] {
        guard let data = AppGroup.defaults.data(forKey: key),
              let entries = try? JSONDecoder().decode([Entry].self, from: data) else { return [] }
        let current = Store.connectionId
        return entries.filter { ($0.connection ?? Store.legacyConnection) == current }
    }

    private static func write(_ entries: [Entry]) {
        if let data = try? JSONEncoder().encode(entries) {
            AppGroup.defaults.set(data, forKey: key)
        }
    }

    static var count: Int { all().count }

    /// `connection`: the pairing the share was made under. A share from an
    /// earlier pairing is never queued under this one.
    static func add(id: String, link: String, isPrivate: Bool? = nil, connection: String?) {
        lock.lock(); defer { lock.unlock() }
        let connection = connection ?? Store.legacyConnection
        guard connection == Store.connectionId else { return }
        var entries = all()
        guard !entries.contains(where: { $0.id == id }) else { return }
        entries.append(Entry(id: id, link: link, isPrivate: isPrivate, connection: connection))
        write(entries)
    }

    /// "Just for me" switched while the link waits.
    static func setPrivate(id: String, _ isPrivate: Bool) {
        lock.lock(); defer { lock.unlock() }
        var entries = all()
        guard let index = entries.firstIndex(where: { $0.id == id }) else { return }
        entries[index].isPrivate = isPrivate
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
        let connection = Store.connectionId

        var sent = 0
        for entry in entries {
            // Paired again meanwhile: this key isn't the one these links were shared under.
            guard Store.connectionId == connection else { return .notConnected }
            // An earlier POST may have committed its receipt before the app died
            // removing this queue entry. Resume it through StatusRefresher instead.
            if History.all().first(where: { $0.id == entry.id })?.queueId != nil {
                OfflineQueue.remove(id: entry.id)
                continue
            }
            do {
                let held = History.all().first { $0.id == entry.id }
                let answer = try await client.save(url: entry.link, private: held?.wantsPrivate ?? entry.isPrivate,
                                                   deferPublish: true, requestId: entry.id, note: held?.pendingNote)
                guard Store.connectionId == connection else { return .notConnected }
                let record: (inout ShareRecord) -> Void = { record in
                    if record.pendingNote == held?.pendingNote { record.pendingNote = nil }
                    switch answer {
                    case .saved(let result): record.apply(result)
                    case .queued(let id):
                        record.queue(id)
                        record.publishPending = true
                        record.privacyIntentVersion = record.intentVersion
                        if record.wantsPrivate == nil { record.wantsPrivate = entry.isPrivate }
                    }
                }
                if History.update(id: entry.id, record) == nil {
                    // Existing row plus nil means the write failed. Never recreate
                    // it at version1 and discard a more recent explicit choice.
                    guard !History.all().contains(where: { $0.id == entry.id }) else { return .stillOffline(sent: sent) }
                    var new = ShareRecord(link: entry.link)
                    new.id = entry.id
                    record(&new)
                    guard History.upsert(new) else { return .stillOffline(sent: sent) }
                }
                OfflineQueue.remove(id: entry.id)
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
    func rescueStuckSaves() {
        let cutoff = Date().addingTimeInterval(-60)
        // A share the server took (queueId) is in hand there; the refresher asks after it.
        for record in History.all()
        where record.queueId == nil &&
            (record.stage == .queued || (record.stage == .saving && record.updatedAt < cutoff)) {
            History.update(id: record.id) { $0.stage = .queued }
            OfflineQueue.add(id: record.id, link: record.link, isPrivate: record.wantsPrivate,
                             connection: record.connection)
        }
    }
}

/// Asks the server how the kept copies are coming along.
enum StatusRefresher {
    /// "Just for me" switched on the sheet before the post had landed: tell
    /// the server now that it has it.
    private static func applyWantedPrivacy(_ record: ShareRecord, landed progress: QueuedSave,
                                           client: ADHXClient) async {
        guard progress.state == "saved", let queueId = record.queueId,
              let wanted = record.wantsPrivate else { return }
        guard (try? await client.queuedPrivacy(id: queueId, private: wanted, intentVersion: record.intentVersion)) != nil
        else { return }
        History.update(id: record.id) { $0.acknowledgePrivacy(version: record.intentVersion, private: wanted) }
    }

    static func refresh() async {
        guard let client = Store.client() else { return }
        let connection = Store.connectionId
        for record in History.all() where record.stage == .saving || record.publishPending == true {
            guard Store.connectionId == connection else { return }
            guard let queueId = record.queueId else { continue }
            do {
                if record.publishPending == true {
                    try await client.queuedPrivacy(id: queueId, private: record.wantsPrivate, intentVersion: record.intentVersion)
                    History.update(id: record.id) { $0.acknowledgePrivacy(version: record.intentVersion, private: record.wantsPrivate) }
                }
                let progress = try await client.queuedSave(id: queueId)
                History.update(id: record.id) { $0.apply(progress) }
                if record.publishPending != true {
                    await applyWantedPrivacy(record, landed: progress, client: client)
                }
            } catch APIError.server(let httpStatus, _, _) where httpStatus == 404 {
                History.update(id: record.id) {
                    $0.fail(.server(status: 404, code: "failed", message: APIError.fallbackMessage(for: "failed")))
                }
            } catch {
                return  // offline or key gone: try next time
            }
        }
        // A note added after the share went, which didn't reach the server then.
        for record in History.all() where record.pendingNote != nil {
            guard Store.connectionId == connection else { return }
            guard let note = record.pendingNote else { continue }
            do {
                if record.stage == .saved, let platform = record.platform, let id = record.postId {
                    _ = try await client.setNote(platform: platform, id: id, note: note)
                } else if record.stage == .saving, record.queueId != nil {
                    // The same share again (link and request id): the server keeps the note.
                    _ = try await client.save(url: record.link, deferPublish: true, requestId: record.id, note: note)
                } else {
                    continue
                }
                History.update(id: record.id) { if $0.pendingNote == note { $0.pendingNote = nil } }
            } catch {
                return  // offline or key gone: try next time
            }
        }
        for record in History.all() where record.needsStatus {
            guard Store.connectionId == connection else { return }
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
