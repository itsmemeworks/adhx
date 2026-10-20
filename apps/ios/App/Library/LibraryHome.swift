import SwiftUI
import UIKit

/// The three parts of Home, in the row under the top bar.
enum HomeTab: String, CaseIterable, Identifiable {
    case new, channels, live
    var id: String { rawValue }
    var title: String {
        switch self {
        case .new: return "New"
        case .channels: return "Channels"
        case .live: return "Live"
        }
    }
}

/// Home: New (the friends feed, full screen), Channels and Live, under a top
/// bar with Shared lately, Search and Settings. On a server without the feed
/// yet, New plays your saves as before.
struct LibraryHome: View {
    @EnvironmentObject private var model: AppModel
    @StateObject private var library = LibraryModel()
    @StateObject private var feed = FeedModel()
    @StateObject private var channels = ChannelsModel()
    @StateObject private var live = LiveModel()
    @StateObject private var doing = DoingModel()
    /// A tapped "… is live" notification.
    @ObservedObject private var alerts = AlertCenter.shared
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.openURL) private var openURL
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var tab: HomeTab = .new
    @State private var clean = false
    @State private var scrubbing = false
    @State private var jumpTo: String?
    @State private var onFirst = true
    /// A post opened from "Open in ADHX" on the share card.
    @State private var opened: OpenedPost?
    /// The post whose "Why this one" sheet is up.
    @State private var why: PhonePost?
    /// "What's in your feed" is up.
    @State private var filtering = false
    /// The top bar and tabs, measured, so what's under them starts below.
    @State private var headerHeight: CGFloat = 112
    /// Home is the screen on top (not under Settings or Search).
    @State private var onScreen = false
    /// The "On their way" sheet is up.
    @State private var showingDoing = false
    /// Everything your ADHX is doing, pushed from that sheet.
    @State private var seeAllDoing = false

    /// The player is showing, so its "On their way" pill asks every 5 s.
    private var watchingDoing: Bool { onScreen && scenePhase == .active && tab == .new }

    /// The player has its send sheet up.
    @State private var playerSheet = false

    /// The player's own buttons are hidden (Hide, or dragging through a video),
    /// or its sheet is over everything.
    private var playerChromeHidden: Bool { tab == .new && (clean || scrubbing || playerSheet) }

    var body: some View {
        ZStack(alignment: .top) {
            Group {
                switch tab {
                case .new:
                    newTab
                case .channels:
                    if let server = model.server {
                        ChannelsView(model: channels, server: server)
                            .safeAreaPadding(.top, headerHeight)
                    }
                case .live:
                    if let server = model.server {
                        LiveView(model: live, server: server)
                            .safeAreaPadding(.top, headerHeight)
                    }
                }
            }
            .transition(.opacity)
            .onPreferenceChange(PlayerSheetUp.self) { up in playerSheet = up }
            if !playerChromeHidden {
                header
                if tab == .new { newPills.padding(.top, headerHeight + 6) }
            }
        }
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.3), value: library.preparing)
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.3), value: doing.onTheirWay)
        .background(Theme.app.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .task {
            let app = model
            let badKey: () -> Void = { [weak app] in app?.disconnect() }
            library.onBadKey = badKey
            feed.onBadKey = badKey
            channels.onBadKey = badKey
            live.onBadKey = badKey
            doing.onBadKey = badKey
            async let saves: Void = library.reload()
            async let blend: Void = feed.reload()
            async let rows: Void = channels.reload()
            async let moments: Void = live.reload()
            _ = await (saves, blend, rows, moments)
            await feed.loadTypes()
        }
        .onAppear {
            onScreen = true
            model.startPolling()
        }
        .onDisappear {
            onScreen = false
            model.stopPolling()
            feed.pause()
        }
        .onChange(of: watchingDoing, initial: true) { _, watching in
            if watching { doing.watch("player") } else { doing.unwatch("player") }
        }
        .onChange(of: tab) { old, new in
            if old == .new { feed.pause() }
            if old == .channels { channels.openFriend = nil }
            if new == .channels { Task { await channels.reload() } }
            if new == .live { Task { await live.reload() } }
            clean = false
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                // New shares land in your saves; pick them up when you come back.
                Task { await library.reload() }
                if feed.items.isEmpty || feed.loadError != nil { Task { await feed.reload() } }
            } else {
                Task { await feed.flushSeen() }
            }
        }
        // Saves on their way: look again every 15 s until they've landed.
        .task(id: library.preparing > 0) {
            while library.preparing > 0, !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 15_000_000_000)
                guard !Task.isCancelled else { return }
                await library.reload()
            }
        }
        .onChange(of: alerts.tuneIn, initial: true) { _, moment in
            guard let moment else { return }
            alerts.tuneIn = nil
            opened = nil
            why = nil
            live.tuneIn = moment
            switchTab(.live)
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
        .boardSheet(item: $why, height: 600) { post in
            if let server = model.server {
                WhySheet(post: post, server: server, mode: feed.mode, choose: { mode in
                    Task { await feed.setMode(mode) }
                }, filter: { filtering = true },
                   weights: feed.weights, weighing: feed.weighing, weightError: feed.weightError,
                   setWeight: { username, weight in Task { await feed.setWeight(username, weight) } },
                   openPost: { ref in model.openPost = ref })
                .task { await feed.loadWeights() }
            }
        }
        .boardSheet(isPresented: $showingDoing, height: 540) {
            if let server = model.server {
                OnTheirWaySheet(doing: doing, server: server) {
                    showingDoing = false
                    seeAllDoing = true
                }
            }
        }
        .boardSheet(isPresented: $filtering, height: 590) {
            FeedFilterSheet(types: feed.types, mode: feed.mode, newCount: newBadge, hidden: feed.hidden,
                            setTypes: { types in Task { await feed.setTypes(types) } },
                            choose: { mode in Task { await feed.setMode(mode) } })
        }
        .navigationDestination(isPresented: $seeAllDoing) {
            if let server = model.server {
                DoingScreen(doing: doing, server: server)
            }
        }
    }

    // MARK: New

    @ViewBuilder
    private var newTab: some View {
        if let server = model.server {
            if feed.unsupported {
                savesPlayer(server)
            } else if !feed.loadedOnce {
                HStack { Spacer(); RingSpinner(size: 34, lineWidth: 3); Spacer() }
                    .frame(maxHeight: .infinity)
            } else if let error = feed.loadError, feed.items.isEmpty {
                EmptyNote(title: "Can’t load New", message: error) { Task { await feed.reload() } }
                    .padding(.top, headerHeight)
                    .frame(maxHeight: .infinity, alignment: .top)
            } else if feed.items.isEmpty && feed.mode != .new && feed.mode != .everyone {
                VStack(alignment: .leading, spacing: 0) {
                    EmptyNote(title: "Nothing here yet",
                              message: feed.mode == .mine ? "Share something from another app and it lands here."
                                  : "Your people haven’t saved anything yet. Give them a nudge.")
                    Button("Back to New") { Task { await feed.setMode(.new) } }
                        .buttonStyle(PillButtonStyle(kind: .outline, height: 44, fullWidth: false))
                        .padding(.horizontal, 20)
                        .padding(.top, 14)
                }
                .padding(.top, headerHeight)
                .frame(maxHeight: .infinity, alignment: .top)
            } else if feed.items.isEmpty && feed.nothingYet {
                // Nobody has saved anything new yet: not "all caught up".
                EmptyNote(title: "Nothing new yet.", message: "Save something for your people to find.")
                    .padding(.top, headerHeight)
                    .frame(maxHeight: .infinity, alignment: .top)
            } else if feed.items.isEmpty {
                caughtUp(server, topInset: headerHeight + 40)
            } else {
                PlayerView(posts: feed.items, server: server, clean: $clean, scrubbing: $scrubbing,
                           start: feed.currentKey,
                           extras: PlayerExtras(onWhy: { why = $0 }, toastTop: headerHeight + 44,
                                                endPage: feed.atEnd ? AnyView(caughtUp(server, topInset: endPageTop)) : nil)) { index in
                    feed.shown(index)
                }
            }
        }
    }

    private func caughtUp(_ server: URL, topInset: CGFloat) -> some View {
        CaughtUpView(people: feed.sessionPeople, watched: feed.items.count, server: server,
                     browseChannels: { switchTab(.channels) },
                     seeLive: { switchTab(.live) },
                     watchAgain: { Task { await feed.setMode(.everyone) } },
                     topInset: topInset,
                     hidden: feed.hidden,
                     showHidden: { Task { await feed.setTypes(feed.types.union(feed.hidden.keys)) } },
                     covers: feed.items.compactMap { ADHXClient.resolve($0.posterUrl, against: server) })
    }

    /// The end page is full screen (under the status bar), so it clears that too.
    private var endPageTop: CGFloat {
        let window = UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first
        return headerHeight + (window?.safeAreaInsets.top ?? 59) + 40
    }

    private func switchTab(_ to: HomeTab) {
        withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.2)) { tab = to }
    }

    /// Under the bar on New: saves on their way (and, without the feed, new saves).
    @ViewBuilder
    private var newPills: some View {
        if feed.unsupported {
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
                .transition(.opacity)
            } else if !library.saves.isEmpty {
                onTheirWay
            }
        } else if !feed.items.isEmpty && feed.currentIndex < feed.items.count {
            // Not over "You're all caught up": its Gob sits there.
            onTheirWay
        }
    }

    /// Posts being kept and learned (`/api/app/doing`), opening the sheet; on
    /// an older server, the saves still on their way.
    @ViewBuilder
    private var onTheirWay: some View {
        if !doing.unsupported {
            if doing.onTheirWay > 0 {
                Button {
                    showingDoing = true
                } label: {
                    OnTheirWayPill(moving: doing.moving, needsYou: doing.needsYou)
                }
                .buttonStyle(.plain)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        } else if library.preparing > 0 {
            PreparingPill(count: library.preparing)
                .transition(.opacity.combined(with: .move(edge: .top)))
        }
    }

    /// The New tab's badge: unseen posts left ("99+" past that; "20+" while
    /// more pages are still to come). Nil outside New's own mode.
    private var newBadge: String? {
        guard !feed.unsupported, feed.mode == .new, feed.currentIndex < feed.items.count else { return nil }
        let left = feed.items.count - feed.currentIndex
        guard left > 0 else { return nil }
        if left > 99 { return "99+" }
        return feed.atEnd ? "\(left)" : "\(left)+"
    }

    /// The old Home: your saves, for a server without the feed.
    @ViewBuilder
    private func savesPlayer(_ server: URL) -> some View {
        if !library.saves.isEmpty {
            PlayerView(posts: library.saves, server: server, clean: $clean, scrubbing: $scrubbing,
                       jumpTo: $jumpTo, extras: PlayerExtras(toastTop: headerHeight + 44)) { index in
                library.loadMoreIfNeeded(at: index)
                onFirst = index == 0
                if index < library.newAtTop { library.newAtTop = 0 }
            }
        } else {
            nothingToPlay
        }
    }

    // MARK: Top

    /// One row: Gob (Settings), the tabs, Search.
    private var header: some View {
        topBar
        .padding(.top, 4)
        .background {
            GeometryReader { box in
                Color.clear.preference(key: HeaderHeight.self, value: box.size.height)
            }
        }
        .onPreferenceChange(HeaderHeight.self) { height in
            if abs(height - headerHeight) > 0.5 { headerHeight = height }
        }
        .padding(.bottom, tab == .new ? 24 : 10)
        .background(
            Group {
                if tab == .new {
                    // The post under it brings its own scrim (240 pt, like the boards).
                    Color.clear
                } else {
                    Theme.app
                }
            }
            .ignoresSafeArea(edges: .top)
            .allowsHitTesting(false)
        )
    }

    private var topBar: some View {
        HStack(spacing: 10) {
            NavigationLink {
                SettingsView(library: library, feed: feed, doing: doing)
            } label: {
                Gob(size: 30)
                    .frame(width: 30, height: 44)
                    .padding(.horizontal, 7)
                    .contentShape(Rectangle())
                    .padding(.horizontal, -7)
            }
            .accessibilityLabel("Settings")
            Spacer(minLength: 0)
            TabPills(tab: $tab, liveDot: live.anyLive, newBadge: newBadge,
                     overMedia: tab == .new && !feed.items.isEmpty) { item in
                // The New tab again: what's in your feed.
                if item == .new && tab == .new && !feed.unsupported {
                    filtering = true
                } else if item == .channels && tab == .channels {
                    // Back from a friend's channel to the list.
                    withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.2)) { channels.openFriend = nil }
                } else {
                    switchTab(item)
                }
            }
                .layoutPriority(1)
            Spacer(minLength: 0)
            if let server = model.server {
                NavigationLink {
                    SearchView(library: library, server: server)
                } label: {
                    BarIcon(name: "magnifyingglass")
                }
                .accessibilityLabel("Search everyone’s saves")
            }
        }
        .padding(.horizontal, 16)
    }

    @ViewBuilder
    private var nothingToPlay: some View {
        VStack(alignment: .leading, spacing: 18) {
            Spacer().frame(height: headerHeight)
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
            .foregroundStyle(Color(hex: 0xF4F1EA))
            .frame(width: 44, height: 44)
            .frosted(Circle(), dim: 0.45)
    }
}

/// New · Channels · Live.
private struct TabPills: View {
    @Binding var tab: HomeTab
    let liveDot: Bool
    /// Unseen posts left, on New's top-right corner.
    let newBadge: String?
    /// Over a video: a dark see-through plate; on a page, the surface.
    let overMedia: Bool
    let choose: (HomeTab) -> Void

    var body: some View {
        HStack(spacing: 2) {
            ForEach(HomeTab.allCases) { item in
                let on = item == tab
                Button { choose(item) } label: {
                    HStack(spacing: 7) {
                        if item == .live && liveDot {
                            Circle().fill(Theme.live).frame(width: 7, height: 7)
                        }
                        Text(item.title)
                    }
                    .font(Theme.sans(15, on ? .heavy : .semibold))
                    .foregroundStyle(on ? .black : Color(hex: 0xF4F1EA))
                    .lineLimit(1)
                    .fixedSize()
                    .padding(.horizontal, on ? 16 : 14)
                    .frame(height: 40)
                    .background(Capsule().fill(on ? Theme.cream : .clear))
                    .contentShape(Capsule())
                    // Over the corner, so the tab stays sized for its label.
                    .overlay(alignment: .topTrailing) {
                        if item == .new, let newBadge {
                            Text(newBadge)
                                .font(Theme.sans(11, .heavy))
                                .monospacedDigit()
                                .foregroundStyle(.black)
                                .padding(.horizontal, 5)
                                .frame(minWidth: 20, minHeight: 20)
                                .background(Capsule().fill(Theme.accent))
                                .overlay(Capsule().strokeBorder(.black, lineWidth: 2))
                                .fixedSize()
                                // The boards' corner: 8 past the right, 9 above the top.
                                .offset(x: 8, y: -9)
                                .allowsHitTesting(false)
                        }
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel(label(for: item))
                .accessibilityHint(item == .new && on ? "Choose what’s in your feed" : "")
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
        .padding(4)
        .background {
            if overMedia {
                Color.clear.frosted(Capsule(), dim: 0.5)
            } else {
                Capsule().fill(Theme.surface)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Sections")
    }

    private func label(for item: HomeTab) -> String {
        switch item {
        case .new: return newBadge.map { "New, \($0) left" } ?? "New"
        case .live: return liveDot ? "Live, something’s on now" : "Live"
        case .channels: return "Channels"
        }
    }
}

private struct HeaderHeight: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = max(value, nextValue()) }
}

/// A post to show on its own in the player.
private struct OpenedPost: Identifiable {
    let post: PhonePost
    var id: String { post.key }
}
