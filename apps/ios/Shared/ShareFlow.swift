import Foundation
import UIKit

/// The share sheet's states (docs/specs/phone-app.md → The share sheet).
/// Holds no UIKit extension types, so the sheet views can live in Shared.
@MainActor
final class ShareFlow: ObservableObject {
    enum Phase: Equatable {
        case reading
        case saving
        case saved
        case alreadySaved
        case notAPost
        case offline
        case notConnected
        case problem(title: String, message: String)
    }

    @Published private(set) var phase: Phase = .reading
    @Published private(set) var link: String?
    @Published private(set) var platform: String?
    @Published private(set) var result: SaveResult?
    @Published private(set) var keep: StatusResult?
    @Published private(set) var closeRequested = false
    /// Set once the person touches the sheet; stops the auto close.
    @Published var touched = false
    /// iOS may show the extension in its own card instead of over the app;
    /// then the backdrop is solid (as on the States boards) instead of dimmed.
    @Published var presentedInCard = false
    /// The card's height, so the extension can ask iOS for a sheet that fits it.
    @Published var cardHeight: CGFloat = 0

    /// "Just for me": no one else sees, counts or is told about this save.
    @Published private(set) var justForMe = false
    /// Telling the server about a switch made after the save went.
    @Published private(set) var privacyBusy = false
    @Published private(set) var privacyError: String?
    /// The people this phone knows (from the feed and channels), who will see
    /// a shared save.
    let people: [Saver] = KnownPeople.all()
    private var privacyTouched = false
    private var client: ADHXClient?

    private(set) var server: URL?
    private var recordId: String?
    private var saveTask: Task<Void, Never>?
    private var pollTask: Task<Void, Never>?
    private var queueId: String?
    private var privacyTask: Task<Void, Never>?
    private var autoCloseTask: Task<Void, Never>?

    /// Called once the sheet has animated away.
    var onFinish: (() -> Void)?
    /// Opens a link outside the extension.
    var onOpen: ((URL) -> Void)?

    static let pollInterval: UInt64 = 1_500_000_000
    static let autoCloseDelay: UInt64 = 3_000_000_000

    var isSaving: Bool { phase == .saving }

    /// The post's words and pictures for the sheet.
    var title: String? {
        guard let r = result else { return nil }
        return Format.title(platform: r.platform, author: r.author, authorName: r.authorName,
                            text: r.text, link: link ?? "")
    }

    var words: String? {
        guard let r = result, let text = r.text, !text.isEmpty else { return nil }
        // When the words are already the title, don't repeat them.
        if Network.titleIsWords(r.platform) { return nil }
        return text
    }

    var posterURL: URL? {
        guard let server else { return nil }
        return ADHXClient.resolve(result?.posterUrl, against: server)
    }

    /// The app, on this post; the website only when there's no post yet.
    var openURL: URL? {
        if let r = result, let url = Links.post(platform: r.platform, id: r.id) { return url }
        guard let server else { return nil }
        return ADHXClient.resolve(result?.openPath, against: server) ?? server
    }

    var networkName: String { result?.network ?? Network.name(platform) }

    // MARK: Flow

    func start(link: String?) {
        guard let link else {
            phase = .notAPost
            return
        }
        self.link = link
        platform = Network.guess(from: link)
        guard let client = Store.client() else {
            phase = .notConnected
            return
        }
        server = client.server
        self.client = client

        var record = ShareRecord(link: link)
        // Settings → "Just for me by default": the switch starts on and the
        // share goes out private.
        if Prefs.justForMeByDefault {
            justForMe = true
            privacyTouched = true
            record.wantsPrivate = true
        }
        record.privacyIntentVersion = 1
        guard History.upsert(record) else {
            phase = .problem(title: "Couldn’t save on this phone", message: "Free some space and try again.")
            return
        }
        recordId = record.id
        phase = .saving
        saveTask = Task { [weak self] in
            await self?.save(with: client, link: link, recordId: record.id)
        }
    }

    /// Waits for the save request, so the extension can stay up for it after the sheet closes.
    func waitForSave() async {
        await saveTask?.value
        await privacyTask?.value
    }

    private func save(with client: ADHXClient, link: String, recordId: String) async {
        do {
            switch try await client.save(url: link, private: privacyTouched ? justForMe : nil, deferPublish: true, requestId: recordId) {
            case .saved(let r):
                landed(r, client: client)
            case .queued(let id):
                // Your ADHX has it and saves it in its own time; ask how it's
                // going while the sheet is open.
                queueId = id
                guard let intent = History.update(id: recordId, { $0.queue(id); $0.publishPending = true }) else {
                    phase = .problem(title: "Couldn’t remember that share", message: "It stays private. Free some space and try again.")
                    return
                }
                // A choice made before the POST answered is included here. The
                // server holds new saves private until this is acknowledged.
                privacyBusy = true
                defer { privacyBusy = false }
                try await client.queuedPrivacy(id: id, private: intent.wantsPrivate, intentVersion: intent.intentVersion)
                History.update(id: recordId) { $0.acknowledgePrivacy(version: intent.intentVersion, private: intent.wantsPrivate) }
                if !closeRequested { waitForServer(client: client, queueId: id) }
            }
        } catch APIError.offline, APIError.slow {
            // Once accepted, retry its acknowledgement rather than enqueueing
            // a second job. StatusRefresher keeps the original privacy intent.
            if queueId == nil {
                History.update(id: recordId) { $0.stage = .queued }
                OfflineQueue.add(id: recordId, link: link, isPrivate: privacyTouched ? justForMe : nil)
            }
            phase = .offline
        } catch APIError.badKey(let message) {
            Keychain.delete()
            History.update(id: recordId) { $0.fail(.badKey(message)) }
            phase = .notConnected
        } catch let error as APIError {
            History.update(id: recordId) { $0.fail(error) }
            failed(code: error.code, message: error.message)
        } catch {
            // Cancelled: the sheet went away.
        }
    }

    /// Saved: show it, and how its copy is coming along.
    private func landed(_ r: SaveResult, client: ADHXClient) {
        if let recordId { History.update(id: recordId) { $0.apply(r) } }
        result = r
        platform = r.platform
        let serverSays = r.isPrivate ?? false
        if privacyTouched && serverSays != justForMe {
            // Switched while it was saving: now the server has it, say so.
            sendPrivacy(justForMe, platform: r.platform, id: r.id)
        } else {
            justForMe = serverSays
        }
        if r.alreadySaved == true {
            phase = .alreadySaved
        } else {
            phase = .saved
            scheduleAutoClose()
        }
        startPolling(client: client, platform: r.platform, id: r.id)
    }

    private func failed(code: String?, message: String) {
        switch code {
        case "not_a_post", "no_link":
            phase = .notAPost
        case "unavailable":
            phase = .problem(title: "Can’t save this post", message: message)
        default:
            phase = .problem(title: "Couldn’t save this", message: message)
        }
    }

    /// The server took the link and is reading it; check every 1.5 s until it
    /// lands or gives up. Closing the sheet stops asking, not the save.
    private func waitForServer(client: ADHXClient, queueId: String) {
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            var failures = 0
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: Self.pollInterval)
                guard !Task.isCancelled else { return }
                do {
                    let progress = try await client.queuedSave(id: queueId)
                    guard let self else { return }
                    switch progress.state {
                    case "saved":
                        if let post = progress.post { self.landed(post, client: client) }
                        return
                    case "failed":
                        if let recordId = self.recordId { History.update(id: recordId) { $0.apply(progress) } }
                        let code = progress.code ?? "failed"
                        self.failed(code: code, message: progress.error ?? APIError.fallbackMessage(for: code))
                        return
                    default:
                        failures = 0
                    }
                } catch {
                    failures += 1
                    if failures >= 5 { return }
                }
            }
        }
    }

    private func startPolling(client: ADHXClient, platform: String, id: String) {
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            var failures = 0
            while !Task.isCancelled {
                do {
                    let status = try await client.status(platform: platform, id: id)
                    guard let self else { return }
                    self.keep = status
                    if let recordId = self.recordId {
                        History.update(id: recordId) { $0.apply(status) }
                    }
                    if KeepStatus.final.contains(status.status) { return }
                    failures = 0
                } catch {
                    failures += 1
                    if failures >= 3 { return }
                }
                try? await Task.sleep(nanoseconds: Self.pollInterval)
            }
        }
    }

    private func scheduleAutoClose() {
        guard !UIAccessibility.isVoiceOverRunning else { return }
        autoCloseTask?.cancel()
        autoCloseTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: Self.autoCloseDelay)
            guard let self, !Task.isCancelled, !self.touched, self.phase == .saved else { return }
            self.requestClose()
        }
    }

    // MARK: Just for me

    /// The switch on the card. Before the post has landed it's remembered (and
    /// sent with a waiting link); after, it goes to `/api/app/private`.
    func setJustForMe(_ on: Bool) {
        touch()
        guard on != justForMe, !privacyBusy else { return }
        let intent: ShareRecord?
        if let recordId {
            intent = History.update(id: recordId) { $0.choosePrivacy(on) }
            guard intent != nil else {
                privacyError = "Couldn’t remember that choice. Free some space and try again."
                return
            }
        } else { intent = nil }
        privacyTouched = true
        privacyError = nil
        justForMe = on
        if let queueId, let client, let recordId, let intent {
            privacyBusy = true
            privacyTask = Task { [weak self] in
                do {
                    try await client.queuedPrivacy(id: queueId, private: on, intentVersion: intent.intentVersion)
                    History.update(id: recordId) { $0.acknowledgePrivacy(version: intent.intentVersion, private: on) }
                } catch {
                    self?.privacyError = "Couldn’t change that. Try again."
                }
                self?.privacyBusy = false
            }
        } else if let r = result {
            sendPrivacy(on, platform: r.platform, id: r.id)
        } else if let recordId {
            OfflineQueue.setPrivate(id: recordId, on)
        }
    }

    private func sendPrivacy(_ on: Bool, platform: String, id: String) {
        guard let client else { return }
        privacyBusy = true
        Task { [weak self] in
            do {
                let now = try await client.setPrivate(platform: platform, id: id, private: on)
                guard let self else { return }
                self.justForMe = now
                if let recordId = self.recordId { History.update(id: recordId) { $0.isPrivate = now } }
            } catch {
                guard let self else { return }
                self.justForMe = !on
                self.privacyError = "Couldn’t change that. Try again."
            }
            self?.privacyBusy = false
        }
    }

    // MARK: Actions

    func touch() {
        guard !touched else { return }
        touched = true
        autoCloseTask?.cancel()
    }

    func requestClose() {
        guard !closeRequested else { return }
        closeRequested = true
        autoCloseTask?.cancel()
    }

    func openInADHX() {
        if let url = openURL { onOpen?(url) }
        requestClose()
    }

    /// The sheet has gone; stop polling and hand back to the system.
    func didClose() {
        pollTask?.cancel()
        autoCloseTask?.cancel()
        Task { [self] in
            await waitForSave()
            onFinish?()
        }
    }
}
