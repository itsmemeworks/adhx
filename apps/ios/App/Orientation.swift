import SwiftUI
import UIKit

/// Landscape is only for watching: the app turns sideways while a player is
/// the top screen, and stays upright everywhere else. Each player says "I can
/// turn" while it's showing; anything over it (a sheet, a friend's channel,
/// the React picker) says "upright" while it's up. The newest say wins.
@MainActor
enum OrientationGate {
    private static var says: [(id: UUID, landscape: Bool)] = []

    static func push(_ id: UUID, landscape: Bool) {
        says.removeAll { $0.id == id }
        says.append((id, landscape))
        update()
    }

    static func pop(_ id: UUID) {
        guard says.contains(where: { $0.id == id }) else { return }
        says.removeAll { $0.id == id }
        update()
    }

    static var allowed: UIInterfaceOrientationMask {
        says.last?.landscape == true ? .allButUpsideDown : .portrait
    }

    /// Asks iOS to look again, and turns back upright when it may no longer turn.
    private static func update() {
        guard let scene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first(where: { $0.activationState == .foregroundActive }) else { return }
        var top = scene.windows.first(where: \.isKeyWindow)?.rootViewController
        while let next = top?.presentedViewController { top = next }
        top?.setNeedsUpdateOfSupportedInterfaceOrientations()
        if allowed == .portrait, scene.interfaceOrientation.isLandscape {
            scene.requestGeometryUpdate(.iOS(interfaceOrientations: .portrait))
        }
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     supportedInterfaceOrientationsFor window: UIWindow?) -> UIInterfaceOrientationMask {
        MainActor.assumeIsolated { OrientationGate.allowed }
    }
}

private struct OrientationSay: ViewModifier {
    let landscape: Bool
    let active: Bool
    @State private var id = UUID()

    func body(content: Content) -> some View {
        content
            .onAppear { if active { OrientationGate.push(id, landscape: landscape) } }
            .onDisappear { OrientationGate.pop(id) }
            .onChange(of: active) { _, now in
                if now { OrientationGate.push(id, landscape: landscape) } else { OrientationGate.pop(id) }
            }
    }
}

extension View {
    /// A player on screen: the phone may turn sideways to watch.
    func mayTurnToWatch() -> some View { modifier(OrientationSay(landscape: true, active: true)) }

    /// Something over the player (while `active`): upright only.
    func uprightWhile(_ active: Bool) -> some View { modifier(OrientationSay(landscape: false, active: active)) }
}
