import SwiftUI
import UIKit

/// The host app's state: connected or not, the Shared lately list, waiting links.
@MainActor
final class AppModel: ObservableObject {
    enum Connection { case checking, connected, unreachable }

    @Published private(set) var isConnected = Store.isConnected
    @Published private(set) var server: URL? = Store.server
    @Published private(set) var username: String? = Store.username
    @Published private(set) var records: [ShareRecord] = History.all()
    @Published private(set) var waiting = OfflineQueue.count
    @Published private(set) var connection: Connection = .checking

    @Published private(set) var pairing = false
    @Published var pairError: String?
    @Published private(set) var sending = false

    private var pollTask: Task<Void, Never>?

    /// Re-reads what the Share Extension may have written.
    func reload() {
        isConnected = Store.isConnected
        server = Store.server
        username = Store.username
        records = History.all()
        waiting = OfflineQueue.count
    }

    // MARK: Pairing

    func pair(server: URL, code rawCode: String) async {
        let code = Links.normalizedCode(rawCode)
        guard code.count == 8 else {
            pairError = "The code is 8 letters and numbers, like ABCD-EFGH."
            return
        }
        pairing = true
        pairError = nil
        defer { pairing = false }
        do {
            let client = ADHXClient(server: server, key: nil)
            let result = try await client.pair(code: code, name: UIDevice.current.model)
            Store.connect(server: server, result: result)
            connection = .connected
            reload()
            await refresh()
        } catch APIError.offline {
            pairError = "Can’t reach \(Links.displayHost(server)). Check the address and that your ADHX is on."
        } catch let error as APIError {
            pairError = error.message
        } catch {
            pairError = "That didn’t work. Try again."
        }
    }

    /// `adhx://pair?server=…&code=…` from the system camera or a scanned code.
    func handle(url: URL) {
        guard let (server, code) = Links.pairing(from: url) else { return }
        Task { await pair(server: server, code: code) }
    }

    // MARK: Connection

    /// Checks the key still works; on 401 bad_key goes back to Connect.
    func checkConnection() async {
        guard let client = Store.client() else {
            reload()
            return
        }
        connection = .checking
        do {
            let me = try await client.me()
            if let name = me.username { Store.username = name }
            if let phone = me.name { Store.phoneName = phone }
            connection = .connected
            reload()
        } catch APIError.badKey {
            disconnect()
        } catch {
            connection = .unreachable
        }
    }

    /// Sends waiting links, then refreshes kept-copy statuses.
    func refresh() async {
        guard Store.isConnected else { return }
        let outcome = await Flusher.shared.flush()
        if case .badKey = outcome {
            disconnect()
            return
        }
        reload()
        await StatusRefresher.refresh()
        reload()
    }

    func sendWaitingNow() async {
        sending = true
        defer { sending = false }
        await refresh()
    }

    /// Polls statuses while something is still being kept and the app is open.
    func startPolling() {
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 3_000_000_000)
                guard let self, !Task.isCancelled else { return }
                self.reload()
                let busy = self.records.contains { $0.needsStatus || $0.stage == .saving }
                if busy || self.waiting > 0 { await self.refresh() }
            }
        }
    }

    func stopPolling() {
        pollTask?.cancel()
        pollTask = nil
    }

    func disconnect() {
        Store.disconnect()
        connection = .checking
        reload()
    }

    func openURL(for record: ShareRecord) -> URL? {
        guard let server else { return nil }
        return ADHXClient.resolve(record.openPath, against: server)
    }
}
