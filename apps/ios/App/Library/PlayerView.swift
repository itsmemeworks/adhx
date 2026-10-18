import SwiftUI

/// Your saves (or search results) full screen, one post at a time: swipe up for
/// the next. Videos loop and start muted; photo albums swipe sideways; words
/// read as a card.
struct PlayerView: View {
    let posts: [PhonePost]
    let server: URL
    /// Called with the index on screen, so the list can load more near the end.
    var onShow: (Int) -> Void = { _ in }

    @StateObject private var playback = Playback()
    @State private var current: String?
    @Environment(\.scenePhase) private var scenePhase

    init(posts: [PhonePost], server: URL, start: String? = nil, onShow: @escaping (Int) -> Void = { _ in }) {
        self.posts = posts
        self.server = server
        self.onShow = onShow
        _current = State(initialValue: start ?? posts.first?.key)
    }

    var body: some View {
        ScrollView(.vertical) {
            LazyVStack(spacing: 0) {
                ForEach(posts, id: \.key) { post in
                    PostPage(post: post, server: server, onScreen: post.key == current, playback: playback)
                        .containerRelativeFrame([.horizontal, .vertical])
                        .id(post.key)
                }
            }
            .scrollTargetLayout()
        }
        .scrollTargetBehavior(.paging)
        .scrollPosition(id: $current)
        .scrollIndicators(.hidden)
        .ignoresSafeArea()
        .background(Color.black.ignoresSafeArea())
        .onChange(of: current, initial: true) { _, key in showCurrent(key) }
        .onChange(of: posts.map(\.key)) { _, keys in
            // A reload that no longer has the post on screen starts at the top.
            if let current, !keys.contains(current) { self.current = keys.first }
            showCurrent(self.current)
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { playback.resume() } else { playback.stop() }
        }
        .onDisappear { playback.stop() }
    }

    private func showCurrent(_ key: String?) {
        guard let key, let index = posts.firstIndex(where: { $0.key == key }) else {
            playback.show(nil)
            return
        }
        onShow(index)
        let post = posts[index]
        playback.show(post.plays ? ADHXClient.resolve(post.media.first?.url, against: server) : nil)
    }
}

/// One post, full screen.
private struct PostPage: View {
    let post: PhonePost
    let server: URL
    let onScreen: Bool
    @ObservedObject var playback: Playback
    @Environment(\.openURL) private var openURL

    var body: some View {
        ZStack(alignment: .bottom) {
            Color.black
            stage
            LinearGradient(colors: [.clear, .black.opacity(0.85)], startPoint: .top, endPoint: .bottom)
                .frame(height: 260)
                .allowsHitTesting(false)
            caption
        }
        .clipped()
    }

    @ViewBuilder
    private var stage: some View {
        switch post.kind {
        case "video", "audio":
            ZStack {
                Poster(url: ADHXClient.resolve(post.posterUrl, against: server), fill: post.kind == "audio")
                if onScreen {
                    if post.kind == "video" {
                        PlayerLayerView(player: playback.player)
                    }
                    if let problem = playback.problem {
                        Text(problem)
                            .font(Theme.sans(15))
                            .foregroundStyle(Theme.cream)
                            .multilineTextAlignment(.center)
                            .padding(16)
                            .background(RoundedRectangle(cornerRadius: 14).fill(.black.opacity(0.7)))
                            .padding(32)
                    } else if !playback.ready {
                        RingSpinner().frame(width: 34, height: 34)
                    } else if playback.paused {
                        Image(systemName: "play.fill")
                            .font(.system(size: 30))
                            .foregroundStyle(.white)
                            .frame(width: 72, height: 72)
                            .background(Circle().fill(.black.opacity(0.55)))
                            .allowsHitTesting(false)
                    }
                }
            }
            .contentShape(Rectangle())
            .onTapGesture { playback.togglePause() }
            .accessibilityAddTraits(.isButton)
            .accessibilityLabel(playback.paused ? "Play" : "Pause")
        case "photo":
            Album(urls: post.media.compactMap { ADHXClient.resolve($0.url, against: server) })
        default:
            WordsCard(post: post)
        }
    }

    /// Left: who posted it and the first lines. Right: the actions, like the
    /// web player's bar. The network's own mark is the button to the original.
    private var caption: some View {
        HStack(alignment: .bottom, spacing: 12) {
            VStack(alignment: .leading, spacing: 8) {
                Text(handle)
                    .font(Theme.sans(17, .heavy))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                if post.kind != "text" && post.kind != "article", !post.text.isEmpty {
                    Text(post.text)
                        .font(Theme.sans(15))
                        .foregroundStyle(Theme.cream)
                        .lineLimit(2)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)

            VStack(spacing: 12) {
                if post.plays && onScreen {
                    RailButton(label: "Sound",
                               accessibility: playback.muted ? "Turn sound on" : "Turn sound off") {
                        playback.muted.toggle()
                    } icon: {
                        Image(systemName: playback.muted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                            .font(.system(size: 19, weight: .semibold))
                    }
                }
                if let source = post.sourceUrl.flatMap(URL.init(string:)) {
                    ShareLink(item: source) {
                        RailFace(label: "Share") {
                            Image(systemName: "square.and.arrow.up")
                                .font(.system(size: 19, weight: .semibold))
                        }
                    }
                    .accessibilityLabel("Share link")
                    RailButton(label: "Original",
                               accessibility: "Open original on \(Network.name(post.platform))") {
                        openURL(source)
                    } icon: {
                        NetworkMark(platform: post.platform, size: 22)
                    }
                }
            }
            .frame(width: 64)
        }
        .padding(.leading, 18)
        .padding(.trailing, 12)
        .padding(.bottom, 34)
    }

    private var handle: String {
        let name = post.author.handle
        return name.hasPrefix("@") || name.isEmpty ? name : "@\(name)"
    }
}

/// A round button in the player's action column, with its label under it.
private struct RailButton<Icon: View>: View {
    let label: String
    let accessibility: String
    let action: () -> Void
    @ViewBuilder let icon: () -> Icon

    var body: some View {
        Button(action: action) { RailFace(label: label, icon: icon) }
            .buttonStyle(.plain)
            .accessibilityLabel(accessibility)
    }
}

private struct RailFace<Icon: View>: View {
    let label: String
    @ViewBuilder let icon: () -> Icon

    var body: some View {
        VStack(spacing: 4) {
            icon()
                .foregroundStyle(.white)
                .frame(width: 48, height: 48)
                .background(Circle().fill(.black.opacity(0.55)))
                .overlay(Circle().strokeBorder(.white.opacity(0.18), lineWidth: 1))
            Text(label)
                .font(Theme.sans(11, .bold))
                .foregroundStyle(Theme.cream)
                .accessibilityHidden(true)
        }
    }
}

/// A post's poster while its video loads (or behind a sound).
private struct Poster: View {
    let url: URL?
    var fill = false

    var body: some View {
        AsyncImage(url: url) { phase in
            if let image = phase.image {
                image.resizable().aspectRatio(contentMode: fill ? .fill : .fit)
            } else {
                Color.black
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipped()
        .accessibilityHidden(true)
    }
}

/// Photos, swiped sideways, with dots when there's more than one.
private struct Album: View {
    let urls: [URL]
    @State private var page = 0

    var body: some View {
        TabView(selection: $page) {
            ForEach(Array(urls.enumerated()), id: \.offset) { index, url in
                AsyncImage(url: url) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFit()
                    } else if phase.error != nil {
                        Text("This photo couldn’t load.")
                            .font(Theme.sans(14))
                            .foregroundStyle(Theme.muted)
                    } else {
                        RingSpinner().frame(width: 30, height: 30)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .tag(index)
                .accessibilityLabel("Photo \(index + 1) of \(urls.count)")
            }
        }
        .tabViewStyle(.page(indexDisplayMode: urls.count > 1 ? .always : .never))
    }
}

/// A post that's words (or an article), full bleed like a video: the words sit
/// straight on the page under the top bar and fade out above the caption.
private struct WordsCard: View {
    let post: PhonePost

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let article = post.article {
                if let title = article.title, !title.isEmpty {
                    Text(title)
                        .font(Theme.serif(34))
                        .foregroundStyle(.white)
                }
                if let description = article.description, !description.isEmpty {
                    Text(description)
                        .font(Theme.sans(17))
                        .foregroundStyle(Theme.muted)
                }
            }
            if !post.text.isEmpty {
                Text(post.text)
                    .font(post.article == nil ? Theme.serif(post.text.count < 140 ? 38 : 28) : Theme.sans(16))
                    .foregroundStyle(Theme.cream)
                    .lineSpacing(post.article == nil ? 2 : 4)
            }
        }
        .padding(.horizontal, 24)
        // Between the top bar and the caption: short words sit in the middle,
        // long ones fill it and fade out just above the caption. No scrolling.
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .mask(
            LinearGradient(stops: [.init(color: .black, location: 0.86),
                                   .init(color: .clear, location: 1)],
                           startPoint: .top, endPoint: .bottom)
        )
        .padding(.top, 110)
        .padding(.bottom, 150)
        .background(
            LinearGradient(colors: [Theme.raised, Theme.app], startPoint: .top, endPoint: .bottom)
        )
        .clipped()
        .accessibilityElement(children: .combine)
    }
}
