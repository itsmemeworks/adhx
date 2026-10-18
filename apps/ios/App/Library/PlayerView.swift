import SwiftUI

/// Your saves (or search results) full screen, one post at a time: swipe up for
/// the next, down for the previous, tap to pause. A video plays the next save
/// when it ends, unless Repeat is on. Hide clears everything but the video.
struct PlayerView: View {
    let posts: [PhonePost]
    let server: URL
    /// Buttons and captions hidden (the top bar outside follows it too).
    @Binding var clean: Bool
    /// Called with the index on screen, so the list can load more near the end.
    var onShow: (Int) -> Void = { _ in }

    @StateObject private var playback = Playback()
    @State private var current: String?
    @State private var toast: String?
    @State private var toastTask: Task<Void, Never>?
    @Environment(\.scenePhase) private var scenePhase

    init(posts: [PhonePost], server: URL, clean: Binding<Bool>, start: String? = nil,
         onShow: @escaping (Int) -> Void = { _ in }) {
        self.posts = posts
        self.server = server
        _clean = clean
        self.onShow = onShow
        _current = State(initialValue: start ?? posts.first?.key)
    }

    var body: some View {
        ZStack(alignment: .top) {
            pager
            // Inside the safe area, under the top bar.
            if let toast, !clean {
                Text(toast)
                    .font(Theme.sans(14, .heavy))
                    .foregroundStyle(.black)
                    .padding(.horizontal, 16)
                    .frame(minHeight: 40)
                    .background(Capsule().fill(Theme.cream))
                    .padding(.top, 64)
                    .transition(.opacity)
                    .allowsHitTesting(false)
            }
        }
        .animation(.easeInOut(duration: 0.2), value: toast)
    }

    private var pager: some View {
        ScrollView(.vertical) {
            LazyVStack(spacing: 0) {
                ForEach(posts, id: \.key) { post in
                    PostPage(post: post, server: server, onScreen: post.key == current,
                             playback: playback, clean: $clean, say: say)
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
            if phase == .active {
                playback.resume()
            } else if !playback.keepsPlayingOutside {
                playback.stop()
            }
        }
        .onAppear {
            playback.onEnded = { next() }
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

    /// A video ended with Repeat off: on to the next save.
    private func next() {
        guard let current, let index = posts.firstIndex(where: { $0.key == current }),
              index + 1 < posts.count else { return }
        withAnimation(.easeInOut(duration: 0.35)) { self.current = posts[index + 1].key }
    }

    /// A short message near the top.
    private func say(_ text: String) {
        toastTask?.cancel()
        toast = text
        toastTask = Task {
            try? await Task.sleep(nanoseconds: 2_200_000_000)
            guard !Task.isCancelled else { return }
            toast = nil
        }
    }
}

/// One post, full screen.
private struct PostPage: View {
    let post: PhonePost
    let server: URL
    let onScreen: Bool
    @ObservedObject var playback: Playback
    @Binding var clean: Bool
    let say: (String) -> Void
    @Environment(\.openURL) private var openURL
    @State private var photo = 0
    @State private var saving = false
    @State private var reading = false

    /// Words over a picture get a soft shadow; nothing else does.
    private var overMedia: Bool { post.kind != "text" && post.kind != "article" }

    var body: some View {
        ZStack(alignment: .bottom) {
            Color.black
            stage
            if !clean {
                if overMedia {
                    LinearGradient(colors: [.clear, .black.opacity(0.85)], startPoint: .top, endPoint: .bottom)
                        .frame(height: 300)
                        .allowsHitTesting(false)
                }
                VStack(spacing: 14) {
                    caption
                    bottomRow
                }
                .padding(.bottom, 26)
            } else if post.kind == "video" && onScreen {
                ProgressLine(fraction: playback.duration > 0 ? playback.time / playback.duration : 0)
                    .padding(.horizontal, 20)
                    .padding(.bottom, 20)
            }
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
                        PlayerLayerView(player: playback.player) { playback.attach($0) }
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
                            .font(.system(size: 32))
                            .foregroundStyle(.white)
                            .frame(width: 76, height: 76)
                            .background(Circle().fill(.black.opacity(0.5)))
                            .allowsHitTesting(false)
                    }
                }
            }
            .contentShape(Rectangle())
            .onTapGesture { if clean { clean = false } else { playback.togglePause() } }
            .accessibilityAddTraits(.isButton)
            .accessibilityLabel(clean ? "Show buttons and caption" : playback.paused ? "Play" : "Pause")
        case "photo":
            Album(urls: post.media.compactMap { ADHXClient.resolve($0.url, against: server) }, page: $photo)
                .onTapGesture { if clean { clean = false } }
        default:
            WordsCard(post: post) { reading = true }
                .contentShape(Rectangle())
                .onTapGesture { if clean { clean = false } }
                .sheet(isPresented: $reading) { ReaderView(post: post) }
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
                if overMedia, !post.text.isEmpty {
                    Text(post.text)
                        .font(Theme.sans(15))
                        .foregroundStyle(Theme.cream)
                        .lineLimit(2)
                }
            }
            .overMediaShadow(overMedia)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)

            VStack(spacing: 12) {
                if post.plays && onScreen {
                    RailButton(label: "Sound", shadow: overMedia,
                               accessibility: playback.muted ? "Turn sound on" : "Turn sound off") {
                        playback.muted.toggle()
                    } icon: {
                        Image(systemName: playback.muted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                            .font(.system(size: 19, weight: .semibold))
                    }
                    RailButton(label: "Repeat", on: playback.repeatOne, shadow: overMedia,
                               accessibility: "Repeat this one") {
                        playback.repeatOne.toggle()
                        say(playback.repeatOne ? "Repeating this one" : "Plays the next save when this ends")
                    } icon: {
                        Image(systemName: "repeat.1")
                            .font(.system(size: 19, weight: .semibold))
                    }
                    .accessibilityAddTraits(playback.repeatOne ? .isSelected : [])
                }
                if let media = savable {
                    RailButton(label: "Save", shadow: overMedia, accessibility: "Save to Photos") {
                        guard !saving else { return }
                        saving = true
                        Task {
                            say(await SaveToPhotos.save(media.url, isVideo: media.video))
                            saving = false
                        }
                    } icon: {
                        if saving {
                            RingSpinner().frame(width: 20, height: 20)
                        } else {
                            Image(systemName: "arrow.down.to.line")
                                .font(.system(size: 19, weight: .semibold))
                        }
                    }
                }
                if let source = post.sourceUrl.flatMap(URL.init(string:)) {
                    ShareLink(item: source) {
                        RailFace(label: "Share", shadow: overMedia) {
                            Image(systemName: "square.and.arrow.up")
                                .font(.system(size: 19, weight: .semibold))
                        }
                    }
                    .accessibilityLabel("Share link")
                    RailButton(label: "Original", shadow: overMedia,
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
    }

    /// Time, a line to drag through the video, and Hide.
    private var bottomRow: some View {
        HStack(spacing: 10) {
            if post.kind == "video" || post.kind == "audio", onScreen, playback.duration > 0 {
                Text("\(clock(playback.time)) / \(clock(playback.duration))")
                    .font(Theme.sans(12, .bold).monospacedDigit())
                    .foregroundStyle(Theme.cream)
                    .overMediaShadow(true)
                Slider(value: Binding(get: { playback.time }, set: { playback.seek(to: $0) }),
                       in: 0...max(playback.duration, 0.1))
                    .tint(Theme.accent)
                    .accessibilityLabel("Position in the video")
            } else {
                Spacer(minLength: 0)
            }
            if post.kind == "video", onScreen, playback.pipSupported {
                Button {
                    if playback.pipPossible {
                        playback.startSmallWindow()
                    } else {
                        say("The small window isn’t ready yet. Try again in a moment.")
                    }
                } label: {
                    Image(systemName: "pip.enter")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 40, height: 40)
                        .background(Circle().fill(.black.opacity(0.5)))
                }
                .accessibilityLabel("Keep playing in a small window")
            }
            Button {
                clean = true
            } label: {
                Image(systemName: "arrow.up.left.and.arrow.down.right")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 40, height: 40)
                    .background(Circle().fill(.black.opacity(0.5)))
            }
            .accessibilityLabel("Hide buttons and caption")
        }
        .padding(.leading, 20)
        .padding(.trailing, 16)
    }

    /// The file the Save button keeps: the video, or the photo on screen.
    private var savable: (url: URL, video: Bool)? {
        switch post.kind {
        case "video":
            return ADHXClient.resolve(post.media.first?.url, against: server).map { ($0, true) }
        case "photo":
            let index = min(photo, max(post.media.count - 1, 0))
            guard post.media.indices.contains(index) else { return nil }
            return ADHXClient.resolve(post.media[index].url, against: server).map { ($0, false) }
        default:
            return nil
        }
    }

    private var handle: String {
        let name = post.author.handle
        return name.hasPrefix("@") || name.isEmpty ? name : "@\(name)"
    }

    private func clock(_ seconds: Double) -> String {
        let s = Int(seconds.rounded(.down))
        return "\(s / 60):" + String(format: "%02d", s % 60)
    }
}

/// The thin line left when the buttons are hidden.
private struct ProgressLine: View {
    let fraction: Double
    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(.white.opacity(0.22))
                Capsule().fill(Theme.accent).frame(width: geo.size.width * min(max(fraction, 0), 1))
            }
        }
        .frame(height: 3)
        .accessibilityHidden(true)
    }
}

private extension View {
    /// The soft shadow words get when they sit on a video or photo.
    @ViewBuilder func overMediaShadow(_ on: Bool) -> some View {
        if on { shadow(color: .black.opacity(0.6), radius: 3, y: 1) } else { self }
    }
}

/// A round button in the player's action column, with its label under it.
private struct RailButton<Icon: View>: View {
    let label: String
    var on = false
    var shadow = true
    let accessibility: String
    let action: () -> Void
    @ViewBuilder let icon: () -> Icon

    var body: some View {
        Button(action: action) { RailFace(label: label, on: on, shadow: shadow, icon: icon) }
            .buttonStyle(.plain)
            .accessibilityLabel(accessibility)
    }
}

/// Yellow with a black mark when it's on (Repeat).
private struct RailFace<Icon: View>: View {
    let label: String
    var on = false
    var shadow = true
    @ViewBuilder let icon: () -> Icon

    var body: some View {
        VStack(spacing: 4) {
            icon()
                .foregroundStyle(on ? .black : .white)
                .frame(width: 48, height: 48)
                .background(Circle().fill(on ? Theme.accent : .black.opacity(0.55)))
                .overlay(Circle().strokeBorder(.white.opacity(on ? 0 : 0.18), lineWidth: 1))
            Text(label)
                .font(Theme.sans(11, .bold))
                .foregroundStyle(Theme.cream)
                .overMediaShadow(shadow)
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
    @Binding var page: Int

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

/// A post that's words (or an article), full bleed like a video. Short words
/// sit in the middle; long ones start at the top and fade out above the
/// caption, with Read all to open them in the reader. Words never scroll in the
/// feed, so a swipe always means the next save.
private struct WordsCard: View {
    let post: PhonePost
    var onRead: () -> Void = {}
    @State private var wordsHeight: CGFloat = 0

    var body: some View {
        GeometryReader { box in
            let overflows = wordsHeight > box.size.height + 1
            Words(post: post)
                .fixedSize(horizontal: false, vertical: true)
                .background(GeometryReader { words in
                    Color.clear.preference(key: WordsHeight.self, value: words.size.height)
                })
                .frame(width: box.size.width, height: box.size.height,
                       alignment: overflows ? .topLeading : .leading)
                .mask(
                    LinearGradient(stops: [.init(color: .black, location: overflows ? 0.7 : 1),
                                           .init(color: .clear, location: 1)],
                                   startPoint: .top, endPoint: .bottom)
                )
                .overlay(alignment: .bottomLeading) {
                    if overflows {
                        Button(action: onRead) {
                            Text("Read all")
                                .font(Theme.sans(15, .heavy))
                                .foregroundStyle(.black)
                                .padding(.horizontal, 18)
                                .frame(height: 40)
                                .background(Capsule().fill(Theme.cream))
                        }
                        .accessibilityHint("Opens the whole post to read")
                    }
                }
        }
        .onPreferenceChange(WordsHeight.self) { wordsHeight = $0 }
        .padding(.horizontal, 24)
        .padding(.top, 110)
        .padding(.bottom, 150)
        .background(
            LinearGradient(colors: [Theme.raised, Theme.app], startPoint: .top, endPoint: .bottom)
        )
        .clipped()
        .accessibilityElement(children: .contain)
    }
}

private struct WordsHeight: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = max(value, nextValue()) }
}

/// The words of a text post or article, as the feed and the reader show them.
private struct Words: View {
    let post: PhonePost
    var reading = false

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
                    .font(font)
                    .foregroundStyle(Theme.cream)
                    .lineSpacing(post.article == nil && !reading ? 2 : 5)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var font: Font {
        if post.article != nil { return Theme.sans(reading ? 18 : 16) }
        if reading { return Theme.serif(26) }
        return Theme.serif(post.text.count < 140 ? 38 : 28)
    }
}

/// A long post, to read from top to bottom. The yellow line shows how far.
struct ReaderView: View {
    let post: PhonePost
    @Environment(\.dismiss) private var dismiss
    @State private var progress: CGFloat = 0

    var body: some View {
        GeometryReader { viewport in
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    HStack(spacing: 8) {
                        NetworkMark(platform: post.platform, size: 16)
                        Text(post.author.handle.hasPrefix("@") ? post.author.handle : "@\(post.author.handle)")
                            .font(Theme.sans(15, .heavy))
                            .foregroundStyle(Theme.muted)
                    }
                    Words(post: post, reading: true)
                }
                .padding(.horizontal, 24)
                .padding(.top, 76)
                .padding(.bottom, 60)
                .background(GeometryReader { content in
                    let top = content.frame(in: .named("reader")).minY
                    Color.clear.onChange(of: top, initial: true) { _, y in
                        let scrollable = content.size.height - viewport.size.height
                        progress = scrollable > 0 ? min(max(-y / scrollable, 0), 1) : 1
                    }
                })
            }
            .coordinateSpace(name: "reader")
        }
        .background(Theme.app.ignoresSafeArea())
        .overlay(alignment: .top) {
            // Words scroll away under a soft fade, not under the button.
            LinearGradient(colors: [Theme.app, Theme.app.opacity(0)], startPoint: .top, endPoint: .bottom)
                .frame(height: 72)
                .allowsHitTesting(false)
        }
        .overlay(alignment: .top) {
            GeometryReader { bar in
                Rectangle().fill(Theme.accent).frame(width: bar.size.width * progress, height: 3)
            }
            .frame(height: 3)
            .accessibilityHidden(true)
        }
        .overlay(alignment: .topLeading) {
            Button { dismiss() } label: {
                Image(systemName: "chevron.down")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(Theme.surface))
            }
            .accessibilityLabel("Back to your saves")
            .padding(.leading, 16)
            .padding(.top, 14)
        }
        .presentationDragIndicator(.hidden)
        .presentationBackground(Theme.app)
    }
}

