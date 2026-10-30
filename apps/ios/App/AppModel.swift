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
    /// Just paired: "Connected to …" shows once over Home.
    @Published var welcome = false
    /// Remove this phone is asking the server to drop the key.
    @Published private(set) var removing = false
    /// Shown on Connect after Remove this phone couldn't reach the server.
    @Published var removedNote: String?

    private var pollTask: Task<Void, Never>?

    init() {
        #if DEBUG
        welcome = UserDefaults.standard.bool(forKey: "adhxWelcome")
        #endif
    }

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
            await connected(server: server, result: result)
        } catch APIError.offline, APIError.slow {
            pairError = "Can’t reach \(Links.displayHost(server)). Check the address and that your ADHX is on."
        } catch let error as APIError {
            pairError = error.message
        } catch {
            pairError = "That didn’t work. Try again."
        }
    }

    /// Stores the key (pairing and email sign-in alike) and says hello.
    private func connected(server: URL, result: PairResult) async {
        PostReactionsModel.forget()
        PostPeopleModel.forget()
        Store.connect(server: server, result: result)
        removedNote = nil
        YourFace.shared.reload()
        welcome = true
        connection = .connected
        reload()
        await checkConnection(quietly: true)
        await refresh()
    }

    // MARK: Signing in with an emailed code

    /// Asks your ADHX to email a 6-digit code. It always says yes (it never
    /// says whether there's an account), so errors here are about reaching it.
    func requestCode(server: URL, email: String) async -> Bool {
        pairing = true
        pairError = nil
        defer { pairing = false }
        do {
            try await ADHXClient(server: server, key: nil).requestSignInCode(email: email)
            Store.lastServer = Links.displayHost(server)
            return true
        } catch let error as APIError where error.isMissing {
            pairError = "This ADHX can’t sign in by email yet. Use the code from Settings → Phone app instead."
        } catch APIError.offline, APIError.slow {
            pairError = "Can’t reach \(Links.displayHost(server)). Check the address and that your ADHX is on."
        } catch let error as APIError {
            pairError = SignInWords.message(for: error)
        } catch {
            pairError = "That didn’t work. Try again."
        }
        return false
    }

    /// The code from the email: connects this phone like pairing does.
    func verifyCode(server: URL, email: String, code: String) async {
        guard SignInWords.code(code).count == 6 else {
            pairError = "The code is 6 numbers."
            return
        }
        pairing = true
        pairError = nil
        defer { pairing = false }
        do {
            let client = ADHXClient(server: server, key: nil)
            let result = try await client.verifySignIn(email: email, code: code, name: UIDevice.current.model)
            await connected(server: server, result: result)
        } catch APIError.offline, APIError.slow {
            pairError = "Can’t reach \(Links.displayHost(server)). Check the address and that your ADHX is on."
        } catch let error as APIError {
            pairError = SignInWords.message(for: error)
        } catch {
            pairError = "That didn’t work. Try again."
        }
    }

    /// Plays one of your saves over whatever is showing ("Open in ADHX" on
    /// the share card, a post picked from Why).
    func open(_ post: PostRef) {
        guard isConnected, let server else { return }
        OpenPostPresenter.present(post, server: server, model: self)
    }

    /// `adhx://pair?server=…&code=…` from the system camera or a scanned code.
    func handle(url: URL) {
        if let post = Links.postRef(from: url) {
            open(post)
            return
        }
        guard let (server, code) = Links.pairing(from: url) else { return }
        Task { await pair(server: server, code: code) }
    }

    // MARK: Connection

    /// Checks the key still works; on 401 bad_key goes back to Connect.
    /// `quietly` keeps showing the current state until there's an answer.
    func checkConnection(quietly: Bool = false) async {
        guard let captured = Store.captureConnection() else {
            reload()
            return
        }
        let client = captured.client
        if !quietly { connection = .checking }
        do {
            let me = try await client.me()
            guard captured.isCurrent else { return }
            if let phone = me.name { Store.phoneName = phone }
            YourFace.shared.update(me)
            connection = .connected
            reload()
        } catch APIError.badKey {
            Store.ifCurrent(captured.id) { disconnect() }
        } catch {
            guard captured.isCurrent else { return }
            connection = .unreachable
        }
    }

    /// Sends waiting links, then refreshes kept-copy statuses.
    func refresh() async {
        guard let captured = Store.captureConnection() else { return }
        let outcome = await Flusher.shared.flush()
        guard captured.isCurrent else { return }
        if case .badKey = outcome {
            Store.ifCurrent(captured.id) { disconnect() }
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
            var tick = 0
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 3_000_000_000)
                guard let self, !Task.isCancelled else { return }
                // Can't reach it: look again every few seconds, so it says
                // connected once the phone or the server is back.
                tick += 1
                if self.connection == .unreachable, tick % 3 == 0 {
                    await self.checkConnection(quietly: true)
                }
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

    /// Remove this phone: asks the server to revoke this key, then forgets
    /// it here whatever the answer. A 401 means the server had already
    /// dropped it. When the server can't be reached, it says so plainly: the
    /// phone may still be listed on the web.
    func removeThisPhone() async {
        guard !removing else { return }
        guard let captured = Store.captureConnection() else { return }
        let host = server.map(Links.displayHost)
        removing = true
        defer { removing = false }
        var reached = true
        let client = captured.client
        do {
            try await client.removeThisPhone()
        } catch APIError.badKey {
            // Already removed on the server.
        } catch {
            // Offline, slow, or an older ADHX without this: still forget it here.
            reached = false
        }
        guard captured.isCurrent else { return }
        removedNote = reached ? nil : Self.couldNotReach(host)
        Store.ifCurrent(captured.id) { disconnect() }
    }

    static func couldNotReach(_ host: String?) -> String {
        let place = host ?? "your ADHX"
        return "This phone forgot its key, but it couldn’t reach \(place). It may still show in Settings → Phone app there; remove it there too."
    }

    func disconnect() {
        PostReactionsModel.forget()
        PostPeopleModel.forget()
        Store.disconnect()
        LiveAlertDelivery.forget()
        AuthImageLoader.shared.clear()
        YourFace.shared.reload()
        connection = .checking
        reload()
    }

}
