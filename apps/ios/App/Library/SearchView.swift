import SwiftUI

/// Search by meaning: words, pictures and what's in videos, through everyone's
/// saves or just yours. Tapping a result plays the results from there.
struct SearchView: View {
    @ObservedObject var library: LibraryModel
    let server: URL
    @Environment(\.dismiss) private var dismiss
    @FocusState private var focused: Bool
    @State private var playing: PlayerStart?

    private static let prompts = [
        "that video with the squirrel",
        "something about being tired after work",
        "tiny animations that make an app feel nicer",
        "a synth you play by typing",
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 4) {
                Button { dismiss() } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(Theme.ink)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("Back")
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(focused || !library.query.isEmpty ? Theme.accent : Theme.inkFaint)
                    TextField(
                        "",
                        text: $library.query,
                        prompt: Text("Describe what you’re looking for").foregroundColor(Theme.inkFaint)
                    )
                    .font(Theme.sans(16, .semibold))
                    .foregroundStyle(Theme.ink)
                    .tint(Theme.accent)
                    .focused($focused)
                    .submitLabel(.search)
                    .onSubmit { library.searchNow() }
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    if !library.query.isEmpty {
                        Button {
                            library.query = ""
                        } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundStyle(Theme.inkSoft)
                                .frame(width: 34, height: 34)
                                .background(Circle().fill(Theme.plate))
                        }
                        .accessibilityLabel("Clear search")
                    }
                }
                .padding(.leading, 14)
                .padding(.trailing, 6)
                .frame(height: 48)
                .background(Capsule(style: .continuous).fill(Theme.surface))
                .overlay(Capsule(style: .continuous).strokeBorder(lit ? Theme.accent : .white.opacity(0.08), lineWidth: 2))
                .background(Capsule(style: .continuous).stroke(Theme.accent.opacity(lit ? 0.16 : 0), lineWidth: 8))
            }
            .padding(.leading, -10)

            ScopeSwitch(scope: $library.scope)

            tryDescribing

            content
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .background(Theme.bg.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .onAppear { focused = library.query.isEmpty }
        .fullScreenCover(item: $playing) { start in
            PlayerScreen(posts: library.results, server: server, start: start.key,
                         onShow: { index in library.loadMoreSearchIfNeeded(at: index) },
                         queue: QueueInfo(name: "“\(library.query.trimmingCharacters(in: .whitespacesAndNewlines))”",
                                          note: "Best match first, like your search. Each says how it matched.",
                                          chip: PostTile.matchLabel))
        }
    }

    /// The field glows yellow while you're typing or have a search up.
    private var lit: Bool { focused || !library.query.isEmpty }

    /// Ideas, as chips you can tap.
    private var tryDescribing: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("TRY DESCRIBING")
                .font(Theme.sans(12, .heavy))
                .tracking(0.72)
                .foregroundStyle(Theme.inkFaint)
            ScrollView(.horizontal) {
                HStack(spacing: 8) {
                    ForEach(Self.prompts, id: \.self) { prompt in
                        Button {
                            library.query = prompt
                            library.searchNow()
                            focused = false
                        } label: {
                            Text(prompt)
                                .font(Theme.sans(13, .semibold))
                                .foregroundStyle(Theme.ink)
                                .padding(.horizontal, 14)
                                .frame(height: 40)
                                .background(Capsule(style: .continuous).fill(Theme.surface))
                                .overlay(Capsule(style: .continuous).strokeBorder(Theme.accent.opacity(0.4), lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 16)
            }
            .padding(.horizontal, -16)
            .scrollIndicators(.hidden)
        }
    }

    /// "Found it on screen", from how the best result matched.
    private var heading: String {
        switch library.results.first.flatMap({ PostTile.lead($0) }) {
        case "screen": return "Found it on screen"
        case "speech": return "Found it in what’s said"
        case "picture": return "Found it in the picture"
        case "video": return "Found it in the video"
        default: return library.close ? "Found these" : "The nearest"
        }
    }

    @ViewBuilder
    private var content: some View {
        if library.query.trimmingCharacters(in: .whitespaces).isEmpty {
            Spacer(minLength: 0)
        } else if let error = library.searchError {
            Note(text: error)
            Spacer(minLength: 0)
        } else if library.results.isEmpty {
            if library.searching || !library.searched {
                HStack { Spacer(); RingSpinner().frame(width: 30, height: 30); Spacer() }
                    .padding(.top, 40)
            } else {
                Note(text: library.scope == .everyone
                     ? "Nothing in anyone’s saves matches that yet. Try describing it another way."
                     : "Nothing in your saves matches that yet. Try describing it another way.")
            }
            Spacer(minLength: 0)
        } else {
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(heading)
                            .font(Theme.serif(28))
                            .foregroundStyle(Theme.ink)
                            .accessibilityAddTraits(.isHeader)
                        Spacer(minLength: 8)
                        Text(library.resultTotal == 1 ? "1 save" : "\(max(library.resultTotal, library.results.count)) saves")
                            .font(Theme.sans(12))
                            .foregroundStyle(Theme.inkFaint)
                    }
                    .padding(.top, 4)
                    if !library.understood {
                        Note(text: "Still learning your saves: exact words only for now.")
                    } else if !library.close {
                        Note(text: "Nothing close. These are the nearest.")
                    }
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)],
                              spacing: 10) {
                        ForEach(library.results, id: \.key) { post in
                            Button {
                                focused = false
                                playing = PlayerStart(key: post.key)
                            } label: {
                                PostTile(post: post, server: server, height: 250)
                            }
                            .buttonStyle(.plain)
                            .onAppear {
                                if let index = library.results.firstIndex(where: { $0.key == post.key }) {
                                    library.loadMoreSearchIfNeeded(at: index)
                                }
                            }
                        }
                    }
                    if library.loadingMoreSearch {
                        HStack { Spacer(); RingSpinner().frame(width: 26, height: 26); Spacer() }
                    } else if let error = library.searchMoreError {
                        Note(text: error)
                        Button("Try loading more again") {
                            library.loadMoreSearchIfNeeded(at: library.results.count - 1)
                        }
                        .foregroundStyle(Theme.accent)
                    }
                }
                .padding(.bottom, 20)
            }
            .scrollIndicators(.hidden)
            .scrollDismissesKeyboard(.immediately)
            .opacity(library.searching ? 0.6 : 1)
        }
    }
}

/// Which post the player opens on.
struct PlayerStart: Identifiable {
    let key: String
    var id: String { key }
}

/// A queue's name and order for Up next: "Ana’s saves", newest first.
struct QueueInfo {
    let name: String
    let note: String
    /// How a post matched, for a search.
    var chip: (PhonePost) -> String? = { _ in nil }
}

/// The player over everything, with a way back.
struct PlayerScreen: View {
    let posts: [PhonePost]
    let server: URL
    let start: String
    var onShow: (Int) -> Void = { _ in }
    /// A From everyone channel: its name and "Keep this channel" on top.
    var group: GroupChannelRef? = nil
    /// The reactions feed: each post floats its reactions every time.
    var replayReactions = false
    /// A queue that says where you are ("Reactions · 1 of 12"), beside Close.
    var position: ((Int) -> String)? = nil
    /// Closing when it wasn't presented by SwiftUI ("Open in ADHX").
    var onClose: (() -> Void)? = nil
    /// Repeat on from the start ("Open in ADHX" on the share card).
    var startRepeating = false
    /// A channel or a search: "3 of 24" on the bottom row opens Up next.
    var queue: QueueInfo? = nil
    @Environment(\.dismiss) private var dismiss
    @State private var clean = false
    @State private var scrubbing = false
    @State private var index = 0
    @State private var jumpTo: String?
    @State private var upNext = false
    /// Posts left behind while this player has been up (Up next dims them).
    @State private var watched: Set<String> = []

    var body: some View {
        PlayerView(posts: posts, server: server, clean: $clean, scrubbing: $scrubbing, jumpTo: $jumpTo, start: start,
                   extras: PlayerExtras(replayReactions: replayReactions, startRepeating: startRepeating,
                                        count: queueCount), onShow: { shown in
                       if index != shown, index < posts.count { watched.insert(posts[index].key) }
                       index = shown
                       onShow(shown)
                   })
            .overlay(alignment: .top) {
                if !clean && !scrubbing {
                    HStack(spacing: 10) {
                        Button {
                            if let onClose { onClose() } else { dismiss() }
                        } label: {
                            Image(systemName: "chevron.down")
                                .font(.system(size: 18, weight: .semibold))
                                .foregroundStyle(Theme.ink)
                                .frame(width: 44, height: 44)
                                .frosted(Circle(), dim: 0.45)
                        }
                        .accessibilityLabel("Close")
                        if let group {
                            ChannelToggle(group: group)
                            Spacer(minLength: 0)
                        } else if let position, index < posts.count {
                            Text(position(index))
                                .font(Theme.sans(14, .bold))
                                .foregroundStyle(Theme.ink)
                                .lineLimit(1)
                                .padding(.horizontal, 14)
                                .frame(height: 40)
                                .frosted(Capsule(style: .continuous), dim: 0.5)
                                .accessibilityAddTraits(.updatesFrequently)
                            Spacer(minLength: 0)
                        } else {
                            Spacer(minLength: 0)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 4)
                }
            }
            .boardSheet(isPresented: $upNext, height: 640) {
                if let queue {
                    QueueSheet(posts: posts, current: index, server: server, name: queue.name, note: queue.note,
                               watched: watched, chip: queue.chip, nearEnd: onShow) { key in jumpTo = key }
                }
            }
    }

    /// "5 of 51" on the bottom row, for a queue with more than one post.
    private var queueCount: ((PhonePost) -> QueueCount?)? {
        guard let queue, posts.count > 1 else { return nil }
        return { post in
            guard let at = posts.firstIndex(where: { $0.key == post.key }) else { return nil }
            return QueueCount(text: "\(at + 1) of \(posts.count)",
                              label: "\(queue.name), \(at + 1) of \(posts.count)") { upNext = true }
        }
    }
}

/// Keeping a From everyone channel as one of yours
/// (`POST /api/app/channels/group/{slug}/keep`), and leaving it (`DELETE`).
@MainActor
final class KeepChannelModel: ObservableObject {
    let slug: String
    @Published private(set) var kept: KeptChannel?
    @Published private(set) var busy = false
    @Published var problem: String?

    init(group: GroupChannelRef) {
        slug = group.slug
        kept = group.kept
    }

    func keep() async {
        guard kept == nil, !busy, let client = Store.client() else { return }
        busy = true
        problem = nil
        defer { busy = false }
        do {
            kept = try await client.keepGroupChannel(slug).kept
        } catch let error as APIError where error.isMissing {
            problem = "Your ADHX needs an update before it can keep channels."
        } catch let error as APIError {
            problem = error.message
        } catch {
            problem = APIError.offline.message
        }
    }

    /// Leaves it: its tag comes off your saves, and saves it added go.
    func leave() async {
        guard kept != nil, !busy, let client = Store.client() else { return }
        busy = true
        problem = nil
        defer { busy = false }
        do {
            try await client.leaveGroupChannel(slug)
            kept = nil
        } catch let error as APIError where error.isMissing {
            problem = "Your ADHX needs an update before it can leave channels."
        } catch let error as APIError {
            problem = error.message
        } catch {
            problem = APIError.offline.message
        }
    }
}

/// The channel's name is the toggle (board 15.10): "+ Coding with AI" keeps
/// it as one of yours, "✓ Coding with AI" leaves it.
private struct ChannelToggle: View {
    let group: GroupChannelRef
    @StateObject private var model: KeepChannelModel
    @State private var message: String?
    @State private var messageTask: Task<Void, Never>?

    init(group: GroupChannelRef) {
        self.group = group
        _model = StateObject(wrappedValue: KeepChannelModel(group: group))
    }

    var body: some View {
        let kept = model.kept != nil
        Button {
            Task { await toggle() }
        } label: {
            HStack(spacing: 6) {
                if model.busy {
                    ProgressView().controlSize(.mini).tint(Theme.accent)
                        .frame(width: 16, height: 16)
                } else {
                    Image(systemName: kept ? "checkmark" : "plus")
                        .font(.system(size: 14, weight: .heavy))
                        .foregroundStyle(Theme.accent)
                        .frame(width: 16, height: 16)
                }
                Text(group.name)
                    .font(Theme.sans(14, .heavy))
                    .foregroundStyle(Theme.ink)
                    .lineLimit(1)
            }
            .padding(.horizontal, 14)
            .frame(height: 40)
            .frosted(Capsule(style: .continuous), dim: 0.45)
            .overlay(Capsule(style: .continuous).strokeBorder(.white.opacity(0.14), lineWidth: 1))
            .contentShape(Capsule(style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(model.busy)
        .accessibilityLabel(group.name)
        .accessibilityValue(kept ? "Kept" : "Not kept")
        .accessibilityHint(kept ? "Leave this channel" : "Keep this channel")
        // Under the name, without moving the bar.
        .overlay(alignment: .topLeading) {
            if let text = model.problem ?? message {
                HStack(spacing: 8) {
                    if model.problem == nil {
                        Image(systemName: "checkmark").font(.system(size: 13, weight: .heavy))
                    }
                    Text(text)
                }
                .font(Theme.sans(14, .heavy))
                .foregroundStyle(.black)
                .padding(.horizontal, 16)
                .frame(minHeight: 40)
                .background(Capsule(style: .continuous).fill(Theme.cream))
                .fixedSize()
                .offset(y: 50)
                .onTapGesture { model.problem = nil; message = nil }
                .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.2), value: message)
        .animation(.easeInOut(duration: 0.2), value: model.problem)
    }

    private func toggle() async {
        let wasKept = model.kept != nil
        if wasKept { await model.leave() } else { await model.keep() }
        guard model.problem == nil, (model.kept != nil) != wasKept else { return }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        show(wasKept ? "Left" : "Kept · in your channels")
    }

    private func show(_ text: String) {
        messageTask?.cancel()
        message = text
        UIAccessibility.post(notification: .announcement, argument: text)
        messageTask = Task {
            try? await Task.sleep(nanoseconds: 2_500_000_000)
            guard !Task.isCancelled else { return }
            message = nil
        }
    }
}

/// Everyone's saves · Mine.
private struct ScopeSwitch: View {
    @Binding var scope: SearchScope

    var body: some View {
        HStack(spacing: 4) {
            option(.everyone, "Everyone’s saves")
            option(.mine, "Mine")
        }
        .padding(4)
        .background(Capsule(style: .continuous).fill(Theme.surface))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Whose saves")
    }

    private func option(_ value: SearchScope, _ title: String) -> some View {
        let on = scope == value
        return Button { scope = value } label: {
            Text(title)
                .font(Theme.sans(14, on ? .heavy : .semibold))
                .foregroundStyle(on ? Theme.onCream : Theme.ink)
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(Capsule(style: .continuous).fill(on ? Theme.cream : .clear))
                .contentShape(Capsule(style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

/// A post as a poster in a grid (search, a friend's channel), like the
/// boards: a frosted chip for where it matched (or its network), a match
/// meter, its first words, and who saved it.
struct PostTile: View {
    let post: PhonePost
    let server: URL
    /// In someone's channel: leave them out of the faces ("You and Ben too").
    var hiddenSaver: String?
    /// A fixed height (search's rows); nil for the poster's own shape.
    var height: CGFloat?
    @ObservedObject private var privacy = PrivacyStore.shared

    private var shownSavers: [Saver] {
        post.savers.filter { $0.username != hiddenSaver }
    }

    private var saversLine: String? {
        let savers = shownSavers
        guard !savers.isEmpty else { return nil }
        let who = SaverWords.who(savers)
        if hiddenSaver != nil { return "\(who) too" }
        return post.match == nil ? who : "\(who) · \(Network.name(post.platform))"
    }

    /// The strongest place it matched: speech, screen, picture, video, words.
    static func lead(_ post: PhonePost) -> String? {
        guard let on = post.match?.on else { return nil }
        return ["speech", "screen", "picture", "video", "words", "keywords"].first(where: on.contains)
    }

    /// "On screen", "Said in the video", "In the words", "Related"; else the network.
    private var chip: String { Self.matchLabel(post) ?? Network.name(post.platform) }

    /// How a search matched it, or nil outside a search.
    static func matchLabel(_ post: PhonePost) -> String? {
        guard let match = post.match else { return nil }
        if match.strength == "related" { return "Related" }
        switch lead(post) {
        case "speech": return "Said in the video"
        case "screen": return "On screen"
        case "picture": return "In the picture"
        case "video": return "In the video"
        default: return "In the words"
        }
    }

    /// Said or written in it: the words go in quotes, like the boards.
    private var title: String {
        let words = (post.article?.title ?? post.text)
            .split(separator: "\n", omittingEmptySubsequences: true).first.map(String.init) ?? ""
        let lead = Self.lead(post)
        return (lead == "screen" || lead == "speech") && !words.isEmpty ? "“\(words)”" : words
    }

    /// The poster's shape, kept between square and tall.
    private var aspect: CGFloat {
        guard let media = post.media.first, let w = media.width, let h = media.height, w > 0, h > 0 else {
            return 0.75
        }
        return min(max(CGFloat(w) / CGFloat(h), 0.6), 1)
    }

    /// No picture to show: the words are the tile (a cream card, like the web's).
    private var isWords: Bool {
        ADHXClient.resolve(post.posterUrl, against: server) == nil
    }

    var body: some View {
        if isWords {
            wordsTile
        } else {
            posterTile
        }
    }

    /// The boards' text tile: who wrote it and how close it is on top, the
    /// words big in the serif, who saved it at the bottom. Nothing sits on
    /// the words.
    private var wordsTile: some View {
        shape(Theme.cream)
            .overlay {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 8) {
                        Text(chip)
                            .font(Theme.sans(10, .heavy))
                            .foregroundStyle(Theme.cream)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Capsule(style: .continuous).fill(Theme.onCream))
                            .fixedSize()
                        Spacer(minLength: 0)
                        if privacy.isPrivate(post) {
                            PrivateLock(size: 22)
                        } else if post.isNew == true {
                            Text("New")
                                .font(Theme.sans(10, .heavy))
                                .foregroundStyle(.black)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(Capsule(style: .continuous).fill(Theme.accent))
                        } else if let strength = post.match?.strength {
                            MatchMeter(level: strength == "strong" ? 3 : strength == "good" ? 2 : 1, onCream: true)
                        }
                    }
                    Text(post.article?.title ?? post.text)
                        .font(Theme.serif(wordsSize))
                        .foregroundStyle(Theme.onCream)
                        .lineSpacing(1)
                        .lineLimit(7)
                        .multilineTextAlignment(.leading)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Spacer(minLength: 0)
                    HStack(spacing: 6) {
                        if !shownSavers.isEmpty {
                            FaceStack(savers: shownSavers, server: server, size: 18, ring: Theme.cream)
                        }
                        Text(saversLine ?? authorLine)
                            .font(Theme.sans(11, .bold))
                            .foregroundStyle(Theme.onCream)
                            .lineLimit(1)
                    }
                }
                .padding(12)
            }
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay {
                if post.match?.strength == "strong" && chip != "Related" {
                    RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Theme.accent, lineWidth: 2)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(accessibilityText)
            .accessibilityAddTraits(.isButton)
    }

    /// Short posts big, long ones smaller (the web's sizes).
    private var wordsSize: CGFloat {
        let count = (post.article?.title ?? post.text).count
        return count < 60 ? 24 : count < 140 ? 19 : 16
    }

    /// "@ana · X" when nobody you know saved it.
    private var authorLine: String {
        let handle = post.author.handle.isEmpty ? "" : (post.author.handle.hasPrefix("@") ? post.author.handle : "@\(post.author.handle)")
        return handle.isEmpty ? Network.name(post.platform) : "\(handle) · \(Network.name(post.platform))"
    }

    private var posterTile: some View {
        // The tile's shape sets its size; the picture only fills it. (A
        // filled image as the base would widen the tile past its column.)
        shape(Theme.surface)
            .overlay {
                if let poster = ADHXClient.resolve(post.posterUrl, against: server) {
                    AsyncImage(url: poster) { phase in
                        if let image = phase.image {
                            image.resizable().scaledToFill()
                        } else if phase.error != nil {
                            words
                        } else {
                            Theme.surface
                        }
                    }
                } else {
                    words
                }
            }
            .overlay {
                LinearGradient(stops: [.init(color: .clear, location: 0.45), .init(color: .black.opacity(0.9), location: 1)],
                               startPoint: .top, endPoint: .bottom)
            }
            .overlay(alignment: .topLeading) {
                let strong = post.match?.strength == "strong" && chip != "Related"
                Text(chip)
                    .font(Theme.sans(10, .heavy))
                    .foregroundStyle(strong ? .black : .white)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background {
                        if strong { Capsule(style: .continuous).fill(Theme.accent) } else { Color.clear.frosted(Capsule(style: .continuous), dim: 0.55) }
                    }
                    .padding(8)
            }
            .overlay(alignment: .topTrailing) {
                if privacy.isPrivate(post) {
                    PrivateLock(size: 24).padding(8)
                } else if post.isNew == true {
                    // In a channel: you haven't saved or seen it.
                    Text("New")
                        .font(Theme.sans(10, .heavy))
                        .foregroundStyle(.black)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Capsule(style: .continuous).fill(Theme.accent))
                        .padding(8)
                } else if let strength = post.match?.strength {
                    MatchMeter(level: strength == "strong" ? 3 : strength == "good" ? 2 : 1)
                        .padding(8)
                }
            }
            .overlay(alignment: .bottomLeading) {
                VStack(alignment: .leading, spacing: 6) {
                    if !title.isEmpty {
                        Text(title)
                            .font(Theme.sans(13, .heavy))
                            .foregroundStyle(.white)
                            .lineSpacing(1)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                    }
                    if let saversLine {
                        HStack(spacing: 6) {
                            FaceStack(savers: shownSavers, server: server, size: 18, ring: .black)
                            Text(saversLine)
                                .font(Theme.sans(11, .semibold))
                                .foregroundStyle(.white)
                                .lineLimit(1)
                        }
                    }
                }
                .padding(10)
            }
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay {
                if post.match?.strength == "strong" && chip != "Related" {
                    RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Theme.accent, lineWidth: 2)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(accessibilityText)
            .accessibilityAddTraits(.isButton)
    }

    /// The tile's size, in its base colour.
    @ViewBuilder
    private func shape(_ colour: Color) -> some View {
        if let height {
            colour.frame(height: height)
        } else {
            colour.aspectRatio(aspect, contentMode: .fit)
        }
    }
}

/// Three little bars: how close a search result is.
private struct MatchMeter: View {
    let level: Int
    /// On the cream words card: dark bars on a soft plate instead of frost.
    var onCream = false

    var body: some View {
        HStack(alignment: .bottom, spacing: 2) {
            ForEach(0..<3) { index in
                RoundedRectangle(cornerRadius: 2, style: .continuous)
                    .fill(index < level ? (onCream ? Theme.onCream : Theme.accent)
                          : (onCream ? Theme.onCream.opacity(0.2) : .white.opacity(0.3)))
                    .frame(width: 3, height: CGFloat(6 + index * 3))
            }
        }
        .padding(.horizontal, 7)
        .padding(.vertical, 5)
        .background {
            if onCream { Capsule(style: .continuous).fill(Theme.onCream.opacity(0.08)) } else { Color.clear.frosted(Capsule(style: .continuous), dim: 0.55) }
        }
        .accessibilityHidden(true)
    }
}

extension PostTile {
    fileprivate var accessibilityText: String {
        var parts = [Network.name(post.platform), post.author.handle]
        if let saversLine { parts.append(saversLine) }
        if privacy.isPrivate(post) { parts.append("just for me") } else if post.isNew == true { parts.append("new to you") }
        parts.append(post.article?.title ?? post.text)
        return parts.joined(separator: ", ")
    }

    /// A post with no picture (or one that won't load) shows its words.
    fileprivate var words: some View {
        Text(post.article?.title ?? post.text)
            .font(Theme.sans(13))
            .foregroundStyle(Theme.cream)
            .lineLimit(5)
            .padding(.horizontal, 12)
            // Under the chip and the meter, never behind them.
            .padding(.top, 42)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

private struct Note: View {
    let text: String
    var body: some View {
        Text(text)
            .font(Theme.sans(14))
            .foregroundStyle(Theme.inkSoft)
            .fixedSize(horizontal: false, vertical: true)
    }
}
