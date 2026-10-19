import SwiftUI

struct RootView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ZStack {
            Theme.app.ignoresSafeArea()
            if model.isConnected {
                NavigationStack {
                    LibraryHome()
                }
                .transition(.opacity)
            } else {
                ConnectView()
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.25), value: model.isConnected)
        .tint(Theme.accent)
    }
}
