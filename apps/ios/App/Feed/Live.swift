import SwiftUI
import UIKit

/// Live (`/api/app/live`): moments your lot are saving into right now.
@MainActor
final class LiveModel: ObservableObject {
    @Published private(set) var moments: [LiveMoment] = []
    @Published private(set) var loadedOnce = false
    @Published private(set) var loadError: String?
    @Published private(set) var unsupported = false

    var onBadKey: () -> Void = {}
    var anyLive: Bool { moments.contains(where: \.live) }

    func reload() async {
        guard let client = Store.client() else { return }
        do {
            moments = try await client.live()
            loadError = nil
            unsupported = false
            KnownPeople.remember(moments.flatMap(\.savers))
        } catch APIError.badKey {
            onBadKey()
        } catch is CancellationError {
            return
        } catch let error as APIError where error.isMissing {
            unsupported = true
        } catch let error as APIError {
            loadError = error.message
        } catch {
            loadError = APIError.offline.message
        }
        loadedOnce = true
    }

    /// Looks again every 20 s while the list is on screen.
    func follow() async {
        while !Task.isCancelled {
            try? await Task.sleep(nanoseconds: 20_000_000_000)
            guard !Task.isCancelled else { return }
            await reload()
        }
    }

}

struct LiveView: View {
    @ObservedObject var model: LiveModel
    let server: URL
    @State private var tuned: LiveMoment?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if !model.loadedOnce {
                    HStack { Spacer(); RingSpinner(size: 34, lineWidth: 3); Spacer() }
                        .padding(.top, 60)
                } else if model.unsupported {
                    EmptyNote(title: "Live isn’t here yet",
                              message: "Your ADHX needs an update before it can show what your lot are into right now.")
                } else if let error = model.loadError, model.moments.isEmpty {
                    EmptyNote(title: "Can’t see what’s live", message: error) {
                        Task { await model.reload() }
                    }
                } else if model.moments.isEmpty {
                    EmptyNote(title: "Nothing’s live right now",
                              message: "When a few of your lot save around the same thing, it shows up here.")
                } else {
                    Text("What your lot are into tonight")
                        .font(Theme.serif(36))
                        .foregroundStyle(.white)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.isHeader)
                        .padding(.horizontal, 16)
                    ForEach(model.moments) { moment in
                        if moment.live {
                            LiveCard(moment: moment, server: server) { tuned = moment }
                        } else {
                            QuietMomentRow(moment: moment, server: server) { tuned = moment }
                        }
                    }
                    .padding(.horizontal, 16)
                }
            }
            .padding(.top, 12)
            .padding(.bottom, 40)
        }
        .scrollIndicators(.hidden)
        .refreshable { await model.reload() }
        .task { await model.follow() }
        .fullScreenCover(item: $tuned) { moment in
            TunedInScreen(moment: moment, server: server)
        }
    }
}

/// The red LIVE mark: a dot with soft rings (still under Reduce Motion).
struct LiveBadge: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var glow = false

    var body: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(Theme.live)
                .frame(width: 8, height: 8)
                .background(Circle().fill(Theme.live.opacity(glow ? 0.35 : 0.15)).frame(width: 18, height: 18))
            Text("LIVE")
                .font(Theme.sans(12, .heavy))
                .tracking(1)
                .foregroundStyle(.white)
        }
        .padding(.leading, 11)
        .padding(.trailing, 12)
        .frame(height: 32)
        .background(Capsule().fill(.black.opacity(0.55)))
        .overlay(Capsule().strokeBorder(Theme.live.opacity(0.5), lineWidth: 1))
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 1).repeatForever(autoreverses: true)) { glow = true }
        }
        .accessibilityElement()
        .accessibilityLabel("Live")
    }
}

private struct LiveCard: View {
    let moment: LiveMoment
    let server: URL
    let tuneIn: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Mosaic(covers: moment.covers, server: server)
                .frame(height: 220)
                .overlay(alignment: .topLeading) { LiveBadge().padding(10) }
                .overlay(alignment: .bottomLeading) {
                    if let watching = watchingLine {
                        HStack(spacing: 7) {
                            if !moment.watchers.isEmpty {
                                FaceStack(savers: moment.watchers, server: server, size: 24, ring: .black)
                            }
                            Text(watching)
                                .font(Theme.sans(13, .heavy))
                                .foregroundStyle(.white)
                        }
                        .padding(.leading, 4)
                        .padding(.trailing, 12)
                        .frame(minHeight: 32)
                        .background(Capsule().fill(.black.opacity(0.55)))
                        .padding(10)
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            VStack(alignment: .leading, spacing: 6) {
                Text(moment.name)
                    .font(Theme.serif(32))
                    .foregroundStyle(.white)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                if !metaLine.isEmpty {
                    HStack(spacing: 7) {
                        if !moment.savers.isEmpty {
                            FaceStack(savers: moment.savers, server: server, size: 20, ring: Theme.surface)
                        }
                        Text(metaLine)
                            .font(Theme.sans(13))
                            .foregroundStyle(Theme.muted)
                            .lineLimit(2)
                    }
                    .accessibilityElement(children: .combine)
                }
            }
            .padding(.horizontal, 6)
            Button(action: tuneIn) {
                Label("Tune in", systemImage: "play.fill")
            }
            .buttonStyle(PillButtonStyle(kind: .primary))
            .accessibilityLabel("Tune in to \(moment.name)")
        }
        .padding(8)
        .background(RoundedRectangle(cornerRadius: 26, style: .continuous).fill(Theme.surface))
        .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous)
            .strokeBorder(Theme.hue(moment.hue) ?? Theme.live.opacity(0.6), lineWidth: 2))
    }

    /// "3 of you watching".
    private var watchingLine: String? {
        let count = max(moment.watching ?? 0, moment.watchers.count)
        guard count > 0 else { return nil }
        return count == 1 ? "1 watching" : "\(count) of you watching"
    }

    /// "3 saves · Ana, Ben and Jo".
    private var metaLine: String {
        var parts: [String] = []
        if let posts = moment.posts { parts.append(posts == 1 ? "1 save" : "\(posts) saves") }
        if !moment.savers.isEmpty {
            parts.append(SaverWords.names(SaverWords.ordered(moment.savers).map(\.displayName)))
        } else if let people = moment.people, people > 0 {
            parts.append(people == 1 ? "1 person" : "\(people) people")
        }
        return parts.joined(separator: " · ")
    }
}

/// A moment that isn't live now (a few days old, or still forming).
private struct QuietMomentRow: View {
    let moment: LiveMoment
    let server: URL
    let play: () -> Void

    var body: some View {
        HStack(spacing: 14) {
            CoverImage(url: ADHXClient.resolve(moment.covers.first, against: server))
                .frame(width: 72, height: 96)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            VStack(alignment: .leading, spacing: 5) {
                if let label = moment.label {
                    Text(label)
                        .font(Theme.sans(12, .bold))
                        .foregroundStyle(Theme.faint)
                }
                Text(moment.name)
                    .font(Theme.serif(26))
                    .foregroundStyle(.white)
                    .lineLimit(2)
                if !moment.savers.isEmpty {
                    HStack(spacing: 6) {
                        FaceStack(savers: moment.savers, server: server, size: 20, ring: Theme.surface)
                        Text(SaverWords.who(moment.savers))
                            .font(Theme.sans(13))
                            .foregroundStyle(Theme.muted)
                            .lineLimit(1)
                    }
                }
            }
            Spacer(minLength: 0)
            Button(action: play) {
                Image(systemName: "play.fill")
                    .font(.system(size: 15))
                    .foregroundStyle(.black)
                    .frame(width: 48, height: 48)
                    .background(Circle().fill(Theme.accent))
            }
            .accessibilityLabel("Play \(moment.name)")
        }
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(Theme.surface))
    }
}

// MARK: - Tuned in

/// One moment, tuned in (`/api/app/live/{slug}`, every 5 s): who else is
/// watching, new saves slotted in up next, and reactions floating up.
@MainActor
final class TunedInModel: ObservableObject {
    let slug: String
    @Published private(set) var moment: LiveMoment
    @Published private(set) var items: [PhonePost] = []
    @Published private(set) var watchers: [Saver] = []
    @Published private(set) var loadedOnce = false
    @Published private(set) var gone = false
    /// "Jo just saved one", for a few seconds after a new save lands.
    @Published private(set) var arrival: Saver?
    @Published var currentIndex = 0
    /// Reactions on their way up the screen (yours at once, others' from the poll).
    @Published private(set) var floating: [FloatingReaction] = []
    private var arrivalTask: Task<Void, Never>?
    /// Reactions already shown (or already old when you tuned in).
    private var shownReactions = Set<String>()

    init(moment: LiveMoment) {
        slug = moment.slug
        self.moment = moment
        watchers = moment.watchers
    }

    var current: PhonePost? { currentIndex < items.count ? items[currentIndex] : nil }

    /// People watching besides you.
    var others: [Saver] { watchers.filter { !$0.isYou } }

    func follow() async {
        while !Task.isCancelled {
            await refresh()
            try? await Task.sleep(nanoseconds: 5_000_000_000)
        }
    }

    func refresh() async {
        guard let client = Store.client() else { return }
        do {
            let detail = try await client.live(slug: slug)
            guard !Task.isCancelled else { return }
            if let moment = detail.moment { self.moment = moment }
            watchers = detail.watchers
            let first = !loadedOnce
            merge(detail.items)
            take(detail.reactions, quietly: first)
            gone = false
        } catch let error as APIError where error.isMissing {
            gone = true
        } catch {
            // Keep what's on screen; look again next time.
        }
        loadedOnce = true
    }

    /// New saves go right after the one on screen ("up next").
    private func merge(_ fresh: [PhonePost]) {
        guard loadedOnce, !items.isEmpty else {
            items = fresh
            return
        }
        let have = Set(items.map(\.key))
        let new = fresh.filter { !have.contains($0.key) }
        guard !new.isEmpty else { return }
        let at = min(currentIndex + 1, items.count)
        items.insert(contentsOf: new, at: at)
        if let saver = new.first?.savers.first(where: { !$0.isYou }) {
            arrival = saver
            arrivalTask?.cancel()
            arrivalTask = Task { [weak self] in
                try? await Task.sleep(nanoseconds: 4_000_000_000)
                guard !Task.isCancelled else { return }
                self?.arrival = nil
            }
        }
    }

    /// Others' reactions from the poll float up; the ones already there when
    /// you tuned in don't. Yours floated when you sent them.
    private func take(_ reactions: [LiveReactionEvent], quietly: Bool) {
        for reaction in reactions where shownReactions.insert(reaction.id).inserted {
            guard !quietly, !reaction.saver.isYou else { continue }
            float(reaction)
        }
    }

    private func float(_ reaction: LiveReactionEvent) {
        let item = FloatingReaction(event: reaction, lane: CGFloat.random(in: 0.05...0.75))
        floating.append(item)
        if floating.count > 12 { floating.removeFirst(floating.count - 12) }
        Task { [weak self] in
            try? await Task.sleep(nanoseconds: FloatingReaction.lifeNanos)
            self?.floating.removeAll { $0.id == item.id }
        }
    }

    /// Sends an emoji or a few words about the post on screen, and floats it
    /// with your face straight away.
    func react(_ say: LiveSay, you: Saver) async -> Bool {
        guard let post = current, let client = Store.client() else { return false }
        switch say {
        case .emoji(let emoji):
            float(LiveReactionEvent(id: UUID().uuidString, saver: you, emoji: emoji, text: nil))
        case .text(let text):
            float(LiveReactionEvent(id: UUID().uuidString, saver: you, emoji: nil, text: text))
        }
        do {
            try await client.react(slug: slug, say, to: post.ref)
            return true
        } catch {
            return false
        }
    }

}

struct TunedInScreen: View {
    @StateObject private var model: TunedInModel
    let server: URL
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var clean = false
    @State private var scrubbing = false
    @State private var note: String?
    @State private var picking = false
    @State private var words = ""
    @FocusState private var typing: Bool

    init(moment: LiveMoment, server: URL) {
        _model = StateObject(wrappedValue: TunedInModel(moment: moment))
        self.server = server
    }

    var body: some View {
        ZStack(alignment: .top) {
            if !model.items.isEmpty {
                PlayerView(posts: model.items, server: server, clean: $clean, scrubbing: $scrubbing,
                           extras: PlayerExtras(bottomInset: picking ? 116 : 0, toastTop: 120,
                                                react: .init(isOpen: picking, toggle: togglePicker))) { index in
                    model.currentIndex = index
                }
            } else {
                VStack(spacing: 16) {
                    if model.loadedOnce {
                        Text(model.gone ? "This one’s over." : "Nothing in it yet.")
                            .font(Theme.serif(34))
                            .foregroundStyle(.white)
                        Text(model.gone ? "Everyone’s moved on. Plenty more in New." : "Hang on, your lot are saving.")
                            .font(Theme.sans(15))
                            .foregroundStyle(Theme.muted)
                    } else {
                        RingSpinner(size: 34, lineWidth: 3)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Theme.app.ignoresSafeArea())
            }
            FloatingReactions(reactions: model.floating, server: server)
                .padding(.top, 170)
                .padding(.trailing, 80)
                .frame(height: 470, alignment: .top)
                .allowsHitTesting(false)
            if !clean && !scrubbing {
                topBar
                if picking {
                    // From the screen's edge, but above the keyboard while typing.
                    VStack {
                        Spacer()
                        picker
                            .padding(.horizontal, 12)
                            .padding(.bottom, typing ? 8 : 30)
                    }
                    .ignoresSafeArea(.container, edges: .bottom)
                    .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
                }
            }
        }
        .background(Color.black.ignoresSafeArea())
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.25), value: model.arrival)
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: picking)
        .onChange(of: model.currentIndex) { _, _ in note = nil }
        .task { await model.follow() }
    }

    private var topBar: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                LiveBadge()
                watchersChip
                Spacer(minLength: 0)
                Button { dismiss() } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 44, height: 44)
                        .background(Circle().fill(.black.opacity(0.45)))
                }
                .accessibilityLabel("Leave live")
            }
            if let saver = model.arrival {
                HStack(spacing: 10) {
                    Face(saver: saver, server: server, size: 30, ring: .black)
                    VStack(alignment: .leading, spacing: 1) {
                        Text("\(saver.displayName) just saved one")
                            .font(Theme.sans(14, .heavy))
                            .foregroundStyle(.white)
                        Text("up next")
                            .font(Theme.sans(14))
                            .foregroundStyle(Theme.muted)
                    }
                }
                .padding(.leading, 6)
                .padding(.trailing, 14)
                .frame(minHeight: 44)
                .background(Capsule().fill(.black.opacity(0.55)))
                .transition(.opacity.combined(with: .move(edge: .top)))
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.updatesFrequently)
            }
            if let note {
                Text(note)
                    .font(Theme.sans(13, .bold))
                    .foregroundStyle(Theme.warn)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 24)
        .background(
            LinearGradient(colors: [.black.opacity(0.6), .clear], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea(edges: .top)
                .allowsHitTesting(false)
        )
    }

    /// "Ana and Ben · watching with you".
    private var watchersChip: some View {
        let others = model.others
        let names = SaverWords.names(SaverWords.ordered(others).map(\.displayName), upTo: 2)
        return HStack(spacing: 7) {
            if !others.isEmpty {
                FaceStack(savers: others, server: server, size: 26, ring: .black)
            }
            // The names when they fit; the faces say who when they don't.
            ViewThatFits(in: .horizontal) {
                if others.isEmpty {
                    Text("Just you so far")
                } else {
                    Text("\(names) · watching with you")
                    Text("watching with you")
                }
            }
            .font(Theme.sans(13, .bold))
            .foregroundStyle(.white)
            .lineLimit(1)
        }
        .padding(.leading, others.isEmpty ? 12 : 4)
        .padding(.trailing, 12)
        .frame(minHeight: 34)
        .background(Capsule().fill(.black.opacity(0.55)))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(others.isEmpty ? "Just you watching so far"
                            : SaverWords.names(others.map(\.displayName), upTo: 2) + (others.count == 1 ? " is" : " are") + " watching with you")
        .accessibilityAddTraits(.updatesFrequently)
    }

    private func togglePicker() {
        picking.toggle()
        if !picking { typing = false }
        note = nil
    }

    /// You, for your own reactions' faces.
    private var you: Saver {
        model.watchers.first(where: \.isYou)
            ?? Saver(username: Store.username ?? "you", name: nil, isYou: true)
    }

    /// Six quick emoji, and a few words to everyone watching.
    private var picker: some View {
        VStack(spacing: 10) {
            HStack(spacing: 0) {
                ForEach(LiveSay.quick, id: \.emoji) { quick in
                    Button {
                        send(.emoji(quick.emoji))
                    } label: {
                        Text(quick.emoji)
                            .font(.system(size: 26))
                            .frame(width: 48, height: 48)
                            .background(Circle().fill(Theme.raised))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(quick.name)
                    if quick.emoji != LiveSay.quick.last?.emoji { Spacer(minLength: 4) }
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Quick reactions")
            HStack(spacing: 8) {
                TextField("", text: $words,
                          prompt: Text("Say something to everyone watching").foregroundColor(Theme.faint))
                    .font(Theme.sans(15))
                    .foregroundStyle(Theme.cream)
                    .focused($typing)
                    .submitLabel(.send)
                    .onSubmit(sendWords)
                    .onChange(of: words) { _, text in
                        if text.count > LiveSay.maxText { words = String(text.prefix(LiveSay.maxText)) }
                    }
                    .padding(.horizontal, 16)
                    .frame(height: 44)
                    .background(Capsule().fill(Theme.app))
                    .overlay(Capsule().strokeBorder(Theme.hairline, lineWidth: 1))
                    .accessibilityLabel("Say something")
                    .accessibilityHint("Up to \(LiveSay.maxText) characters, to everyone watching")
                Button("Send", action: sendWords)
                    .buttonStyle(PillButtonStyle(kind: .primary, height: 44, fullWidth: false))
                    .disabled(words.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            if let note {
                Text(note)
                    .font(Theme.sans(13, .bold))
                    .foregroundStyle(Theme.warn)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(12)
        .background {
            let shape = RoundedRectangle(cornerRadius: 26, style: .continuous)
            shape.fill(.ultraThinMaterial)
                .overlay(shape.fill(Theme.surface.opacity(0.75)))
                .overlay(shape.strokeBorder(.white.opacity(0.1), lineWidth: 1))
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("React")
    }

    private func sendWords() {
        let text = words.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        words = ""
        typing = false
        picking = false
        send(.text(text))
    }

    private func send(_ say: LiveSay) {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        note = nil
        Task {
            if await model.react(say, you: you) == false { note = "Couldn’t send that. Try again." }
        }
    }

}

// MARK: - Floating reactions

/// One reaction on its way up the screen.
struct FloatingReaction: Identifiable, Equatable {
    let id = UUID()
    let event: LiveReactionEvent
    /// Where across the screen it rises, 0…1.
    let lane: CGFloat
    /// The face is the main thing: 44–56 pt.
    var size: CGFloat = .random(in: 44...56)

    static let lifeNanos: UInt64 = 3_600_000_000
}

/// Reactions rising and fading, each with the face of who sent it. Under
/// Reduce Motion they stay put and just fade.
private struct FloatingReactions: View {
    let reactions: [FloatingReaction]
    let server: URL
    @State private var lastSpoken = Date.distantPast

    var body: some View {
        GeometryReader { box in
            ZStack(alignment: .bottomLeading) {
                ForEach(reactions) { reaction in
                    Bubble(reaction: reaction, server: server, rise: box.size.height * 0.8)
                        .offset(x: reaction.lane * max(box.size.width - 120, 0))
                }
            }
            .frame(width: box.size.width, height: box.size.height, alignment: .bottomLeading)
        }
        .accessibilityHidden(true)
        .onChange(of: reactions.last?.id) { _, _ in announce() }
    }

    /// VoiceOver hears them, but not a flood of them.
    private func announce() {
        guard UIAccessibility.isVoiceOverRunning, let last = reactions.last,
              Date().timeIntervalSince(lastSpoken) > 3 else { return }
        lastSpoken = Date()
        let what = last.event.text ?? LiveSay.quick.first(where: { $0.emoji == last.event.emoji })?.name
            ?? last.event.emoji ?? ""
        UIAccessibility.post(notification: .announcement, argument: "\(last.event.saver.displayName): \(what)")
    }

    private struct Bubble: View {
        let reaction: FloatingReaction
        let server: URL
        let rise: CGFloat
        @Environment(\.accessibilityReduceMotion) private var reduceMotion
        @State private var up = false

        var body: some View {
            content
                .offset(y: up && !reduceMotion ? -rise : 0)
                .scaleEffect(up && !reduceMotion ? 1 : 0.85, anchor: .bottomLeading)
                .opacity(up ? 0 : 1)
                .onAppear {
                    let seconds = Double(FloatingReaction.lifeNanos) / 1_000_000_000 - 0.2
                    withAnimation(reduceMotion ? .easeIn(duration: seconds).delay(0) : .easeOut(duration: seconds)) {
                        up = true
                    }
                }
        }

        /// Their face, ringed in their colour (a black gap, then the colour).
        private func ringedFace(_ size: CGFloat) -> some View {
            let saver = reaction.event.saver
            return Face(saver: saver, server: server, size: size, ring: .clear)
                .padding(3)
                .background(GobShape().fill(.black))
                .padding(2)
                .background(GobShape().fill(Face.colour(for: saver.username)))
        }

        @ViewBuilder
        private var content: some View {
            let saver = reaction.event.saver
            if let text = reaction.event.text {
                // The face, and a speech bubble in their colour with its tail at the face.
                HStack(alignment: .bottom, spacing: 6) {
                    ringedFace(44)
                    Text(text)
                        .font(Theme.sans(14, .bold))
                        .foregroundStyle(.black)
                        .lineLimit(1)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(
                            UnevenRoundedRectangle(topLeadingRadius: 16, bottomLeadingRadius: 4,
                                                   bottomTrailingRadius: 16, topTrailingRadius: 16,
                                                   style: .continuous)
                                .fill(Face.colour(for: saver.username))
                        )
                        .padding(.bottom, 18)
                }
                .fixedSize()
            } else if let emoji = reaction.event.emoji {
                // The face first; the emoji is a sticker on its corner.
                ringedFace(reaction.size)
                    .overlay(alignment: .bottomTrailing) {
                        Text(emoji)
                            .font(.system(size: reaction.size * 0.6))
                            .offset(x: reaction.size * 0.27, y: reaction.size * 0.22)
                    }
                    .fixedSize()
            }
        }
    }
}
