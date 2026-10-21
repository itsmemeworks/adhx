import BackgroundTasks
import SwiftUI

@main
struct ADHXShareApp: App {
    /// Says which way the phone may turn (OrientationGate).
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var model: AppModel
    @Environment(\.scenePhase) private var scenePhase

    init() {
        #if DEBUG
        DebugLaunch.connectIfAsked()
        #endif
        _model = StateObject(wrappedValue: AppModel())
        AlertCenter.shared.install()
        #if DEBUG
        DebugLaunch.tuneInIfAsked()
        DebugLaunch.turnIfAsked()
        #endif
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(model)
                .preferredColorScheme(.dark)
                .onOpenURL { url in model.handle(url: url) }
        }
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .active:
                model.reload()
                Task {
                    await model.checkConnection()
                    await model.refresh()
                }
                AlertCenter.shared.startPolling()
            case .background:
                BackgroundFlush.schedule()
                AlertCenter.shared.stopPolling()
                LiveAlertRefresh.schedule()
            default:
                break
            }
        }
        .backgroundTask(.appRefresh(BackgroundFlush.identifier)) {
            await Flusher.shared.flush()
            await StatusRefresher.refresh()
            if OfflineQueue.count > 0 { BackgroundFlush.schedule() }
        }
        .backgroundTask(.appRefresh(LiveAlertRefresh.identifier)) {
            await LiveAlertDelivery.check()
            LiveAlertRefresh.schedule()
        }
    }
}

/// A BGAppRefreshTask that sends waiting links (`$(ADHX_BUNDLE_PREFIX).flush`).
enum BackgroundFlush {
    static let identifier: String = {
        let ids = Bundle.main.object(forInfoDictionaryKey: "BGTaskSchedulerPermittedIdentifiers") as? [String]
        return ids?.first { $0.hasSuffix(".flush") } ?? ((Bundle.main.bundleIdentifier ?? "adhx") + ".flush")
    }()

    static func schedule() {
        guard OfflineQueue.count > 0 else { return }
        let request = BGAppRefreshTaskRequest(identifier: identifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        try? BGTaskScheduler.shared.submit(request)
    }
}

#if DEBUG
/// `-adhxSharePreview saved|private [-adhxSharePlatform twitter]`: the share
/// card's Saved state over a blurred post, without sharing anything (Debug
/// builds, to look at it).
struct DebugSharePreview: View {
    let isPrivate: Bool
    @State private var flow: ShareFlow?
    @State private var poster: URL?

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            CoverImage(url: poster)
                .blur(radius: 7)
                .brightness(-0.35)
                .ignoresSafeArea()
            if let flow { ShareSheetScreen(flow: flow) }
        }
        .task {
            guard let client = Store.client(),
                  let page = try? await client.feed(mode: .everyone, cursor: nil) else { return }
            let posts = page.items.filter { $0.posterUrl != nil }
            // `-adhxSharePlatform twitter`: a post from that network.
            let wanted = UserDefaults.standard.string(forKey: "adhxSharePlatform") ?? "instagram"
            guard let post = posts.first(where: { $0.platform == wanted }) ?? posts.first else { return }
            poster = ADHXClient.resolve(post.posterUrl, against: client.server)
            flow = .preview(post: post, server: client.server, private: isPrivate)
        }
    }
}

/// Simulator and UI runs: `-adhxServer http://127.0.0.1:3600 -adhxKey <phone key>
/// [-adhxUser pete]` connects without pairing. Debug builds only.
enum DebugLaunch {
    static func connectIfAsked() {
        let args = UserDefaults.standard
        guard let raw = args.string(forKey: "adhxServer"), let server = URL(string: raw),
              let key = args.string(forKey: "adhxKey"), !key.isEmpty else { return }
        if Store.server == server, Store.key == key { return }
        Store.connect(server: server, result: PairResult(key: key, name: "Simulator",
                                                         username: args.string(forKey: "adhxUser")))
    }

    /// `-adhxTuneIn <slug>`: what tapping a "… is live" notification does.
    /// `-adhxTurn landscape` (or `portrait`), after `-adhxTurnAfter` seconds
    /// (default 8): asks iOS to turn, as rotating the phone would. Only
    /// happens where OrientationGate lets it.
    @MainActor static func turnIfAsked() {
        guard let way = UserDefaults.standard.string(forKey: "adhxTurn") else { return }
        let after = max(UserDefaults.standard.double(forKey: "adhxTurnAfter"), 0) > 0
            ? UserDefaults.standard.double(forKey: "adhxTurnAfter") : 8
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: UInt64(after * 1_000_000_000))
            guard let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first else { return }
            scene.requestGeometryUpdate(.iOS(interfaceOrientations: way == "portrait" ? .portrait : .landscapeRight))
        }
    }

    @MainActor static func tuneInIfAsked() {
        guard let slug = UserDefaults.standard.string(forKey: "adhxTuneIn"), !slug.isEmpty else { return }
        AlertCenter.shared.tuneIn = LiveMoment(slug: slug, name: slug)
    }
}
#endif
