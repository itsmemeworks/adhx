import SwiftUI

struct RootView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            if let mode = Self.sharePreview, model.isConnected {
                sharePreview(mode)
            } else if model.isConnected {
                NavigationStack {
                    LibraryHome()
                }
                .transition(.opacity)
                .fullScreenCover(isPresented: $model.welcome) {
                    ConnectedView()
                }
            } else {
                ConnectView()
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.25), value: model.isConnected)
        .tint(Theme.accent)
    }

    /// Debug builds only: `-adhxSharePreview saved|private` shows the share card.
    private static var sharePreview: String? {
        #if DEBUG
        return UserDefaults.standard.string(forKey: "adhxSharePreview")
        #else
        return nil
        #endif
    }

    @ViewBuilder
    private func sharePreview(_ mode: String) -> some View {
        #if DEBUG
        DebugSharePreview(isPrivate: mode == "private")
        #endif
    }
}
