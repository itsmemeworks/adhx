import BackgroundTasks
import SwiftUI

@main
struct ADHXShareApp: App {
    @StateObject private var model = AppModel()
    @Environment(\.scenePhase) private var scenePhase

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
            case .background:
                BackgroundFlush.schedule()
            default:
                break
            }
        }
        .backgroundTask(.appRefresh(BackgroundFlush.identifier)) {
            await Flusher.shared.flush()
            await StatusRefresher.refresh()
            if OfflineQueue.count > 0 { BackgroundFlush.schedule() }
        }
    }
}

/// A BGAppRefreshTask that sends waiting links (`$(ADHX_BUNDLE_PREFIX).flush`).
enum BackgroundFlush {
    static let identifier: String = {
        let ids = Bundle.main.object(forInfoDictionaryKey: "BGTaskSchedulerPermittedIdentifiers") as? [String]
        return ids?.first ?? ((Bundle.main.bundleIdentifier ?? "adhx") + ".flush")
    }()

    static func schedule() {
        guard OfflineQueue.count > 0 else { return }
        let request = BGAppRefreshTaskRequest(identifier: identifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        try? BGTaskScheduler.shared.submit(request)
    }
}
