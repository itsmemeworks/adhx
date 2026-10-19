import SwiftUI

/// Home: your saves, full screen. Search, Shared lately and Settings sit on top.
struct LibraryHome: View {
    @EnvironmentObject private var model: AppModel
    @StateObject private var library = LibraryModel()
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.openURL) private var openURL
    @State private var clean = false
    @State private var scrubbing = false
    @State private var jumpTo: String?
    @State private var onFirst = true
    /// A post opened from "Open in ADHX" on the share card.
    @State private var opened: OpenedPost?

    var body: some View {
        ZStack(alignment: .top) {
            if let server = model.server, !library.saves.isEmpty {
                PlayerView(posts: library.saves, server: server, clean: $clean, scrubbing: $scrubbing,
                           jumpTo: $jumpTo) { index in
                    library.loadMoreIfNeeded(at: index)
                    onFirst = index == 0
                    if index < library.newAtTop { library.newAtTop = 0 }
                }
            } else {
                nothingToPlay
            }
            if !clean && !scrubbing {
                topBar
                if library.newAtTop > 0 && !onFirst {
                    Button {
                        jumpTo = library.saves.first?.key
                        library.newAtTop = 0
                    } label: {
                        Label(library.newAtTop == 1 ? "1 new save" : "\(library.newAtTop) new saves",
                              systemImage: "arrow.up")
                            .font(Theme.sans(14, .heavy))
                            .foregroundStyle(.black)
                            .padding(.horizontal, 16)
                            .frame(minHeight: 40)
                            .background(Capsule().fill(Theme.accent))
                    }
                    .padding(.top, 64)
                    .transition(.opacity)
                } else if library.preparing > 0 && !library.saves.isEmpty {
                    PreparingPill(count: library.preparing)
                        .padding(.top, 64)
                        .transition(.opacity.combined(with: .move(edge: .top)))
                }
            }
        }
        .animation(.easeInOut(duration: 0.3), value: library.preparing)
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
        // Saves on their way: look again every 15 s until they've landed.
        .task(id: library.preparing > 0) {
            while library.preparing > 0, !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 15_000_000_000)
                guard !Task.isCancelled else { return }
                await library.reload()
            }
        }
        .onChange(of: model.openPost, initial: true) { _, ref in
            guard let ref else { return }
            model.openPost = nil
            Task {
                if let post = await library.post(platform: ref.platform, id: ref.id) {
                    opened = OpenedPost(post: post)
                }
            }
        }
        .fullScreenCover(item: $opened) { item in
            if let server = model.server {
                PlayerScreen(posts: [item.post], server: server, start: item.post.key)
            }
        }
    }

    private var topBar: some View {
        HStack(spacing: 8) {
            Wordmark(markSize: 28, textSize: 24)
            Spacer(minLength: 0)
            NavigationLink {
                SharedLatelyView(library: library)
            } label: {
                BarIcon(name: "clock.arrow.circlepath")
            }
            .accessibilityLabel("Shared lately")
            if let server = model.server {
                NavigationLink {
                    SearchView(library: library, server: server)
                } label: {
                    BarIcon(name: "magnifyingglass")
                }
                .accessibilityLabel("Search your saves")
            }
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
            } else if library.preparing > 0 {
                HStack {
                    Spacer()
                    PreparingCard(compact: true)
                    Spacer()
                }
                .padding(.top, 20)
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

/// A post to show on its own in the player.
private struct OpenedPost: Identifiable {
    let post: PhonePost
    var id: String { post.key }
}
