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
            .overlay(alignment: .topTrailing) {
                if onScreen {
                    Button {
                        playback.muted.toggle()
                    } label: {
                        Image(systemName: playback.muted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(.white)
                            .frame(width: 44, height: 44)
                            .background(Circle().fill(.black.opacity(0.5)))
                    }
                    .accessibilityLabel(playback.muted ? "Sound on" : "Sound off")
                    .padding(.top, 110)
                    .padding(.trailing, 16)
                }
            }
        case "photo":
            Album(urls: post.media.compactMap { ADHXClient.resolve($0.url, against: server) })
        default:
            WordsCard(post: post)
        }
    }

    private var caption: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                NetworkMark(platform: post.platform, size: 16)
                Text(handle)
                    .font(Theme.sans(15, .heavy))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                Spacer(minLength: 0)
                if let source = post.sourceUrl.flatMap(URL.init(string:)) {
                    Button("Open original") { openURL(source) }
                        .font(Theme.sans(13, .bold))
                        .foregroundStyle(.white)
                        .padding(.vertical, 8)
                        .padding(.horizontal, 12)
                        .background(Capsule().fill(.white.opacity(0.16)))
                }
            }
            if post.kind != "text" && post.kind != "article", !post.text.isEmpty {
                Text(post.text)
                    .font(Theme.sans(14))
                    .foregroundStyle(Theme.cream)
                    .lineLimit(3)
            }
        }
        .padding(.horizontal, 18)
        .padding(.bottom, 34)
        .accessibilityElement(children: .contain)
    }

    private var handle: String {
        let name = post.author.handle
        return name.hasPrefix("@") || name.isEmpty ? name : "@\(name)"
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

/// A post that's words (or an article): read it.
private struct WordsCard: View {
    let post: PhonePost

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let article = post.article {
                if let title = article.title, !title.isEmpty {
                    Text(title)
                        .font(Theme.serif(30))
                        .foregroundStyle(.white)
                }
                if let description = article.description, !description.isEmpty {
                    Text(description)
                        .font(Theme.sans(16))
                        .foregroundStyle(Theme.muted)
                }
            }
            if !post.text.isEmpty {
                Text(post.text)
                    .font(Theme.sans(post.article == nil ? 20 : 15))
                    .foregroundStyle(Theme.cream)
                    .lineSpacing(4)
                    .lineLimit(14)
            }
        }
        .padding(22)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(Theme.surface))
        .padding(.horizontal, 18)
        .padding(.bottom, 120)
        .frame(maxHeight: .infinity)
    }
}
