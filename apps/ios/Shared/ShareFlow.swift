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

    private(set) var server: URL?
    private var recordId: String?
    private var saveTask: Task<Void, Never>?
    private var pollTask: Task<Void, Never>?
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

    var openURL: URL? {
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

        let record = ShareRecord(link: link)
        History.upsert(record)
        recordId = record.id
        phase = .saving
        saveTask = Task { [weak self] in
            await self?.save(with: client, link: link, recordId: record.id)
        }
    }

    /// Waits for the save request, so the extension can stay up for it after the sheet closes.
    func waitForSave() async {
        await saveTask?.value
    }

    private func save(with client: ADHXClient, link: String, recordId: String) async {
        do {
            let r = try await client.save(url: link)
            History.update(id: recordId) { $0.apply(r) }
            result = r
            platform = r.platform
            if r.alreadySaved == true {
                phase = .alreadySaved
            } else {
                phase = .saved
                scheduleAutoClose()
            }
            startPolling(client: client, platform: r.platform, id: r.id)
        } catch APIError.offline {
            History.update(id: recordId) { $0.stage = .queued }
            OfflineQueue.add(id: recordId, link: link)
            phase = .offline
        } catch APIError.badKey(let message) {
            Keychain.delete()
            History.update(id: recordId) { $0.fail(.badKey(message)) }
            phase = .notConnected
        } catch let error as APIError {
            History.update(id: recordId) { $0.fail(error) }
            switch error.code {
            case "not_a_post", "no_link":
                phase = .notAPost
            case "unavailable":
                phase = .problem(title: "Can’t save this post", message: error.message)
            default:
                phase = .problem(title: "Couldn’t save this", message: error.message)
            }
        } catch {
            // Cancelled: the sheet went away.
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
        onFinish?()
    }
}
