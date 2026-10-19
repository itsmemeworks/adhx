import SwiftUI

/// Your saves (or search results) full screen, one post at a time: swipe up for
/// the next, down for the previous, tap to pause. A video plays the next save
/// when it ends, unless Repeat is on. Hide clears everything but the video.
struct PlayerView: View {
    let posts: [PhonePost]
    let server: URL
    /// Buttons and captions hidden (the top bar outside follows it too).
    @Binding var clean: Bool
    /// Dragging through the video (the top bar outside hides too).
    @Binding var scrubbing: Bool
    /// Set to a post's key to go straight to it (new saves at the top).
    @Binding var jumpTo: String?
    /// Called with the index on screen, so the list can load more near the end.
    var onShow: (Int) -> Void = { _ in }

    @StateObject private var playback = Playback()
    @State private var current: String?
    @State private var toast: String?
    @State private var toastTask: Task<Void, Never>?
    @Environment(\.scenePhase) private var scenePhase

    init(posts: [PhonePost], server: URL, clean: Binding<Bool>,
         scrubbing: Binding<Bool> = .constant(false), jumpTo: Binding<String?> = .constant(nil),
         start: String? = nil, onShow: @escaping (Int) -> Void = { _ in }) {
        self.posts = posts
        self.server = server
        _clean = clean
        _scrubbing = scrubbing
        _jumpTo = jumpTo
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
        .onChange(of: playback.scrubTime != nil) { _, now in scrubbing = now }
        .onChange(of: jumpTo) { _, key in
            guard let key else { return }
            withAnimation(.easeInOut(duration: 0.35)) { current = key }
            jumpTo = nil
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
    @State private var sharingBusy = false
    /// Files or words for the system share sheet (WhatsApp, Messages…).
    @State private var sharing: ShareItems?
    @State private var reading = false
    @State private var more = false

    /// Words over a picture get a soft shadow; nothing else does.
    private var overMedia: Bool { post.kind != "text" && post.kind != "article" }

    var body: some View {
        ZStack(alignment: .bottom) {
            Color.black
            stage
            if !clean {
                let scrubbing = onScreen && playback.scrubTime != nil
                if overMedia && !scrubbing {
                    LinearGradient(colors: [.clear, .black.opacity(0.85)], startPoint: .top, endPoint: .bottom)
                        .frame(height: 300)
                        .allowsHitTesting(false)
                }
                if !scrubbing {
                    caption
                        .padding(.bottom, 64)
                        .transition(.opacity)
                }
                if scrubbing, let at = playback.scrubTime {
                    // Big and centred: a bubble under the finger would be hidden by it.
                    (Text(clock(at)).font(Theme.sans(34, .bold).monospacedDigit())
                        + Text("  / \(clock(playback.duration))").font(Theme.sans(17, .bold).monospacedDigit())
                            .foregroundColor(Theme.cream))
                        .foregroundStyle(.white)
                        .overMediaShadow(true)
                        .padding(.bottom, 84)
                        .frame(maxWidth: .infinity)
                        .accessibilityHidden(true)
                }
                bottomRow
                    .padding(.bottom, 14)
            } else if post.kind == "video" && onScreen {
                ProgressLine(fraction: playback.duration > 0 ? playback.time / playback.duration : 0)
                    .padding(.horizontal, 20)
                    .padding(.bottom, 20)
            }
        }
        .clipped()
        .sheet(item: $sharing) { share in
            ActivitySheet(items: share.items)
                .presentationDetents([.medium, .large])
        }
        .sheet(isPresented: $more) {
            MoreSheet(post: post, server: server, say: say)
                .presentationDetents([.height(post.kind == "video" ? 400 : 330)])
                .presentationDragIndicator(.visible)
                .presentationBackground(Theme.surface)
                .presentationCornerRadius(28)
        }
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
                    if playback.problem != nil || !playback.ready {
                        // Still being kept on your ADHX: an animated card until it's ready.
                        PreparingOverlay(post: post, playback: playback)
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
                if hasMedia || !post.text.isEmpty {
                    RailButton(label: "Save", shadow: overMedia,
                               accessibility: hasMedia ? "Save to Photos" : "Copy the words") {
                        save()
                    } icon: {
                        if saving {
                            RingSpinner().frame(width: 20, height: 20)
                        } else {
                            Image(systemName: "arrow.down.to.line")
                                .font(.system(size: 19, weight: .semibold))
                        }
                    }
                }
                if hasMedia || !post.text.isEmpty {
                    RailButton(label: "Share", shadow: overMedia,
                               accessibility: hasMedia ? "Share the \(post.kind == "photo" ? "photos" : "file")" : "Share the words") {
                        share()
                    } icon: {
                        if sharingBusy {
                            RingSpinner().frame(width: 20, height: 20)
                        } else {
                            Image(systemName: shareIcon)
                                .font(.system(size: 19, weight: .semibold))
                        }
                    }
                }
                if let source = post.sourceUrl.flatMap(URL.init(string:)) {
                    RailButton(label: "Original", shadow: overMedia,
                               accessibility: "Open original on \(Network.name(post.platform))") {
                        openURL(source)
                    } icon: {
                        NetworkMark(platform: post.platform, size: 22)
                    }
                }
                RailButton(label: "More", shadow: overMedia, accessibility: "More for this post") {
                    more = true
                } icon: {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 19, weight: .bold))
                }
            }
            .frame(width: 64)
        }
        .padding(.leading, 18)
        .padding(.trailing, 12)
    }

    /// The line to drag through the video, then the small window and Hide as
    /// plain glyphs (not round buttons like the column).
    private var bottomRow: some View {
        HStack(spacing: 2) {
            if post.plays, onScreen, playback.duration > 0 {
                Scrubber(playback: playback)
            } else {
                Spacer(minLength: 0)
            }
            if post.kind == "video", onScreen, playback.pipSupported {
                Glyph(name: "pip.enter", label: "Keep playing in a small window") {
                    if playback.pipPossible {
                        playback.startSmallWindow()
                    } else {
                        say("The small window isn’t ready yet. Try again in a moment.")
                    }
                }
            }
            Glyph(name: "arrow.up.left.and.arrow.down.right", label: "Hide buttons and caption") {
                clean = true
            }
        }
        .padding(.leading, 20)
        // Hide sits centred under the column's buttons.
        .padding(.trailing, 22)
        .animation(.easeOut(duration: 0.15), value: playback.scrubTime != nil)
    }

    /// The file the Save button keeps: the video, or the photo on screen.
    /// Share shows what it sends: the video, the photos, the sound or the words.
    private var shareIcon: String {
        guard hasMedia else { return "text.quote" }
        switch post.kind {
        case "video": return "play.rectangle.fill"
        case "audio": return "waveform"
        case "photo": return post.media.count > 1 ? "photo.stack.fill" : "photo.fill"
        default: return "square.and.arrow.up"
        }
    }

    /// A video, sound or photos your ADHX keeps (anything else is words).
    private var hasMedia: Bool { !KeptFiles.sources(of: post, server: server).isEmpty }

    /// Save: the media to Photos (a sound to Files, through the share sheet),
    /// or the words to the clipboard.
    private func save() {
        guard hasMedia else {
            UIPasteboard.general.string = post.text
            say("Copied")
            return
        }
        guard !saving else { return }
        if post.kind == "audio" {
            share()
            return
        }
        saving = true
        Task {
            say(await SaveToPhotos.save(post, server: server))
            saving = false
        }
    }

    /// Share: the kept file itself (so it plays in WhatsApp and the like), or the words.
    private func share() {
        guard hasMedia else {
            sharing = ShareItems(items: [post.text])
            return
        }
        guard !sharingBusy else { return }
        sharingBusy = true
        Task {
            if let files = await KeptFiles.download(post, server: server) {
                sharing = ShareItems(items: files.map(\.url))
            } else {
                say("Still being kept on your ADHX. Try again in a moment.")
            }
            sharingBusy = false
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

/// More for a post: share its ADHX link with people on your server, copy the
/// original link or the words, or open it on your ADHX.
private struct MoreSheet: View {
    let post: PhonePost
    let server: URL
    let say: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var sharing: SharedFile?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 12) {
                if let poster = ADHXClient.resolve(post.posterUrl, against: server) {
                    AsyncImage(url: poster) { phase in
                        if let image = phase.image { image.resizable().scaledToFill() } else { Theme.placeholder }
                    }
                    .frame(width: 40, height: 64)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .accessibilityHidden(true)
                }
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 7) {
                        NetworkMark(platform: post.platform, size: 14)
                        Text(networkLine)
                            .font(Theme.sans(13, .bold))
                            .foregroundStyle(Theme.muted)
                    }
                    Text(post.author.handle.hasPrefix("@") ? post.author.handle : "@\(post.author.handle)")
                        .font(Theme.sans(16, .heavy))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                Button { dismiss() } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 44, height: 44)
                        .background(Circle().fill(Theme.raised))
                }
                .accessibilityLabel("Close")
            }
            VStack(spacing: 4) {
                if let open = ADHXClient.resolve(post.openPath, against: server) {
                    row(icon: "person.2", title: "Share an ADHX link",
                        detail: "For people on your ADHX: opens this post there") {
                        sharing = SharedFile(url: open)
                    }
                }
                if let source = post.sourceUrl {
                    row(icon: "link", title: "Copy link", detail: "The original post on \(Network.name(post.platform))") {
                        UIPasteboard.general.string = source
                        dismiss()
                        say("Link copied")
                    }
                }
                if !post.text.isEmpty {
                    row(icon: "doc.on.doc", title: "Copy the words",
                        detail: String(post.text.prefix(80)).replacingOccurrences(of: "\n", with: " ")) {
                        UIPasteboard.general.string = post.text
                        dismiss()
                        say("Words copied")
                    }
                }
                if let open = ADHXClient.resolve(post.openPath, against: server) {
                    Button {
                        openURL(open)
                        dismiss()
                    } label: {
                        rowFace(title: "Open in my ADHX", detail: "This post on your ADHX, in the browser") {
                            Gob(size: 24)
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 20)
        .padding(.top, 20)
        .sheet(item: $sharing) { file in
            ActivitySheet(items: [file.url])
                .presentationDetents([.medium, .large])
        }
    }

    /// "YouTube · 1080p". X's name is its mark, so it isn't spelled out again.
    private var networkLine: String {
        let name = Network.name(post.platform)
        var parts = name.count > 1 ? [name] : []
        if post.kind == "video", let height = post.media.first?.height, height > 0 {
            parts.append("\(height)p")
        }
        return parts.joined(separator: " · ")
    }

    private func row(icon: String, title: String, detail: String, busy: Bool = false,
                     action: @escaping () -> Void) -> some View {
        Button(action: action) {
            rowFace(title: title, detail: detail) {
                if busy {
                    RingSpinner().frame(width: 20, height: 20)
                } else {
                    Image(systemName: icon)
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(Theme.accent)
                }
            }
        }
        .buttonStyle(.plain)
        .disabled(busy)
    }

    private func rowFace<Icon: View>(title: String, detail: String,
                                     @ViewBuilder icon: () -> Icon) -> some View {
        HStack(spacing: 14) {
            icon()
                .frame(width: 40, height: 40)
                .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Theme.raised))
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(Theme.sans(16, .bold))
                    .foregroundStyle(.white)
                Text(detail)
                    .font(Theme.sans(13))
                    .foregroundStyle(Theme.muted)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12)
        .frame(minHeight: 60)
        .contentShape(Rectangle())
    }
}

/// Files or words for the share sheet, from the player's rail.
private struct ShareItems: Identifiable {
    let id = UUID()
    let items: [Any]
}

private struct SharedFile: Identifiable {
    let url: URL
    var id: URL { url }
}

/// The system share sheet, for a file.
private struct ActivitySheet: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

/// A plain icon you can press: no circle, a soft shadow so it reads on video.
private struct Glyph: View {
    let name: String
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: name)
                .font(.system(size: 18, weight: .medium))
                .foregroundStyle(.white)
                .shadow(color: .black.opacity(0.6), radius: 3, y: 1)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

/// The line to drag through a video. At rest a thin line with a small dot;
/// while dragging it thickens and the time shows big in the middle.
private struct Scrubber: View {
    @ObservedObject var playback: Playback

    var body: some View {
        GeometryReader { box in
            let length = max(playback.duration, 0.1)
            let at = playback.scrubTime ?? playback.time
            let fraction = CGFloat(min(max(at / length, 0), 1))
            let dragging = playback.scrubTime != nil
            let thickness: CGFloat = dragging ? 6 : 3
            let thumb: CGFloat = dragging ? 20 : 12
            ZStack(alignment: .leading) {
                Capsule().fill(.white.opacity(0.3)).frame(height: thickness)
                Capsule().fill(Theme.accent).frame(width: box.size.width * fraction, height: thickness)
                Circle().fill(Theme.accent)
                    .frame(width: thumb, height: thumb)
                    .offset(x: box.size.width * fraction - thumb / 2)
            }
            .frame(maxHeight: .infinity)
            .contentShape(Rectangle())
            .highPriorityGesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { drag in
                        let x = min(max(drag.location.x / max(box.size.width, 1), 0), 1)
                        playback.scrubTime = Double(x) * length
                    }
                    .onEnded { _ in
                        if let to = playback.scrubTime { playback.seek(to: to) }
                        playback.scrubTime = nil
                    }
            )
        }
        .frame(height: 44)
        .accessibilityElement()
        .accessibilityLabel("Position in the video")
        .accessibilityValue("\(Int(playback.time)) of \(Int(playback.duration)) seconds")
        .accessibilityAdjustableAction { direction in
            let step: Double = direction == .increment ? 5 : -5
            playback.seek(to: min(max(playback.time + step, 0), playback.duration))
        }
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
        // A tight dark edge plus a soft glow: readable on white pictures too.
        if on {
            shadow(color: .black.opacity(0.9), radius: 1, y: 0.5)
                .shadow(color: .black.opacity(0.6), radius: 4, y: 1)
        } else {
            self
        }
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
        // The picture fills a fixed box: a filled image would otherwise size
        // the whole page past the screen and push the caption off it.
        Color.black
            .overlay {
                AsyncImage(url: url) { phase in
                    if let image = phase.image {
                        image.resizable().aspectRatio(contentMode: fill ? .fill : .fit)
                    } else {
                        Color.black
                    }
                }
            }
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

