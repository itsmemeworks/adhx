import SwiftUI

/// Home: your saves, full screen. Search, Shared lately and Settings sit on top.
struct LibraryHome: View {
    @EnvironmentObject private var model: AppModel
    @StateObject private var library = LibraryModel()
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.openURL) private var openURL

    var body: some View {
        ZStack(alignment: .top) {
            if let server = model.server, !library.saves.isEmpty {
                PlayerView(posts: library.saves, server: server) { index in
                    library.loadMoreIfNeeded(at: index)
                }
            } else {
                nothingToPlay
            }
            topBar
        }
        .background(Theme.app.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .task {
            let app = model
            library.onBadKey = { [weak app] in app?.disconnect() }
            await library.reload()
        }
        .onAppear { model.startPolling() }
        .onDisappear { model.stopPolling() }
        .onChange(of: scenePhase) { _, phase in
            // New shares land in your saves; pick them up when you come back.
            if phase == .active { Task { await library.reload() } }
        }
    }

    private var topBar: some View {
        HStack(spacing: 8) {
            Wordmark(markSize: 28, textSize: 24)
            Spacer(minLength: 0)
            if let server = model.server {
                NavigationLink {
                    SearchView(library: library, server: server)
                } label: {
                    BarIcon(name: "magnifyingglass")
                }
                .accessibilityLabel("Search your saves")
            }
            NavigationLink {
                SharedLatelyView(library: library)
            } label: {
                BarIcon(name: "clock.arrow.circlepath")
            }
            .accessibilityLabel("Shared lately")
            NavigationLink {
                SettingsView()
            } label: {
                BarIcon(name: "gearshape")
            }
            .accessibilityLabel("Settings")
        }
        .padding(.horizontal, 16)
        .padding(.top, 6)
        .padding(.bottom, 24)
        .background(
            LinearGradient(colors: [.black.opacity(0.6), .clear], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea(edges: .top)
        )
    }

    @ViewBuilder
    private var nothingToPlay: some View {
        VStack(alignment: .leading, spacing: 18) {
            Spacer().frame(height: 70)
            ConnectionPill(host: Links.displayHost(model.server), state: model.connection)
            Text("My saves")
                .font(Theme.serif(40))
                .foregroundStyle(.white)
                .accessibilityAddTraits(.isHeader)
            if !library.loadedOnce {
                HStack { Spacer(); RingSpinner().frame(width: 34, height: 34); Spacer() }
                    .padding(.top, 30)
            } else if let error = library.loadError {
                Text(error)
                    .font(Theme.sans(15))
                    .foregroundStyle(Theme.muted)
                Button("Try again") { Task { await library.reload() } }
                    .buttonStyle(PillButtonStyle(kind: .outline, height: 44, fullWidth: false))
            } else {
                EmptyShares()
            }
            Spacer(minLength: 0)
            Button("Open my ADHX") {
                if let server = model.server { openURL(server) }
            }
            .buttonStyle(PillButtonStyle(kind: .primary))
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 12)
    }
}

private struct BarIcon: View {
    let name: String
    var body: some View {
        Image(systemName: name)
            .font(.system(size: 18, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: 44, height: 44)
            .background(Circle().fill(.black.opacity(0.45)))
    }
}
