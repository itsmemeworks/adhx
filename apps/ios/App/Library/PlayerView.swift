import SwiftUI

/// What a screen adds to the plain player (New, Live).
struct PlayerExtras {
    /// Shows the feed's why chip, and "Why this one" in More.
    var onWhy: ((PhonePost) -> Void)?
    /// Room under the caption for something the screen puts there (Live's reactions).
    var bottomInset: CGFloat = 0
    /// Where short messages sit, under whatever bar the screen has on top.
    var toastTop: CGFloat = 64
    /// A last page after the posts (New's "You're all caught up").
    var endPage: AnyView?
    /// Live: a React button at the top of the rail, lit while its picker is open.
    var react: ReactButton?
    /// Live: the moment's name, on a chip over the byline ("In Babies vs objects").
    var inMoment: String?
    /// Room between the rail's buttons (Live has one more, so they sit closer).
    var railSpacing: CGFloat = 10
    /// The progress line's colour (Live's is yellow, the feed's cream).
    var progressColour: Color = Theme.ink
    /// The reactions feed: every post floats its reactions (fresh from the
    /// server) each time it lands, even ones already replayed this run.
    var replayReactions = false
    /// Opened from the share card: Repeat starts on, so the post loops.
    var startRepeating = false
    /// Where you are ("5 of 51") on the bottom row, and opening Up next.
    var count: ((PhonePost) -> QueueCount?)?

    struct ReactButton {
        var isOpen: Bool
        var toggle: () -> Void
    }
}

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
    /// The end page, when there is one, is `posts.count`.
    var onShow: (Int) -> Void = { _ in }
    let extras: PlayerExtras

    /// The id of the end page in the pager.
    static let endKey = "adhx:end"

    @StateObject private var playback = Playback()
    /// React on any post (Live brings its own room).
    @StateObject private var reactions = PostReactionsModel()
    @State private var picking = false
    @State private var words = ""
    @State private var reacting = false
    @State private var reactNote: String?
    @FocusState private var typing: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// A friend's channel, opened from the faces on a post.
    @State private var friend: Saver?
    /// The post whose file is being sent.
    @State private var sending: PhonePost?
    @State private var current: String?
    @State private var toast: String?
    @State private var toastTask: Task<Void, Never>?
    /// Turned sideways: just the media, whole, nothing over it.
    @State private var landscape = false
    /// Whether the buttons were hidden before turning, to put back after.
    @State private var cleanBeforeTurning = false
    /// A post opened with "Open in ADHX" is playing over this one.
    @State private var covered = false
    /// `extras.startRepeating` has been applied.
    @State private var startedRepeating = false
    @Environment(\.scenePhase) private var scenePhase

    init(posts: [PhonePost], server: URL, clean: Binding<Bool>,
         scrubbing: Binding<Bool> = .constant(false), jumpTo: Binding<String?> = .constant(nil),
         start: String? = nil, extras: PlayerExtras = PlayerExtras(),
         onShow: @escaping (Int) -> Void = { _ in }) {
        self.posts = posts
        self.extras = extras
        self.server = server
        _clean = clean
        _scrubbing = scrubbing
        _jumpTo = jumpTo
        self.onShow = onShow
        _current = State(initialValue: start ?? posts.first?.key)
    }

    /// Live passes its own React button; everywhere else the player has one.
    private var ownReact: Bool { extras.react == nil }

    /// What the pages get: the player's React button when the screen has none.
    private var pageExtras: PlayerExtras {
        guard ownReact else { return extras }
        var page = extras
        page.react = .init(isOpen: picking, toggle: togglePicker)
        if picking { page.bottomInset += 146 }
        return page
    }

    var body: some View {
        ZStack(alignment: .top) {
            pager
            if ownReact {
                FloatingReactions(reactions: reactions.floating, server: server)
                    .padding(.top, 200)
                    .padding(.trailing, 80)
                    .frame(height: 500, alignment: .top)
                    .allowsHitTesting(false)
                if picking && !clean {
                    VStack {
                        Spacer()
                        ReactPicker(words: $words, typing: $typing, sending: reacting, note: reactNote,
                                    hint: "Up to \(LiveSay.maxText) characters. People who can see this post see it when they watch it.",
                                    onEmoji: { react(.emoji($0)) }, onWords: reactWords)
                            .padding(.horizontal, 12)
                            .padding(.bottom, typing ? 8 : 30)
                    }
                    .ignoresSafeArea(.container, edges: .bottom)
                    .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
                }
            }
            // Inside the safe area, under the top bar.
            if let toast, !clean {
                Text(toast)
                    .font(Theme.sans(14, .heavy))
                    .foregroundStyle(.black)
                    .padding(.horizontal, 16)
                    .frame(minHeight: 40)
                    .background(Capsule().fill(Theme.cream))
                    .padding(.top, extras.toastTop)
                    .transition(.opacity)
                    .allowsHitTesting(false)
            }
        }
        .animation(.easeInOut(duration: 0.2), value: toast)
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: picking)
        .fullScreenCover(item: $friend) { saver in
            FriendChannelScreen(friend: saver, server: server)
        }
        // Sending the file itself, over the player (and over Home's bar,
        // which steps aside while it's up).
        .boardSheet(item: $sending, height: 680) { post in
            SendSheet(post: post, server: server, say: say)
        }
        .preference(key: PlayerSheetUp.self, value: sending != nil)
        // Home swaps its "on their way" pill for the message while it's up.
        .preference(key: PlayerToastUp.self, value: toast != nil && !clean)
        // Landscape is only for watching (OrientationGate).
        .mayTurnToWatch()
        .uprightWhile(friend != nil || sending != nil || picking)
        .onGeometryChange(for: Bool.self) { $0.size.width > $0.size.height } action: { turned in
            guard turned != landscape else { return }
            landscape = turned
            if turned {
                cleanBeforeTurning = clean
                clean = true
                picking = false
            } else {
                clean = cleanBeforeTurning
            }
        }
    }

    private var pager: some View {
        ScrollView(.vertical) {
            LazyVStack(spacing: 0) {
                ForEach(posts, id: \.key) { post in
                    PostPage(post: post, server: server, onScreen: post.key == current,
                             playback: playback, clean: $clean, extras: pageExtras, say: say,
                             openFriend: { friend = $0 }, send: { sending = $0 },
                             advance: { next() }, hasNext: hasNext(after: post),
                             reply: replier(post), answer: answer(post),
                             held: sending != nil || pageExtras.react?.isOpen == true, landscape: landscape)
                        .containerRelativeFrame([.horizontal, .vertical])
                        .id(post.key)
                }
                if let end = extras.endPage {
                    end
                        .containerRelativeFrame([.horizontal, .vertical])
                        .id(Self.endKey)
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
            if let current, current != Self.endKey, !keys.contains(current) { self.current = keys.first }
            showCurrent(self.current)
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                if !covered { playback.resume() }
            } else if !playback.keepsPlayingOutside {
                playback.stop()
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .adhxOpeningPost)) { _ in
            covered = true
            playback.stop()
        }
        .onReceive(NotificationCenter.default.publisher(for: .adhxOpenedPostClosed)) { _ in
            // Back on this one: paused where it was, a tap plays it.
            covered = false
        }
        .onAppear {
            playback.onEnded = { next() }
        }
        .onAppear {
            // Once: coming back from a friend's channel mustn't switch it on again.
            guard extras.startRepeating, !startedRepeating else { return }
            startedRepeating = true
            playback.repeatOne = true
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
        if ownReact {
            picking = false
            typing = false
            reactNote = nil
            let post = key.flatMap { key in posts.first { $0.key == key } }
            reactions.arrive(post?.ref, notes: post.map(Self.notes) ?? [], again: extras.replayReactions)
        }
        if key == Self.endKey {
            playback.show(nil)
            onShow(posts.count)
            return
        }
        guard let key, let index = posts.firstIndex(where: { $0.key == key }) else {
            playback.show(nil)
            return
        }
        onShow(index)
        let post = posts[index]
        playback.show(post.plays ? ADHXClient.resolve(post.media.first?.url, against: server) : nil, key: post.key)
    }

    /// A video ended with Repeat off (or a photo's time ran out): on to the next save.
    private func next() {
        guard let current, let index = posts.firstIndex(where: { $0.key == current }) else { return }
        let next = index + 1 < posts.count ? posts[index + 1].key : extras.endPage != nil ? Self.endKey : nil
        guard let next else { return }
        withAnimation(.easeInOut(duration: 0.35)) { self.current = next }
    }

    private func togglePicker() {
        picking.toggle()
        if !picking { typing = false }
        reactNote = nil
    }

    private func reactWords() {
        let text = words.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        react(.text(text))
    }

    /// The savers' notes float up first, like anything else said on it
    /// (friends' before yours).
    private static func notes(_ post: PhonePost) -> [LiveReactionEvent] {
        (post.savers.filter { !$0.isYou } + post.savers.filter(\.isYou)).compactMap { saver in
            saver.note.map { LiveReactionEvent(id: "note:\(saver.username)", saver: saver, emoji: nil, text: $0, at: saver.savedAt) }
        }
    }

    private func hasNext(after post: PhonePost) -> Bool {
        guard let at = posts.firstIndex(where: { $0.key == post.key }) else { return false }
        return at + 1 < posts.count || extras.endPage != nil
    }

    private func replier(_ post: PhonePost) -> (LiveSay) async -> Bool {
        { say in await replyTo(post, say) }
    }

    private func answer(_ post: PhonePost) -> LiveReactionEvent? {
        guard let answer = reactions.answer, answer.key == post.key else { return nil }
        return answer.reaction
    }

    /// A reply to whoever sent `post`: a reaction on it, floating at once.
    private func replyTo(_ post: PhonePost, _ say: LiveSay) async -> Bool {
        let you = YourFace.shared.you(from: post.savers.first(where: \.isYou))
        let sent = await reactions.react(say, you: you, to: post.ref)
        if sent { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
        return sent
    }

    /// Floats at once with your face; kept for whoever watches it next.
    private func react(_ say: LiveSay) {
        guard !reacting, let current, let post = posts.first(where: { $0.key == current }) else { return }
        reacting = true
        reactNote = nil
        let you = YourFace.shared.you(from: post.savers.first(where: \.isYou))
        Task {
            let sent = await reactions.react(say, you: you, to: post.ref)
            reacting = false
            if sent {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                if case .text(let text) = say, words.trimmingCharacters(in: .whitespacesAndNewlines) == text { words = "" }
                typing = false
                picking = false
            } else {
                reactNote = "Couldn’t send that. Try again."
                UIAccessibility.post(notification: .announcement, argument: reactNote)
            }
        }
    }

    /// A short message near the top.
    private func say(_ text: String) {
        toastTask?.cancel()
        toast = text
        toastTask = Task {
            try? await Task.sleep(nanoseconds: 3_000_000_000)
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
    var extras = PlayerExtras()
    let say: (String) -> Void
    var openFriend: (Saver) -> Void = { _ in }
    /// Opens the send sheet for this post's file.
    var send: (PhonePost) -> Void = { _ in }
    /// A photo's time ran out: on to the next post.
    var advance: () -> Void = {}
    /// Something plays after this one (else a post that can't play just stays).
    var hasNext = true
    /// Sends a reply to whoever sent this post (a reaction on it).
    var reply: ((LiveSay) async -> Bool)? = nil
    /// The newest answer from someone else on this post, for "Pete replied · 2m".
    var answer: LiveReactionEvent? = nil
    /// Something over the player (the send sheet, Live's picker): photos wait.
    var held = false
    /// Turned sideways: the media whole, and taps only pause.
    var landscape = false
    @Environment(\.openURL) private var openURL
    @ObservedObject private var privacy = PrivacyStore.shared
    @State private var photo = 0
    @State private var saving = false
    @State private var sharingBusy = false
    /// Files or words for the system share sheet (WhatsApp, Messages…).
    @State private var sharing: ShareItems?
    @State private var reading = false
    @State private var more = false
    /// The bookmark is saving it to your ADHX.
    @State private var keeping = false
    /// "In your saves": Just for me and your note, from the bookmark.
    @State private var savedSheet = false
    /// How long the photo on screen has shown, of `PhotoTimer.seconds`.
    @State private var photoTime: Double = 0
    /// Tapped to stay on this photo (like pausing a video).
    @State private var photoPaused = false
    /// The original post: who posted it, their words in full, and the way there.
    @State private var original = false
    /// "Reply to Ana" is up.
    @State private var replying = false
    @State private var replyHold = PlaybackHold()
    /// The face was tapped: the bottom row shows who's on this one.
    @State private var whoOpen = false

    /// Words over a picture get a soft shadow; nothing else does.
    private var overMedia: Bool { post.kind != "text" && post.kind != "article" }

    var body: some View {
        ZStack(alignment: .bottom) {
            Color.black
            stage
            if !clean {
                let scrubbing = onScreen && playback.scrubTime != nil
                if overMedia && !scrubbing {
                    // The boards' scrims: dark under the top bar, darker under the words.
                    VStack(spacing: 0) {
                        LinearGradient(colors: [.black.opacity(0.7), .clear], startPoint: .top, endPoint: .bottom)
                            .frame(height: 240)
                        Spacer(minLength: 0)
                        LinearGradient(stops: [.init(color: .clear, location: 0),
                                               .init(color: .black.opacity(0.55), location: 0.35),
                                               .init(color: .black.opacity(0.92), location: 1)],
                                       startPoint: .top, endPoint: .bottom)
                            .frame(height: 420 + extras.bottomInset)
                    }
                    .allowsHitTesting(false)
                }
                if !scrubbing {
                    caption
                        // Above the bottom row (44 tall, 30 up: clear of the home bar).
                        .padding(.bottom, 92 + extras.bottomInset)
                        .transition(.opacity)
                }
                if scrubbing, let at = playback.scrubTime {
                    // Big and centred: a bubble under the finger would be hidden by it.
                    (Text(clock(at)).font(Theme.sans(34, .bold).monospacedDigit())
                        + Text("  / \(clock(playback.duration))").font(Theme.sans(17, .bold).monospacedDigit())
                            .foregroundColor(Theme.cream))
                        .foregroundStyle(.white)
                        .overMediaShadow(true)
                        .padding(.bottom, 110)
                        .frame(maxWidth: .infinity)
                        .accessibilityHidden(true)
                }
                bottomRow
                    .padding(.horizontal, 16)
                    .padding(.bottom, 30)
            } else if (post.kind == "video" || post.kind == "photo") && onScreen {
                ProgressLine(fraction: post.kind == "photo" ? photoFraction
                                : playback.duration > 0 ? playback.time / playback.duration : 0,
                             colour: extras.progressColour)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 16)
            }
        }
        .clipped()
        .sheet(item: $sharing) { share in
            ActivitySheet(items: share.items, onComplete: { share.export?.cleanup() })
                .presentationDetents([.medium, .large])
        }
        .onChange(of: replying) { _, open in
            // The video waits while you answer, so the reply lands on this post.
            if open {
                guard post.plays, onScreen else { return }
                replyHold.open(post: post.key, playing: !playback.paused)
                playback.stop()
            } else if replyHold.close(post: onScreen ? post.key : nil) {
                playback.resume()
            }
        }
        .sheet(isPresented: $replying) {
            if let sender = WhyChip.face(post), let reply {
                ReplySheet(sender: sender, server: server,
                           note: post.savers.first { $0.username == sender.username }?.note,
                           send: { what in
                               let sent = await reply(what)
                               if sent { replying = false; say("Sent to \(sender.displayName)") }
                               return sent
                           })
                    .presentationDetents([.height(340)])
                    .presentationDragIndicator(.visible)
                    .frostedSheet()
            }
        }
        .sheet(isPresented: $more) {
            MoreSheet(post: post, server: server, say: say, onWhy: extras.onWhy.map { open in { open(post) } },
                      playback: post.plays && onScreen ? playback : nil,
                      hide: { clean = true }, saveToPhone: hasMedia ? { save() } : nil)
                .presentationDetents([.height(moreHeight)])
                .presentationDragIndicator(.visible)
                .frostedSheet()
        }
        .uprightWhile(more || savedSheet || sharing != nil || reading || original)
        // The next post starts with the line back.
        .onChange(of: onScreen) { _, now in if !now { whoOpen = false } }
        .sheet(isPresented: $original) {
            OriginalSheet(post: post, server: server, say: say)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
                .frostedSheet()
        }
        .sheet(isPresented: $savedSheet) {
            SavedSheet(post: post, say: say)
                .presentationDetents([.height(privacy.canSwitch(post) ? 300 : 220)])
                .presentationDragIndicator(.visible)
                .frostedSheet()
        }
    }

    @ViewBuilder
    private var stage: some View {
        switch post.kind {
        case "video", "audio":
            ZStack {
                // Full bleed like the boards (the picture covers the screen), or
                // the whole video at its own shape when Fit video is on.
                Poster(url: ADHXClient.resolve(post.posterUrl, against: server), fill: !(playback.fitVideo || landscape))
                if onScreen {
                    if post.kind == "video" {
                        PlayerLayerView(player: playback.player, fill: !(playback.fitVideo || landscape)) { playback.attach($0) }
                    }
                    if let spot = playback.resumeOffer {
                        // A long post you left part-way (board 14.2).
                        Color.black.opacity(0.45).allowsHitTesting(false)
                        ResumeCard(spot: spot, resume: playback.acceptResume, startOver: playback.startOver)
                            // Above the rail of buttons on the right.
                            .padding(.bottom, 240)
                    } else if playback.problem != nil || !playback.ready {
                        // Still being kept on your ADHX: an animated card until it's ready.
                        PreparingOverlay(post: post, playback: playback, next: hasNext ? advance : nil, removed: {
                            say("Removed from your saves")
                        })
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
            .tapOrHold(tap: { if clean && !landscape { clean = false } else { playback.togglePause() } }, hold: hideChrome)
            .accessibilityAddTraits(.isButton)
            .accessibilityLabel(clean ? "Show buttons and caption" : playback.paused ? "Play" : "Pause")
            .accessibilityAction(named: "Hide buttons and caption") { hideChrome() }
        case "photo":
            ZStack {
                Album(urls: post.media.compactMap { ADHXClient.resolve($0.url, against: server) }, page: $photo)
                if photoPaused && onScreen {
                    Image(systemName: "play.fill")
                        .font(.system(size: 32))
                        .foregroundStyle(.white)
                        .frame(width: 76, height: 76)
                        .background(Circle().fill(.black.opacity(0.5)))
                        .allowsHitTesting(false)
                }
            }
            .tapOrHold(tap: { if clean && !landscape { clean = false } else { photoPaused.toggle() } }, hold: hideChrome)
            .accessibilityAction(named: photoPaused ? "Play" : "Pause") { photoPaused.toggle() }
            .accessibilityAction(named: "Hide buttons and caption") { hideChrome() }
            .task(id: photoTimerKey) { await runPhotoTimer() }
            .onChange(of: photo) { _, _ in photoTime = 0 }
            .onChange(of: onScreen) { _, now in
                if !now {
                    photoTime = 0
                    photoPaused = false
                }
            }
        default:
            WordsCard(post: post) { reading = true }
                .contentShape(Rectangle())
                .tapOrHold(tap: { if clean { clean = false } }, hold: hideChrome)
                .accessibilityAction(named: "Hide buttons and caption") { hideChrome() }
                .sheet(isPresented: $reading) { ReaderView(post: post) }
        }
    }

    /// Hold the picture: everything but the media goes; a tap brings it back.
    private func hideChrome() {
        guard !clean else { return }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        clean = true
    }

    /// The photo timer runs while this photo is on screen and nothing is over it.
    private var photoTimerKey: String {
        let running = onScreen && !photoPaused && !held && !more && !savedSheet && sharing == nil && !replying
        // Repeat switched on after the last post's time ran out starts it again.
        return "\(running)-\(photo)-\(playback.repeatOne)"
    }

    /// Photos move on by themselves, `PhotoTimer.seconds` each: the next photo
    /// in an album, then the next post.
    private func runPhotoTimer() async {
        guard onScreen, !photoPaused, !held, !more, !savedSheet, sharing == nil, !replying else { return }
        let step = 0.1
        while !Task.isCancelled {
            try? await Task.sleep(nanoseconds: UInt64(step * 1_000_000_000))
            guard !Task.isCancelled else { return }
            photoTime += step
            guard photoTime >= PhotoTimer.seconds else { continue }
            photoTime = 0
            switch PhotoTimer.next(page: photo, count: post.media.count, repeatOne: playback.repeatOne) {
            case .page(let page) where page == photo:
                // One photo on repeat: round again (the key doesn't change).
                continue
            case .page(let page): withAnimation(.easeInOut(duration: 0.3)) { photo = page }
            case .post: advance()
            }
            return
        }
    }

    /// How far through the post's photos the timer is, for the line at the bottom.
    private var photoFraction: Double {
        let count = max(post.media.count, 1)
        return min((Double(photo) + photoTime / PhotoTimer.seconds) / Double(count), 1)
    }

    /// The More sheet grows with what it offers.
    private var moreHeight: CGFloat {
        var height: CGFloat = post.kind == "video" ? 400 : 330
        if post.plays && onScreen { height += 72 }
        if post.sourceUrl != nil { height += 64 }
        if privacy.canSwitch(post) { height += 72 }
        if extras.onWhy != nil { height += 64 }
        return height
    }

    /// Left: Live's moment, an answer to you, and the one reason faces can't
    /// say ("Ana sent you this", For you's "Like … you kept"). Right: the
    /// rail of round frosted buttons; the network's mark opens the original
    /// post. Who saved it is the face on the bottom row; notes float up.
    private var caption: some View {
        HStack(alignment: .bottom, spacing: 0) {
            VStack(alignment: .leading, spacing: 0) {
                if let moment = extras.inMoment {
                    HStack(spacing: 6) {
                        Text("In").foregroundStyle(Theme.muted)
                        Text(moment).font(Theme.sans(12, .heavy))
                    }
                    .font(Theme.sans(12, .semibold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .padding(.horizontal, 10)
                    .frame(height: 26)
                    .frosted(Capsule(), dim: 0.45)
                    .padding(.bottom, 8)
                    .accessibilityElement(children: .combine)
                }
                if let answer {
                    // Someone answered a post you sent or saved (board 14.7).
                    RepliedChip(reaction: answer, server: server)
                        .padding(.bottom, 10)
                }
                if let why = post.why, let onWhy = extras.onWhy, WhyChip.facesCantSay(post) {
                    HStack(spacing: 8) {
                        WhyChip(text: why, kind: post.whyReasons.first?.kind,
                                face: WhyChip.face(post), server: server) { onWhy(post) }
                        // A post someone sent you can be answered (board 14.5).
                        if WhyChip.face(post) != nil, reply != nil { ReplyButton { replying = true } }
                    }
                } else if privacy.isPrivate(post) {
                    PrivateLock()
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.trailing, 84 - 12 - 52)

            rail
        }
        .padding(.leading, 16)
        .padding(.trailing, 12)
    }

    /// Round frosted buttons, 52 across: React, Save, Share, the network, More.
    private var rail: some View {
        VStack(spacing: extras.railSpacing) {
            if let react = extras.react, onScreen {
                RailButton(on: react.isOpen, accessibility: react.isOpen ? "Close reactions" : "React") {
                    react.toggle()
                } icon: {
                    Image(systemName: "face.smiling")
                        .font(.system(size: 22, weight: .regular))
                }
                .accessibilityAddTraits(react.isOpen ? .isSelected : [])
            }
            if privacy.isSaved(post) || post.sourceUrl != nil {
                let saved = privacy.isSaved(post)
                RailButton(accessibility: saved ? "In your saves" : "Save to your ADHX") {
                    keep()
                } icon: {
                    if keeping {
                        RingSpinner().frame(width: 20, height: 20)
                    } else {
                        Image(systemName: saved ? "bookmark.fill" : "bookmark")
                            .font(.system(size: 20, weight: .regular))
                            .foregroundStyle(saved ? Theme.accent : Theme.ink)
                    }
                }
                .accessibilityHint(saved ? "Just for me and your note" : "")
                .accessibilityAddTraits(saved ? .isSelected : [])
            }
            if hasMedia || !post.text.isEmpty {
                RailButton(accessibility: hasMedia ? "Share the \(post.kind == "photo" ? "photos" : post.kind == "video" ? "video" : "file")" : "Share the words") {
                    share()
                } icon: {
                    if sharingBusy {
                        RingSpinner().frame(width: 20, height: 20)
                    } else {
                        Image(systemName: shareIcon)
                            .font(.system(size: 20, weight: .regular))
                    }
                }
            }
            // The network's own mark: who posted it and their words, in full.
            RailButton(accessibility: "The original post on \(Network.name(post.platform))") {
                original = true
            } icon: {
                NetworkMark(platform: post.platform, size: 22, color: Color(hex: 0xF4F1EA))
            }
            .accessibilityHint("Who posted it, and everything they wrote")
            RailButton(accessibility: "More for this post") {
                more = true
            } icon: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 20, weight: .bold))
            }
        }
        .frame(width: 52)
    }

    /// The bottom row (board 15.7): the first saver's face, the line (drag it
    /// to move through a video) and where you are. Tapping the face swaps it
    /// for who's on this one (15.9) until ✕ or the next post.
    @ViewBuilder
    private var bottomRow: some View {
        if whoOpen {
            WhoRow(post: post, server: server, close: { whoOpen = false }, openFriend: openFriend)
                .frame(height: 44)
                .transition(.opacity)
        } else {
            HStack(spacing: 12) {
                FirstSaverButton(savers: post.savers, server: server) { whoOpen = true }
                line
                    .frame(maxWidth: .infinity)
                if let count = extras.count?(post) {
                    CountPill(count: count)
                }
            }
            .frame(height: 44)
            .transition(.opacity)
        }
    }

    /// The video's line you drag, or how far through the photos the timer is.
    @ViewBuilder
    private var line: some View {
        if post.plays, onScreen, playback.duration > 0 {
            Scrubber(playback: playback, colour: extras.progressColour)
                .animation(.easeOut(duration: 0.15), value: playback.scrubTime != nil)
        } else if post.plays {
            // The track is there before the video is: no jump when it starts.
            ProgressLine(fraction: 0, colour: extras.progressColour, handle: true)
        } else if post.kind == "photo" {
            ProgressLine(fraction: onScreen ? photoFraction : 0, colour: extras.progressColour, handle: true)
        } else {
            Spacer(minLength: 0)
        }
    }

    /// The file the Save button keeps: the video, or the photo on screen.
    /// Share shows what it sends: the video, the photos, the sound or the words.
    private var shareIcon: String {
        guard hasMedia else { return "text.quote" }
        switch post.kind {
        case "video": return "video"
        case "audio": return "waveform"
        case "photo": return post.media.count > 1 ? "photo.stack" : "photo"
        default: return "square.and.arrow.up"
        }
    }

    /// A video, sound or photos your ADHX keeps (anything else is words).
    private var hasMedia: Bool { !KeptFiles.sources(of: post, server: server).isEmpty }

    /// The bookmark: someone else's post goes into your saves; one of yours
    /// opens "In your saves" (Just for me and your note).
    private func keep() {
        if privacy.isSaved(post) {
            savedSheet = true
            return
        }
        guard !keeping else { return }
        keeping = true
        Task {
            do {
                try await privacy.save(post)
                say("Saved to your ADHX")
            } catch let error as APIError {
                say(error.message)
            } catch {
                say("Couldn’t save that. Try again.")
            }
            keeping = false
        }
    }

    /// Save to phone (in More): the media to Photos (a sound to Files,
    /// through the share sheet), or the words to the clipboard.
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
        send(post)
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
    /// "Why this one" (the feed): opens the why sheet.
    var onWhy: (() -> Void)?
    /// The video or sound on screen: Sound, Fit, Repeat and Dock.
    var playback: Playback?
    /// Hides the buttons and caption.
    var hide: () -> Void = {}
    /// The video or photo to Photos (a sound through the share sheet).
    var saveToPhone: (() -> Void)?
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @ObservedObject private var privacy = PrivacyStore.shared
    @State private var switching = false
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
            if let playback {
                PlayingControls(playback: playback, say: say, hide: {
                    dismiss()
                    hide()
                })
            }
            VStack(spacing: 4) {
                if privacy.canSwitch(post) {
                    JustForMeSwitch(isOn: privacy.isPrivate(post), busy: switching) { on in
                        switching = true
                        Task {
                            do {
                                try await privacy.set(post, private: on)
                                say(on ? "Just for you now" : "Your people can see it now")
                            } catch {
                                say("Couldn’t change that. Try again.")
                            }
                            switching = false
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.bottom, 8)
                }
                if let onWhy {
                    row(icon: "sparkles", title: "Why this one", detail: "The reasons, and whose saves you see") {
                        dismiss()
                        // After the sheet has gone, so the next one can come up.
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) { onWhy() }
                    }
                }
                if let open = ADHXClient.resolve(post.openPath, against: server) {
                    row(icon: "person.2", title: "Share an ADHX link",
                        detail: "For people on your ADHX: opens this post there") {
                        sharing = SharedFile(url: open)
                    }
                }
                if let source = post.sourceUrl, let url = URL(string: source) {
                    Button {
                        openURL(url)
                        dismiss()
                    } label: {
                        rowFace(title: "Open the original", detail: "On \(Network.name(post.platform))") {
                            NetworkMark(platform: post.platform, size: 20)
                        }
                    }
                    .buttonStyle(.plain)
                }
                if let source = post.sourceUrl {
                    row(icon: "link", title: "Copy link", detail: "The original post on \(Network.name(post.platform))") {
                        UIPasteboard.general.string = source
                        dismiss()
                        say("Link copied")
                    }
                }
                if let saveToPhone {
                    row(icon: "arrow.down.to.line", title: "Save to phone",
                        detail: post.kind == "audio" ? "To Files, or wherever you share it" : "To Photos") {
                        dismiss()
                        saveToPhone()
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
        // Video sizes are named by the short side: an upright 720×1280 is 720p.
        if post.kind == "video", let media = post.media.first {
            let sides = [media.width, media.height].compactMap { $0 }.filter { $0 > 0 }
            if let short = sides.min() { parts.append("\(short)p") }
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

/// "In your saves", from the bookmark on one of yours: Just for me, and the
/// note your people see with it.
private struct SavedSheet: View {
    let post: PhonePost
    let say: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var privacy = PrivacyStore.shared
    @State private var switching = false
    @State private var note = ""
    @State private var savingNote = false
    @FocusState private var typing: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("In your saves")
                    .font(Theme.serif(32))
                    .foregroundStyle(Theme.ink)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: 0)
                CloseButton { dismiss() }
            }
            if privacy.canSwitch(post) {
                JustForMeSwitch(isOn: privacy.isPrivate(post), busy: switching) { on in
                    switching = true
                    Task {
                        do {
                            try await privacy.set(post, private: on)
                            say(on ? "Just for you now" : "Your people can see it now")
                        } catch {
                            say("Couldn’t change that. Try again.")
                        }
                        switching = false
                    }
                }
            }
            VStack(alignment: .leading, spacing: 6) {
                Text("Your note")
                    .font(Theme.sans(13, .semibold))
                    .foregroundStyle(Theme.muted)
                    .accessibilityHidden(true)
                HStack(spacing: 8) {
                    TextField("", text: $note,
                              prompt: Text(privacy.isPrivate(post) ? "A note to future you" : "Say why they’ll like it")
                                  .foregroundColor(Theme.faint))
                        .font(Theme.sans(16))
                        .foregroundStyle(Theme.ink)
                        .tint(Theme.accent)
                        .focused($typing)
                        .submitLabel(.done)
                        .onSubmit(saveNote)
                        .onChange(of: note) { _, text in if text.count > 140 { note = String(text.prefix(140)) } }
                        .padding(.horizontal, 16)
                        .frame(height: 48)
                        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Theme.app))
                        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .strokeBorder(typing ? Theme.accent.opacity(0.6) : .white.opacity(0.12), lineWidth: 1))
                        .accessibilityLabel("Your note")
                    Button(savingNote ? "Saving…" : "Save", action: saveNote)
                        .buttonStyle(PillButtonStyle(kind: .primary, height: 48, fullWidth: false, fontSize: 15))
                        .disabled(noteUnchanged)
                        .opacity(noteUnchanged ? 0.5 : 1)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 20)
        .padding(.top, 29)
        .onAppear { note = privacy.note(post) ?? "" }
    }

    private var noteUnchanged: Bool { savingNote || Saver.clean(note) == privacy.note(post) }

    private func saveNote() {
        guard !noteUnchanged else { return }
        savingNote = true
        typing = false
        Task {
            do {
                try await privacy.setNote(post, Saver.clean(note))
                say(Saver.clean(note) == nil ? "Note cleared" : "Note saved")
                dismiss()
            } catch {
                say("Couldn’t save the note. Try again.")
            }
            savingNote = false
        }
    }
}

/// Sound, Fit, Repeat, Dock and Hide, for the video on screen (More).
private struct PlayingControls: View {
    @ObservedObject var playback: Playback
    let say: (String) -> Void
    let hide: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            toggle(playback.muted ? "Sound off" : "Sound on",
                   icon: playback.muted ? "speaker.slash.fill" : "speaker.wave.2.fill",
                   on: !playback.muted,
                   accessibility: playback.muted ? "Turn sound on for every video" : "Turn sound off") {
                playback.setSound(playback.muted)
                say(playback.muted ? "Sound off" : "Sound on for every video")
            }
            toggle("Fit video", icon: "aspectratio", on: playback.fitVideo,
                   accessibility: playback.fitVideo ? "Fill the screen" : "Fit the whole video") {
                playback.setFitVideo(!playback.fitVideo)
                say(playback.fitVideo ? "Videos fit the screen whole" : "Videos fill the screen")
            }
            toggle("Repeat", icon: "repeat.1", on: playback.repeatOne, accessibility: "Repeat this one") {
                playback.repeatOne.toggle()
                say(playback.repeatOne ? "Repeating this one" : "Plays the next save when this ends")
            }
            if playback.pipSupported {
                toggle("Dock", icon: "pip.enter", on: false,
                       accessibility: "Dock the video and keep it playing") {
                    if playback.pipPossible {
                        playback.startSmallWindow()
                    } else {
                        say("The dock isn’t ready yet. Try again in a moment.")
                    }
                }
            }
            toggle("Hide", icon: "arrow.up.left.and.arrow.down.right", on: false,
                   accessibility: "Hide buttons and caption") { hide() }
        }
    }

    private func toggle(_ title: String, icon: String, on: Bool, accessibility: String,
                        action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 18, weight: .semibold))
                Text(title)
                    .font(Theme.sans(12, .bold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .foregroundStyle(on ? .black : Theme.cream)
            .frame(maxWidth: .infinity, minHeight: 64)
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(on ? Theme.accent : Theme.raised))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibility)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

/// "Saved together ›": why the feed picked this one. Opens the why sheet.
private struct WhyChip: View {
    let text: String
    var kind: String?
    /// "Pete sent you this": the sender's face instead of the icon.
    var face: Saver?
    var server: URL?
    let action: () -> Void

    /// The reasons the faces on the bottom row can't say: who sent it to you,
    /// and For you's "Like … you kept". The rest ("Saved together", "Ana
    /// saved this") is the face and its "+1".
    static func facesCantSay(_ post: PhonePost) -> Bool {
        guard let kind = post.whyReasons.first?.kind else { return false }
        return kind == "sent" || kind == "like"
    }

    /// Who sent it, when that's why it's here.
    static func face(_ post: PhonePost) -> Saver? {
        guard let lead = post.whyReasons.first, lead.kind == "sent", let username = lead.username else { return nil }
        return post.savers.first { $0.username == username } ?? Saver(username: username)
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if let face {
                    Face(saver: face, server: server, size: 24, ring: .clear)
                } else {
                    Image(systemName: WhySheet.icon(for: kind ?? "fresh"))
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Theme.accent)
                        .frame(width: 18, height: 18)
                }
                Text(text)
                    .lineLimit(1)
                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Theme.muted)
            }
            .font(Theme.sans(14, .bold))
            .foregroundStyle(Color(hex: 0xF4F1EA))
            .padding(.leading, 10)
            .padding(.trailing, 14)
            .frame(height: 40)
            .frosted(Capsule(), dim: 0.55)
            .overlay(Capsule().strokeBorder(.white.opacity(0.14), lineWidth: 1))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Why this one: \(text)")
        .accessibilityHint("Shows the reasons and whose saves you see")
    }
}

/// The note bubble's tail: the lower corner of the boards' 14 pt square turned
/// 45° (a right angle pointing down at the byline), its tip softened.
private struct NoteTail: Shape {
    func path(in rect: CGRect) -> Path {
        // Sides at 45°: as tall as half its width.
        let tip = CGPoint(x: rect.midX, y: rect.minY + rect.width / 2)
        let soft: CGFloat = 1.5
        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
        path.addLine(to: CGPoint(x: tip.x + soft, y: tip.y - soft))
        path.addQuadCurve(to: CGPoint(x: tip.x - soft, y: tip.y - soft), control: tip)
        path.closeSubpath()
        return path
    }
}

/// The player has a sheet of its own up (Home's bar steps aside).
/// The player is showing a short message near the top.
struct PlayerToastUp: PreferenceKey {
    static var defaultValue = false
    static func reduce(value: inout Bool, nextValue: () -> Bool) { value = value || nextValue() }
}

struct PlayerSheetUp: PreferenceKey {
    static var defaultValue = false
    static func reduce(value: inout Bool, nextValue: () -> Bool) { value = value || nextValue() }
}

/// Files or words for the share sheet, from the player's rail.
private struct ShareItems: Identifiable {
    let id = UUID()
    let items: [Any]
    var export: KeptFiles.Export? = nil
}

private struct SharedFile: Identifiable {
    let url: URL
    var id: URL { url }
}

/// The system share sheet, for a file or a link.
struct ActivitySheet: UIViewControllerRepresentable {
    let items: [Any]
    var onComplete: (() -> Void)? = nil
    func makeUIViewController(context: Context) -> UIActivityViewController {
        let controller = UIActivityViewController(activityItems: items, applicationActivities: nil)
        // UIKit calls this after the activity finishes or the sheet is dismissed.
        // Retain the export in the closure until the consumer has finished.
        controller.completionWithItemsHandler = { _, _, _, _ in onComplete?() }
        return controller
    }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

/// The line to drag through a video. At rest a thin line with a small dot;
/// while dragging it thickens and the time shows big in the middle.
private struct Scrubber: View {
    @ObservedObject var playback: Playback
    var colour: Color = Theme.ink

    var body: some View {
        GeometryReader { box in
            let length = max(playback.duration, 0.1)
            let at = playback.scrubTime ?? playback.time
            let fraction = CGFloat(min(max(at / length, 0), 1))
            let dragging = playback.scrubTime != nil
            let thickness: CGFloat = dragging ? 6 : 4
            let thumb: CGFloat = dragging ? 20 : 14
            ZStack(alignment: .leading) {
                Capsule().fill(.white.opacity(0.25)).frame(height: thickness)
                Capsule().fill(dragging ? Theme.accent : colour)
                    .frame(width: box.size.width * fraction, height: thickness)
                // Always there, so the line reads as something to drag.
                Circle().fill(dragging ? Theme.accent : colour)
                    .frame(width: thumb, height: thumb)
                    .shadow(color: .black.opacity(0.5), radius: 2, y: 1)
                    .offset(x: box.size.width * fraction - thumb / 2)
            }
            // Through the middle of the row's 44-point touch area.
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

/// How far through: the bottom row's line for photos (with the handle), and
/// the thin line left when the buttons are hidden.
private struct ProgressLine: View {
    let fraction: Double
    var colour: Color = Theme.ink
    /// The bottom row's look: a 4-point track and its round handle.
    var handle = false
    var body: some View {
        GeometryReader { geo in
            let at = geo.size.width * min(max(fraction, 0), 1)
            ZStack(alignment: .leading) {
                Capsule().fill(.white.opacity(handle ? 0.25 : 0.22))
                Capsule().fill(colour).frame(width: at)
                if handle {
                    Circle().fill(colour)
                        .frame(width: 14, height: 14)
                        .shadow(color: .black.opacity(0.5), radius: 2, y: 1)
                        .offset(x: at - 7)
                }
            }
            .frame(height: handle ? 4 : 3)
            .frame(maxHeight: .infinity)
        }
        .frame(height: handle ? 44 : 3)
        .accessibilityHidden(true)
    }
}

extension View {
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

/// A round frosted button in the player's rail, 52 across. Yellow ring when on (React).
private struct RailButton<Icon: View>: View {
    var on = false
    let accessibility: String
    let action: () -> Void
    @ViewBuilder let icon: () -> Icon

    var body: some View {
        Button(action: action) {
            icon()
                .foregroundStyle(on ? Theme.accent : Color(hex: 0xF4F1EA))
                .frame(width: 52, height: 52)
                .frosted(Circle(), dim: on ? 0.6 : 0.45)
                .overlay(Circle().strokeBorder(Theme.accent, lineWidth: on ? 2 : 0))
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibility)
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
        if urls.count == 1, let url = urls.first {
            // One photo needs no pager: a page view in the vertical feed can
            // swallow the up and down swipes that move to the next save.
            photo(url)
                .accessibilityLabel("Photo")
        } else {
            TabView(selection: $page) {
                ForEach(Array(urls.enumerated()), id: \.offset) { index, url in
                    photo(url)
                        .tag(index)
                        .accessibilityLabel("Photo \(index + 1) of \(urls.count)")
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .always))
        }
    }

    private func photo(_ url: URL) -> some View {
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
                if let body = article.body, !body.isEmpty {
                    ArticleBody(markdown: body, reading: reading)
                } else if let description = article.description, !description.isEmpty {
                    Text(description)
                        .font(Theme.sans(17))
                        .foregroundStyle(Theme.muted)
                }
            }
            if !post.text.isEmpty, post.article?.body?.isEmpty ?? true {
                Text(LinkedText.attributed(post.text))
                    .font(font)
                    .tint(Theme.accent)
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


extension View {
    /// A tap, or a hold (a hold never also counts as a tap).
    func tapOrHold(tap: @escaping () -> Void, hold: @escaping () -> Void) -> some View {
        gesture(
            LongPressGesture(minimumDuration: 0.35)
                .onEnded { _ in hold() }
                .exclusively(before: TapGesture().onEnded { tap() })
        )
    }
}

/// A kept X article, whole: headings, paragraphs, lists and quotes from its
/// markdown, with bold, italics and links inline. Pictures are left out (the
/// words are what's kept).
private struct ArticleBody: View {
    let markdown: String
    var reading = false

    private enum Block: Hashable {
        case heading(String, Int)
        case paragraph(String)
        case quote(String)
        case rule
    }

    private var blocks: [Block] {
        var out: [Block] = []
        var paragraph: [String] = []
        func flush() {
            if !paragraph.isEmpty { out.append(.paragraph(paragraph.joined(separator: "\n"))); paragraph = [] }
        }
        for raw in markdown.components(separatedBy: "\n") {
            let line = raw.trimmingCharacters(in: .whitespaces)
            if line.isEmpty { flush(); continue }
            if line.hasPrefix("![") { continue }
            if line == "---" || line == "***" { flush(); out.append(.rule); continue }
            if line.hasPrefix("#") {
                flush()
                let level = line.prefix(while: { $0 == "#" }).count
                out.append(.heading(String(line.dropFirst(level)).trimmingCharacters(in: .whitespaces), level))
                continue
            }
            if line.hasPrefix(">") {
                flush()
                out.append(.quote(String(line.dropFirst()).trimmingCharacters(in: .whitespaces)))
                continue
            }
            paragraph.append(line.hasPrefix("- ") || line.hasPrefix("* ") ? "•  " + line.dropFirst(2) : line)
        }
        flush()
        return out
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                switch block {
                case .heading(let words, let level):
                    Text(inline(words))
                        .font(level <= 1 ? Theme.serif(reading ? 30 : 26) : Theme.sans(reading ? 20 : 18, .heavy))
                        .foregroundStyle(.white)
                        .padding(.top, 4)
                case .paragraph(let words):
                    Text(inline(words))
                        .font(Theme.sans(reading ? 18 : 16))
                        .foregroundStyle(Theme.cream)
                        .lineSpacing(5)
                case .quote(let words):
                    Text(inline(words))
                        .font(Theme.serif(reading ? 24 : 21))
                        .foregroundStyle(Theme.cream)
                        .padding(.leading, 14)
                        .overlay(alignment: .leading) { Capsule().fill(Theme.accent).frame(width: 3) }
                case .rule:
                    Rectangle().fill(Theme.hairline).frame(height: 1)
                }
            }
        }
        .tint(Theme.accent)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// **bold**, *italics* and [links](…), kept as written otherwise.
    private func inline(_ words: String) -> AttributedString {
        let text = LinkedText.decodeEntities(words)
        let options = AttributedString.MarkdownParsingOptions(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        return (try? AttributedString(markdown: text, options: options)) ?? AttributedString(text)
    }
}

/// The original post, from the rail's network button: who posted it and
/// when, everything they wrote (a kept article in full), and the way to it.
private struct OriginalSheet: View {
    let post: PhonePost
    let server: URL
    let say: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL

    private var network: String { Network.name(post.platform) }

    /// Their name, else their handle; nil when neither says more than the network.
    private var who: String? {
        let name = post.author.name?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let picked = name.isEmpty ? post.author.handle : name
        if picked.isEmpty || picked.count <= 1 || picked.caseInsensitiveCompare(network) == .orderedSame { return nil }
        return picked
    }

    private var handle: String? {
        let raw = post.author.handle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !raw.isEmpty, raw.caseInsensitiveCompare(network) != .orderedSame else { return nil }
        let at = raw.hasPrefix("@") ? raw : "@\(raw)"
        return at.dropFirst().caseInsensitiveCompare(who ?? "") == .orderedSame ? nil : at
    }

    private var posted: String? {
        guard let iso = post.postedAt, let date = Format.parseISO(iso) else { return nil }
        return date.formatted(date: .abbreviated, time: .omitted)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HStack(alignment: .center, spacing: 12) {
                    avatar
                    VStack(alignment: .leading, spacing: 3) {
                        Text(who ?? network)
                            .font(Theme.sans(17, .heavy))
                            .foregroundStyle(Theme.ink)
                            .lineLimit(1)
                        HStack(spacing: 6) {
                            // The network's mark shows once: here only when their picture leads.
                            if avatarURL != nil {
                                NetworkMark(platform: post.platform, size: 13, color: Theme.muted)
                            }
                            Text([handle, posted.map { "Posted \($0)" } ?? network].compactMap { $0 }.joined(separator: " · "))
                                .font(Theme.sans(13))
                                .foregroundStyle(Theme.muted)
                                .lineLimit(1)
                        }
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
                .accessibilityElement(children: .contain)

                if post.article != nil || !post.text.isEmpty {
                    Words(post: post, reading: true)
                        .textSelection(.enabled)
                } else {
                    Text("No words with this one, just the \(post.kind == "photo" ? "picture" : post.kind == "audio" ? "sound" : "video").")
                        .font(Theme.sans(15))
                        .foregroundStyle(Theme.muted)
                }

                if let source = post.sourceUrl.flatMap(URL.init(string:)) {
                    VStack(spacing: 10) {
                        Button {
                            openURL(source)
                            dismiss()
                        } label: {
                            HStack(spacing: 8) {
                                NetworkMark(platform: post.platform, size: 18, color: .black)
                                Text("Open on \(network)")
                            }
                        }
                        .buttonStyle(PillButtonStyle(kind: .primary))
                        Button {
                            UIPasteboard.general.url = source
                            say("Link copied")
                            dismiss()
                        } label: {
                            Text("Copy link")
                        }
                        .buttonStyle(PillButtonStyle(kind: .outline))
                    }
                    .padding(.top, 4)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 24)
            .padding(.bottom, 24)
        }
        .scrollBounceBehavior(.basedOnSize)
    }

    /// Their picture on the network, when it came with the post (X does; most don't).
    private var avatarURL: URL? { ADHXClient.resolve(post.author.avatarUrl, against: server) }

    @ViewBuilder
    private var avatar: some View {
        Group {
            if let url = avatarURL {
                AsyncImage(url: url) { phase in
                    if let image = phase.image { image.resizable().scaledToFill() } else { mark }
                }
            } else {
                mark
            }
        }
        .frame(width: 48, height: 48)
        .clipShape(Circle())
        .accessibilityHidden(true)
    }

    private var mark: some View {
        Circle().fill(Theme.raised).overlay(NetworkMark(platform: post.platform, size: 22, color: Theme.ink))
    }
}
