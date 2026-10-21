import BackgroundTasks
import SwiftUI
import UserNotifications

/// "Tell me when it's live" (board j7-3): a forming group you rang the bell
/// on went live. Your ADHX holds one alert per subscriber
/// (`GET /api/app/alerts`); the phone shows each as a local notification, from
/// a poll while the app is open and from a background refresh, then marks
/// them seen. Tapping one tunes in to that moment.
@MainActor
final class AlertCenter: NSObject, ObservableObject, UNUserNotificationCenterDelegate {
    static let shared = AlertCenter()

    /// A moment to tune in to, from a tapped notification. Home picks it up.
    @Published var tuneIn: LiveMoment?

    private var pollTask: Task<Void, Never>?

    /// Before the app finishes launching, so a tap that launched it lands here.
    func install() {
        UNUserNotificationCenter.current().delegate = self
    }

    /// On the first bell tap: asks to show notifications. True when allowed.
    @discardableResult
    func askPermission() async -> Bool {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        switch settings.authorizationStatus {
        case .notDetermined:
            return (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        case .authorized, .provisional, .ephemeral:
            return true
        default:
            return false
        }
    }

    /// Looks every 60 s while the app is open (the web's toast cadence).
    func startPolling() {
        pollTask?.cancel()
        pollTask = Task {
            while !Task.isCancelled {
                if await LiveAlertDelivery.check() == .missing { return }
                try? await Task.sleep(nanoseconds: 60_000_000_000)
            }
        }
    }

    func stopPolling() {
        pollTask?.cancel()
        pollTask = nil
    }

    // MARK: UNUserNotificationCenterDelegate

    /// While the app is open it still shows, as a banner.
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter,
                                            willPresent notification: UNNotification,
                                            withCompletionHandler completionHandler:
                                            @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .list, .sound])
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter,
                                            didReceive response: UNNotificationResponse,
                                            withCompletionHandler completionHandler: @escaping () -> Void) {
        let info = response.notification.request.content.userInfo
        if let slug = info[LiveAlertDelivery.slugKey] as? String, !slug.isEmpty {
            let title = info[LiveAlertDelivery.titleKey] as? String ?? slug
            Task { @MainActor in
                AlertCenter.shared.tuneIn = LiveMoment(slug: slug, name: title)
            }
        }
        completionHandler()
    }
}

/// Fetching alerts, showing them and marking them seen. Safe off the main
/// actor (the background refresh runs it).
enum LiveAlertDelivery {
    static let slugKey = "adhxLiveSlug"
    static let titleKey = "adhxLiveTitle"
    private static let ledgerKey = "liveAlertsTold"
    private static let watchKey = "liveAlertsWatchUntil"

    enum Outcome: Equatable { case shown(Int), nothing, missing, failed }

    /// Shows what went live since the last look, then tells your ADHX.
    @discardableResult
    static func check() async -> Outcome {
        guard let client = Store.client() else { return .nothing }
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        // Not allowed to show them: leave them unseen rather than lose them.
        guard [.authorized, .provisional, .ephemeral].contains(settings.authorizationStatus) else { return .nothing }
        let alerts: [LiveAlert]
        do {
            alerts = try await client.liveAlerts()
        } catch let error as APIError where error.isMissing {
            return .missing
        } catch {
            return .failed
        }
        guard !alerts.isEmpty else { return .nothing }
        var ledger = AlertLedger(told: UserDefaults.standard.stringArray(forKey: ledgerKey) ?? [])
        let fresh = ledger.untold(alerts)
        for alert in fresh {
            let content = UNMutableNotificationContent()
            content.title = alert.headline
            content.body = "Tune in"
            content.sound = .default
            content.threadIdentifier = "live"
            content.userInfo = [slugKey: alert.slug, titleKey: alert.title]
            let request = UNNotificationRequest(identifier: "adhx.live.\(alert.id)", content: content, trigger: nil)
            try? await UNUserNotificationCenter.current().add(request)
        }
        ledger.remember(fresh)
        UserDefaults.standard.set(ledger.told, forKey: ledgerKey)
        // Seen once shown (or shown before and not yet marked).
        try? await client.markAlertsSeen(alerts.map(\.id))
        return fresh.isEmpty ? .nothing : .shown(fresh.count)
    }

    /// A bell is on: keep looking in the background for a couple of days
    /// (a group forms within a day, and an alert waits 24 h).
    static func watch() {
        UserDefaults.standard.set(Date().addingTimeInterval(48 * 3600).timeIntervalSince1970, forKey: watchKey)
    }

    static var watching: Bool {
        UserDefaults.standard.double(forKey: watchKey) > Date().timeIntervalSince1970
    }

    static func forget() {
        UserDefaults.standard.removeObject(forKey: ledgerKey)
        UserDefaults.standard.removeObject(forKey: watchKey)
    }
}

/// The BGAppRefreshTask that looks for alerts (`$(ADHX_BUNDLE_PREFIX).alerts`).
enum LiveAlertRefresh {
    static let identifier: String = {
        let ids = Bundle.main.object(forInfoDictionaryKey: "BGTaskSchedulerPermittedIdentifiers") as? [String]
        return ids?.first { $0.hasSuffix(".alerts") } ?? ((Bundle.main.bundleIdentifier ?? "adhx") + ".alerts")
    }()

    static func schedule() {
        guard LiveAlertDelivery.watching, Store.isConnected else { return }
        let request = BGAppRefreshTaskRequest(identifier: identifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        try? BGTaskScheduler.shared.submit(request)
    }
}
